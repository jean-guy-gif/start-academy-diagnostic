import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  getTokenIdByRaw,
  incrementTokenUse,
  validatePublicToken,
} from "@/lib/public-access/public-token-service";
import {
  normalizeEmailForPath,
  parseDocumentCategory,
  safeFileName,
  validateFileUpload,
} from "@/lib/documents/document-types";
import { createActivityLog } from "@/lib/activity/activity-log-service";

export const runtime = "nodejs";

const STORAGE_BUCKET = "session-documents";

/**
 * Upload public d'une pièce dans le bucket `session-documents`.
 *
 * Sécurité :
 *   - Caller anon, donc on valide le token AVANT toute opération.
 *   - access_type doit être `participant_collect` — les autres types
 *     ne peuvent pas uploader (ex : un lien dirigeant ne déclenche
 *     pas d'écriture côté pièces).
 *   - L'upload utilise `service_role`. Le bucket est privé : aucun
 *     fichier n'est accessible publiquement.
 *   - Validation stricte : MIME whitelist, extension cohérente, taille
 *     limitée. Tout fichier hors whitelist est rejeté avant upload.
 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Form-data invalide." },
      { status: 400 }
    );
  }

  const token = (form.get("token") as string | null)?.trim();
  const participantEmail = (
    (form.get("participantEmail") as string | null) ?? ""
  ).trim();
  const rawCategory = (form.get("documentCategory") as string | null) ?? "";
  const file = form.get("file");

  if (!token || token.length < 16) {
    return NextResponse.json(
      { ok: false, error: "Token manquant ou trop court." },
      { status: 400 }
    );
  }
  if (!participantEmail || !participantEmail.includes("@")) {
    return NextResponse.json(
      { ok: false, error: "Email participant manquant ou invalide." },
      { status: 400 }
    );
  }

  const category = parseDocumentCategory(rawCategory);
  if (!category) {
    return NextResponse.json(
      { ok: false, error: "Catégorie de document inconnue." },
      { status: 400 }
    );
  }

  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "Fichier manquant." },
      { status: 400 }
    );
  }

  const validation = validateFileUpload({
    size: file.size,
    type: file.type,
    name: file.name,
  });
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: validation.message, reason: validation.reason },
      { status: 400 }
    );
  }

  // Validation du token APRÈS la validation cheap (taille / MIME) pour
  // ne pas faire de roundtrip DB si le fichier est de toute façon
  // refusé. Mais AVANT toute écriture.
  const tokenValidation = await validatePublicToken(token);
  if (!tokenValidation.valid) {
    return NextResponse.json(
      { ok: false, error: "Lien invalide.", reason: tokenValidation.reason },
      { status: 403 }
    );
  }
  if (tokenValidation.accessType !== "participant_collect") {
    return NextResponse.json(
      { ok: false, error: "Ce lien ne permet pas le dépôt de pièces." },
      { status: 403 }
    );
  }

  const client = createSupabaseAdminClient();
  if (!client) {
    return NextResponse.json(
      {
        ok: false,
        error: "Persistance indisponible : service_role non configuré.",
      },
      { status: 503 }
    );
  }

  // Cherche le participant correspondant à cet email dans cette
  // session pour lier le document. Si absent (cas rare : upload sans
  // soumission formulaire préalable), on laisse `participant_id = null`.
  let participantId: string | null = null;
  const { data: participantRow } = await client
    .from("session_participants")
    .select("id")
    .eq("session_id", tokenValidation.sessionId)
    .eq("email", participantEmail)
    .maybeSingle();
  if (participantRow) participantId = participantRow.id;

  // Construction du chemin storage :
  //   sessions/{sessionId}/participants/{emailNormalized}/{timestamp}-{safeName}{ext}
  const emailPath = normalizeEmailForPath(participantEmail);
  const ts = Date.now();
  const safeName = safeFileName(file.name);
  const storagePath = `sessions/${tokenValidation.sessionId}/participants/${emailPath}/${ts}-${safeName}`;

  // Upload via service_role. Le bucket est privé — aucun accès anon.
  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await client.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) {
    return NextResponse.json(
      {
        ok: false,
        error: `Stockage refusé : ${uploadError.message}`,
      },
      { status: 500 }
    );
  }

  const { data: documentRow, error: insertError } = await client
    .from("session_documents")
    .insert({
      session_id: tokenValidation.sessionId,
      participant_id: participantId,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      storage_path: storagePath,
      document_category: category,
      metadata: {
        submitted_via: "public_link",
        participant_email: participantEmail,
      } as never,
    })
    .select("id, file_name, document_category, created_at")
    .single();

  if (insertError || !documentRow) {
    // Best-effort cleanup : on retire le blob orphelin si l'INSERT
    // échoue. On ignore une éventuelle erreur de remove — l'INSERT
    // étant déjà l'erreur prioritaire.
    await client.storage.from(STORAGE_BUCKET).remove([storagePath]);
    return NextResponse.json(
      {
        ok: false,
        error: insertError?.message ?? "Erreur d'enregistrement du document.",
      },
      { status: 500 }
    );
  }

  // Increment best-effort. On NE fait PAS bloquer la réponse dessus.
  const tokenId = await getTokenIdByRaw(token);
  if (tokenId) {
    incrementTokenUse(tokenId).catch(() => {
      /* logging silencieux */
    });
  }

  // Journal d'activité — actor anon (participant). On NE LOGGE PAS
  // le contenu du fichier ni son chemin storage exact (pourrait
  // permettre un guessing si jamais le bucket changeait de policy).
  // On logge juste : catégorie, type MIME, taille — suffisant pour le
  // suivi côté Start Academy.
  createActivityLog({
    eventType: "document_uploaded",
    sessionId: tokenValidation.sessionId,
    actorId: null,
    actorName: participantEmail.split("@")[0] ?? null,
    actorRole: null,
    entityType: "session_document",
    entityId: documentRow.id,
    metadata: {
      submittedVia: "public_link",
      documentCategory: documentRow.document_category,
      fileType: file.type,
      fileSize: file.size,
      participantLinked: participantId !== null,
    },
  }).catch(() => {
    /* log déjà silencieux côté service */
  });

  return NextResponse.json({
    ok: true,
    document: {
      id: documentRow.id,
      fileName: documentRow.file_name,
      category: documentRow.document_category,
      createdAt: documentRow.created_at,
    },
  });
}
