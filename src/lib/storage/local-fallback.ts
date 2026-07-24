/**
 * Fallback localStorage — usage strictement mode local.
 *
 * Politique (chantier 2026-07-24) :
 *   Le fallback en lecture ET en écriture des services client (recommendations,
 *   sessions, training-support, designed-support) n'est autorisé QUE lorsque
 *   l'application tourne en mode local. Toute autre valeur (preprod,
 *   production, undefined) → fail-closed : aucune lecture / écriture
 *   localStorage n'est empruntée, les services renvoient une erreur explicite
 *   à la place.
 *
 * Règle unique :
 *   `NEXT_PUBLIC_APP_ENV === 'local'` OU (variable absente ET
 *   `NODE_ENV === 'development'` — dev pur sans APP_ENV configuré).
 *
 * Aucun repli sur NODE_ENV=production, aucun repli sur DISABLE_LOCAL_FALLBACK,
 * aucun repli sur "Supabase non configuré" : preprod avec Supabase KO doit
 * remonter l'erreur, pas fabriquer des données locales.
 *
 * `NEXT_PUBLIC_APP_ENV` (préfixé NEXT_PUBLIC_) est intentionnel : il DOIT être
 * visible côté navigateur pour que la porte se ferme aussi côté client.
 */
export function isLocalFallbackAllowed(): boolean {
  const appEnv = process.env.NEXT_PUBLIC_APP_ENV?.toLowerCase();
  if (appEnv === "local") return true;
  if (appEnv === undefined && process.env.NODE_ENV === "development") {
    return true;
  }
  return false;
}
