/**
 * Fallback localStorage — usage strictement développement / démo.
 *
 * Pourquoi ce module existe :
 * --------------------------
 * Pendant la phase MVP, les services (`recommendation-service`,
 * `training-support-service`, `designed-support-service`) tombent en
 * localStorage quand Supabase n'est pas configuré ou ne répond pas.
 *
 * Cela permet de faire tourner toute la chaîne (diagnostic →
 * recommandation → proposition → support → support designé) sans
 * backend, ce qui est précieux pour démos internes, tests
 * frontend, dev offline.
 *
 * Limites — ne PAS étendre cet usage en production :
 * --------------------------------------------------
 * - Aucune sécurité : tout user du navigateur peut lire/écrire toutes
 *   les données (pas de RLS, pas d'auth).
 * - Aucune ségrégation par utilisateur : un commercial verrait les
 *   données d'un autre commercial s'ils partagent un poste.
 * - Aucun audit, aucun log, aucune sauvegarde.
 * - Ne survit pas à un changement de navigateur, à un nettoyage
 *   cookies, à un mode privé.
 *
 * Règle d'or :
 *   - Démo / dev / pilote local → fallback OK.
 *   - Pilote client distant → Supabase OBLIGATOIRE (auth + RLS).
 *   - Production commerciale → Supabase OBLIGATOIRE + RLS durci
 *     (cf. docs/rls-hardening-plan.md).
 *
 * Pour interdire complètement le fallback en production, mettre
 * `DISABLE_LOCAL_FALLBACK=true` dans `.env.production` — les services
 * lèveront une erreur au lieu de tomber en localStorage.
 */

/**
 * `true` si on est en environnement de développement ou si Supabase
 * n'est pas configuré (mode démo). C'est le cas nominal pour MVP.
 *
 * `false` en production si Supabase est configuré ET que la variable
 * `DISABLE_LOCAL_FALLBACK` vaut `true` : on coupe alors le fallback
 * pour éviter qu'une régression Supabase masque silencieusement les
 * échecs avec des données locales obsolètes.
 */
export function isLocalFallbackAllowed(): boolean {
  // APP_ENV est désormais la source de vérité (cf. .env.example).
  // - `local`      → fallback toléré, c'est l'environnement de dev.
  // - `preprod` / `production` → fallback interdit (failfast cohérent
  //   avec le throw de `createSupabaseAdminClient` côté serveur).
  // Si la variable n'est pas définie, on retombe sur l'ancien critère
  // NODE_ENV + DISABLE_LOCAL_FALLBACK pour ne pas casser un déploiement
  // legacy.
  const appEnv = (process.env.APP_ENV ?? process.env.NEXT_PUBLIC_APP_ENV)?.toLowerCase();
  if (appEnv === "local") return true;
  if (appEnv === "preprod" || appEnv === "production") return false;

  if (process.env.NODE_ENV !== "production") return true;

  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  if (!supabaseConfigured) return true;

  return process.env.DISABLE_LOCAL_FALLBACK !== "true";
}
