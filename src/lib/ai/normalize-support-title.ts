/**
 * Normalise un titre de support de formation.
 *
 * Objectif : éviter les titres dédoublés du type
 *   « Support formateur — Parcours de formation Start Academy — Agence X »
 * sans casser les titres déjà propres.
 *
 * Règles (idempotentes — appliquer la fonction deux fois donne le
 * même résultat) :
 *   1. Trim + normalisation des séparateurs (em dash / hyphen / |).
 *   2. Split par " — " puis suppression des segments dupliqués
 *      (insensible à la casse).
 *   3. Suppression des préfixes génériques redondants quand un autre
 *      segment porte déjà l'idée :
 *        - « Support formateur » / « Support de formation » sont retirés
 *          si un autre segment contient « Parcours », « Programme »,
 *          « Formation » ou un mot signifiant.
 *        - « Parcours de formation » est retiré si « Start Academy » est
 *          déjà présent (la combinaison est redondante).
 *   4. Si `clientName` est fourni et qu'aucun segment ne le contient,
 *      l'ajouter en fin.
 *   5. Recompose avec « — » et limite douce à ~80 caractères : si plus
 *      long, on retire en priorité les segments les moins porteurs.
 *
 * Cette fonction NE modifie PAS la donnée stockée — c'est un utilitaire
 * de display / composition pour l'affichage. Les titres déjà persistés
 * en Supabase restent intacts.
 */

const SEPARATOR = " — ";

const GENERIC_PREFIXES_RX = /^(support (?:formateur|de formation|pédagogique)|programme de formation|parcours de formation)\b/i;

const START_ACADEMY_RX = /\bstart\s+academy\b/i;

function splitSegments(value: string): string[] {
  return value
    .replace(/[—–]/g, "—")
    .split(/\s*[—|]\s*/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function dedupeSegments(segments: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const segment of segments) {
    const key = segment.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(segment);
  }
  return result;
}

function stripRedundantPrefixes(segments: string[]): string[] {
  if (segments.length <= 1) return segments;
  const hasStartAcademy = segments.some((s) => START_ACADEMY_RX.test(s));

  let result = [...segments];

  // Strip leading generic prefix segment when any other segment exists,
  // SAUF si ce segment porte aussi « Start Academy » (auquel cas c'est
  // le carrying title, pas un préfixe administratif).
  while (
    result.length > 1 &&
    GENERIC_PREFIXES_RX.test(result[0]) &&
    !START_ACADEMY_RX.test(result[0])
  ) {
    result = result.slice(1);
  }

  // Si « Parcours de formation Start Academy » est suivi d'un autre
  // segment porteur (typiquement le nom client), on raccourcit en
  // « Parcours Start Academy » pour gagner en lisibilité.
  if (result.length > 1 && hasStartAcademy) {
    result = result.map((segment) =>
      segment.replace(/parcours de formation\s+/i, "Parcours ").trim()
    );
  }

  return result;
}

function ensureClientName(
  segments: string[],
  clientName: string | null | undefined
): string[] {
  if (!clientName) return segments;
  const trimmedClient = clientName.trim();
  if (!trimmedClient) return segments;
  const lower = trimmedClient.toLowerCase();
  const present = segments.some((segment) =>
    segment.toLowerCase().includes(lower)
  );
  if (present) return segments;
  return [...segments, trimmedClient];
}

function softLengthLimit(segments: string[], maxLength = 80): string[] {
  if (segments.join(SEPARATOR).length <= maxLength) return segments;
  // Trim the longest middle segment that isn't carrying the program
  // intent — we keep the first segment (program) and the last (likely
  // the client name).
  if (segments.length <= 2) return segments;
  let result = [...segments];
  while (result.join(SEPARATOR).length > maxLength && result.length > 2) {
    // remove the middle-most segment.
    const middle = Math.floor(result.length / 2);
    result = [...result.slice(0, middle), ...result.slice(middle + 1)];
  }
  return result;
}

export function normalizeSupportTitle(
  title: string | null | undefined,
  clientName?: string | null
): string {
  const safe = (title ?? "").trim();
  if (safe.length === 0) {
    return clientName?.trim() || "Programme Start Academy";
  }

  const segments = splitSegments(safe);
  const deduped = dedupeSegments(segments);
  const stripped = stripRedundantPrefixes(deduped);
  const withClient = ensureClientName(stripped, clientName);
  const limited = softLengthLimit(withClient);

  return limited.join(SEPARATOR);
}
