/**
 * Catégories de documents acceptées par la collecte publique et la
 * fiche session interne. Module sans dépendance — importable côté
 * client comme serveur.
 */

export const DOCUMENT_CATEGORIES = [
  "cni",
  "rib",
  "cfp_urssaf",
  "support_actuel",
  "cas_client",
  "export_crm",
  "statistiques",
  "autre",
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export function parseDocumentCategory(
  value: unknown
): DocumentCategory | null {
  if (typeof value !== "string") return null;
  return (DOCUMENT_CATEGORIES as readonly string[]).includes(value)
    ? (value as DocumentCategory)
    : null;
}

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  cni: "Carte d'identité",
  rib: "RIB",
  cfp_urssaf: "Attestation CFP / URSSAF",
  support_actuel: "Support actuel",
  cas_client: "Cas client",
  export_crm: "Export CRM",
  statistiques: "Statistiques commerciales",
  autre: "Autre document",
};

export function formatDocumentCategory(
  category: string | null | undefined
): string {
  if (!category) return "Document";
  const parsed = parseDocumentCategory(category);
  return parsed ? CATEGORY_LABELS[parsed] : category;
}

/**
 * Liste blanche MIME + extensions. Tout ce qui n'est pas listé est
 * refusé côté serveur (validation `validateFileUpload`). On reste
 * volontairement étroit pour limiter la surface (pas de SVG / pas de
 * scripts exécutables).
 */
export const ALLOWED_MIME_TYPES: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
  "text/csv": [".csv"],
  "text/plain": [".txt"],
};

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface FileValidationOk {
  ok: true;
  extension: string;
}
export interface FileValidationError {
  ok: false;
  reason:
    | "too_large"
    | "empty"
    | "mime_not_allowed"
    | "extension_not_allowed"
    | "no_filename";
  message: string;
}
export type FileValidationResult = FileValidationOk | FileValidationError;

/**
 * Validation pure utilisable côté client (preview) ET côté serveur
 * (autorité finale). Vérifie :
 *  - taille > 0 et ≤ MAX_FILE_SIZE_BYTES
 *  - MIME type dans la liste blanche
 *  - extension cohérente avec le MIME
 */
export function validateFileUpload(file: {
  size: number;
  type: string;
  name: string;
}): FileValidationResult {
  if (!file.name) {
    return {
      ok: false,
      reason: "no_filename",
      message: "Nom de fichier manquant.",
    };
  }
  if (file.size === 0) {
    return {
      ok: false,
      reason: "empty",
      message: "Fichier vide.",
    };
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return {
      ok: false,
      reason: "too_large",
      message: `Fichier trop volumineux (max ${Math.round(
        MAX_FILE_SIZE_BYTES / (1024 * 1024)
      )} Mo).`,
    };
  }
  const allowedExtensions = ALLOWED_MIME_TYPES[file.type];
  if (!allowedExtensions) {
    return {
      ok: false,
      reason: "mime_not_allowed",
      message: `Format non accepté (${file.type || "inconnu"}).`,
    };
  }
  const lowerName = file.name.toLowerCase();
  const extension = allowedExtensions.find((ext) => lowerName.endsWith(ext));
  if (!extension) {
    return {
      ok: false,
      reason: "extension_not_allowed",
      message: "Extension de fichier non autorisée.",
    };
  }
  return { ok: true, extension };
}

/**
 * Normalise un nom de fichier pour le chemin storage : retire
 * caractères dangereux, garde latin de base + tiret + point.
 */
export function safeFileName(name: string): string {
  const trimmed = name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/_+/g, "_");
  // Évite les noms vides après normalisation.
  return trimmed.length > 0 ? trimmed.slice(0, 100) : "document";
}

/**
 * Normalise l'email pour l'inclure dans un chemin storage.
 * `jean.dupont@example.com` → `jean_dupont_at_example_com`
 */
export function normalizeEmailForPath(email: string): string {
  return email
    .toLowerCase()
    .replace("@", "_at_")
    .replace(/[^a-z0-9_.-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 80);
}
