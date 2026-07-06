import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  parseDocumentCategory,
  type DocumentCategory,
} from "./document-types";

const STORAGE_BUCKET = "session-documents";

export interface SessionDocumentRecord {
  id: string;
  sessionId: string;
  participantId: string | null;
  participantName: string | null;
  participantEmail: string | null;
  fileName: string;
  fileType: string | null;
  fileSize: number | null;
  category: DocumentCategory | null;
  storagePath: string;
  createdAt: string;
}

interface DocumentRow {
  id: string;
  session_id: string;
  participant_id: string | null;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  storage_path: string;
  document_category: string | null;
  created_at: string;
}

interface ParticipantLite {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
}

/**
 * Liste les documents d'une session avec jointure participant.
 * Aucune signed URL ici — utiliser `createSignedDownloadUrl` au moment
 * où l'utilisateur clique sur « Télécharger ».
 */
export async function listSessionDocuments(
  sessionId: string
): Promise<SessionDocumentRecord[]> {
  const client = createSupabaseAdminClient();
  if (!client) return [];

  const { data: docs, error } = await client
    .from("session_documents")
    .select(
      "id, session_id, participant_id, file_name, file_type, file_size, storage_path, document_category, created_at"
    )
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false });

  if (error || !docs) return [];

  const participantIds = Array.from(
    new Set(
      (docs as DocumentRow[])
        .map((d) => d.participant_id)
        .filter((v): v is string => Boolean(v))
    )
  );
  const participantById = new Map<string, ParticipantLite>();
  if (participantIds.length > 0) {
    const { data: parts } = await client
      .from("session_participants")
      .select("id, first_name, last_name, email")
      .in("id", participantIds);
    for (const p of parts ?? []) {
      participantById.set(p.id, p);
    }
  }

  return (docs as DocumentRow[]).map((d) => {
    const part = d.participant_id
      ? participantById.get(d.participant_id) ?? null
      : null;
    return {
      id: d.id,
      sessionId: d.session_id,
      participantId: d.participant_id,
      participantName: part ? `${part.first_name} ${part.last_name}` : null,
      participantEmail: part?.email ?? null,
      fileName: d.file_name,
      fileType: d.file_type,
      fileSize: d.file_size,
      category: parseDocumentCategory(d.document_category),
      storagePath: d.storage_path,
      createdAt: d.created_at,
    };
  });
}

/**
 * Génère une signed URL courte durée (60 s par défaut) pour
 * télécharger un objet du bucket privé. Renvoie `null` en cas
 * d'échec (chemin inconnu, bucket indisponible…).
 */
export async function createSignedDownloadUrl(
  storagePath: string,
  expiresInSeconds: number = 60
): Promise<string | null> {
  const client = createSupabaseAdminClient();
  if (!client) return null;

  const { data, error } = await client.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
