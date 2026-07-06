import { NextResponse } from "next/server";
import { z } from "zod";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  getTokenIdByRaw,
  incrementTokenUse,
  validatePublicToken,
} from "@/lib/public-access/public-token-service";
import { createActivityLog } from "@/lib/activity/activity-log-service";

export const runtime = "nodejs";

const ParticipantSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email(),
  role: z.string().max(120).optional().default(""),
  estimatedLevel: z.string().max(60).optional().default(""),
  personalGoal: z.string().max(500).optional().default(""),
  mainProblem: z.string().max(500).optional().default(""),
  toolsUsed: z.array(z.string().max(120)).max(50).optional().default([]),
  concreteCase: z.string().max(2000).optional().default(""),
  // Champs administratifs (dossier prise en charge formation).
  // Tous optionnels — un collaborateur peut envoyer un formulaire
  // partiel et compléter plus tard via le même lien.
  lastDiploma: z.string().max(120).optional().default(""),
  realEstateExperienceYears: z.string().max(60).optional().default(""),
  professionalStatus: z
    .enum(["salarie", "agent_commercial_independant", "autre"])
    .nullable()
    .optional(),
});

const BodySchema = z.object({
  token: z.string().min(16).max(256),
  participant: ParticipantSchema,
});

/**
 * Route publique de soumission du formulaire participant.
 *
 * Sécurité :
 *   - Pas d'auth Supabase requise pour le caller (anon).
 *   - Le token est validé AVANT toute écriture.
 *   - access_type doit être strictement `participant_collect` —
 *     les autres types de tokens ne peuvent pas insérer ici.
 *   - L'écriture utilise service_role (jamais exposée au client),
 *     car la table `session_participants` ne possède PAS de policy
 *     anon (cf. RLS hardening plan).
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Corps JSON invalide." },
      { status: 400 }
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Payload invalide.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // 1. Validation du token.
  const validation = await validatePublicToken(parsed.data.token);
  if (!validation.valid) {
    return NextResponse.json(
      { ok: false, error: "Lien invalide.", reason: validation.reason },
      { status: 403 }
    );
  }
  if (validation.accessType !== "participant_collect") {
    return NextResponse.json(
      { ok: false, error: "Ce lien ne permet pas la collecte participant." },
      { status: 403 }
    );
  }

  // 2. Écriture via service_role. Upsert sur (session_id, email) pour
  //    gérer proprement les re-soumissions.
  const client = createSupabaseAdminClient();
  if (!client) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Persistance indisponible : Supabase service_role non configuré.",
      },
      { status: 503 }
    );
  }

  const p = parsed.data.participant;

  const { data: inserted, error: insertError } = await client
    .from("session_participants")
    .upsert(
      {
        session_id: validation.sessionId,
        first_name: p.firstName,
        last_name: p.lastName,
        email: p.email,
        role: p.role || null,
        estimated_level: p.estimatedLevel || null,
        personal_goal: p.personalGoal || null,
        main_problem: p.mainProblem || null,
        tools_used: (p.toolsUsed as unknown) as never,
        concrete_case: p.concreteCase || null,
        last_diploma: p.lastDiploma || null,
        real_estate_experience_years: p.realEstateExperienceYears || null,
        professional_status: p.professionalStatus ?? null,
        metadata: {
          submitted_via: "public_link",
          token_recipient_email: validation.recipientEmail,
        } as never,
      },
      { onConflict: "session_id,email" }
    )
    .select("id")
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      {
        ok: false,
        error: insertError?.message ?? "Erreur d'enregistrement.",
      },
      { status: 500 }
    );
  }

  // 3. Incrément used_count (best-effort — ne bloque pas la réponse).
  const tokenId = await getTokenIdByRaw(parsed.data.token);
  if (tokenId) {
    incrementTokenUse(tokenId).catch(() => {
      /* logging silencieux — l'enregistrement participant est OK */
    });
  }

  // 4. Journal d'activité — pas d'auth user ici, c'est une route
  //    publique : actor = le participant lui-même. On NE LOGGE NI
  //    production N-1 NI diplôme NI CNI/RIB — uniquement les champs
  //    d'identification déjà visibles dans le dossier interne.
  createActivityLog({
    eventType: "participant_submitted",
    sessionId: validation.sessionId,
    actorId: null,
    actorName: `${p.firstName} ${p.lastName}`.trim(),
    actorRole: null,
    entityType: "session_participant",
    entityId: inserted.id,
    metadata: {
      submittedVia: "public_link",
      hasTools: p.toolsUsed.length > 0,
      hasConcreteCase: (p.concreteCase ?? "").length > 0,
      professionalStatus: p.professionalStatus ?? null,
    },
  }).catch(() => {
    /* log déjà silencieux côté service */
  });

  return NextResponse.json({ ok: true, participantId: inserted.id });
}
