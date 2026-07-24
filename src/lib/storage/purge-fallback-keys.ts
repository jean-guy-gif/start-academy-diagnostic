/**
 * Liste exhaustive des 6 clés `sa.*.fallback.v1` utilisées par les
 * services client (recommendation, session, session-participants,
 * training-support, designed-support, diagnostic).
 *
 * Chaque nouvelle clé de fallback DOIT être ajoutée ici pour être
 * purgée automatiquement au mount root en preprod/production. Le test
 * transversal `no-ungated-localstorage.contract.test.ts` vérifie que
 * cette liste reste alignée avec les fichiers `sa.*.fallback` déclarés
 * dans `src/lib`.
 */
export const FALLBACK_KEYS: readonly string[] = [
  "sa.diagnostics.fallback.v1",
  "sa.recommendations.fallback.v1",
  "sa.sessions.fallback.v1",
  "sa.session-participants.fallback.v1",
  "sa.training-supports.fallback.v1",
  "sa.designed-supports.fallback.v1",
];

/**
 * Efface toutes les clés de fallback du localStorage. À appeler au
 * mount root **quand le fallback est interdit** (preprod / production
 * / toute valeur autre que `NEXT_PUBLIC_APP_ENV=local`) pour garantir
 * qu'aucune donnée fantôme d'une session dev/démo ne resurgisse.
 *
 * No-op côté serveur ou si le storage est indisponible.
 */
export function purgeFallbackKeys(): void {
  if (typeof window === "undefined") return;
  for (const key of FALLBACK_KEYS) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* storage indisponible — ignoré */
    }
  }
}
