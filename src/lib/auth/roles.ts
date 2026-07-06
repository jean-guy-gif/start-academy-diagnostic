/**
 * Définition des rôles Start Academy.
 *
 * Alignée sur le check constraint de `public.profiles.role`
 * (cf. supabase/migrations/20260524120000_auth_socle.sql).
 *
 * - admin          : accès complet plateforme + administration catalogue
 * - commercial     : commercial Start Academy — saisit les RDV, lance
 *                    diagnostic / recommandation / proposition
 * - trainer        : formateur Start Academy — anime sessions, consulte
 *                    supports + collecte
 * - client_viewer  : dirigeant client — lecture seule de sa proposition
 *                    + suivi parcours (chemin public sécurisé, futur)
 * - participant    : collaborateur client — saisit son cas concret
 *                    (chemin public sécurisé, futur)
 *
 * **Important** : ne jamais ajouter un rôle ici sans le synchroniser
 * avec la migration SQL (check constraint + trigger handle_new_user)
 * ET avec src/lib/supabase/database.types.ts.
 */

export const ROLES = [
  "admin",
  "commercial",
  "trainer",
  "client_viewer",
  "participant",
] as const;

export type Role = (typeof ROLES)[number];

/**
 * Rôles autorisés à accéder à l'application interne (sidebar + écrans
 * commerciaux et pédagogiques). `client_viewer` et `participant` n'y
 * accèdent PAS — ils passeront par des liens publics sécurisés
 * (futur).
 */
export const INTERNAL_APP_ROLES: readonly Role[] = [
  "admin",
  "commercial",
  "trainer",
];

/**
 * Rôles destinés aux chemins publics (liens signés). Aucun écran ne
 * leur est encore branché — variable conservée pour servir de point
 * d'ancrage quand on construira `/proposal/[token]` et
 * `/collect/[token]`.
 */
export const PUBLIC_LINK_ROLES: readonly Role[] = [
  "client_viewer",
  "participant",
];

export interface ProfileWithRole {
  id: string;
  role: Role;
  full_name: string | null;
  email: string | null;
  organization: string | null;
}

/**
 * Vérifie qu'un profil possède l'un des rôles attendus.
 * Tolère `null` (utilisateur non connecté) en renvoyant `false`.
 */
export function hasRole(
  profile: ProfileWithRole | null,
  roles: readonly Role[]
): boolean {
  if (!profile) return false;
  return roles.includes(profile.role);
}

/**
 * Garde-fou de validation pour les rôles venant de l'extérieur
 * (form, body API, métadonnées Supabase). Renvoie le rôle si valide,
 * `null` sinon — JAMAIS d'exception, jamais de cast.
 */
export function parseRole(value: unknown): Role | null {
  if (typeof value !== "string") return null;
  return (ROLES as readonly string[]).includes(value) ? (value as Role) : null;
}
