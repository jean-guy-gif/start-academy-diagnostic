import "server-only";

import { redirect } from "next/navigation";
import { getCurrentProfile, getCurrentUser } from "./get-current-user";
import { hasRole, type ProfileWithRole, type Role } from "./roles";

/**
 * Exige un utilisateur connecté. Sinon, redirige vers `/login`.
 *
 * À appeler dans les Server Components / layouts protégés.
 * Le `redirect()` de Next interrompt l'exécution — pas besoin de
 * traiter le cas non authentifié dans le reste de la fonction.
 */
export async function requireAuth(redirectTo: string = "/login") {
  const user = await getCurrentUser();
  if (!user) redirect(redirectTo);
  return user;
}

/**
 * Exige un utilisateur connecté ET appartenant à l'un des rôles
 * autorisés. Redirige :
 *   - vers `/login` si non connecté,
 *   - vers `/forbidden` si connecté mais rôle non autorisé.
 *
 * Le `redirect()` interrompt l'exécution. Le retour typé permet aux
 * callers de réutiliser le profil sans deuxième appel réseau.
 */
export async function requireRole(
  allowedRoles: readonly Role[],
  options: { loginPath?: string; forbiddenPath?: string } = {}
): Promise<ProfileWithRole> {
  const { loginPath = "/login", forbiddenPath = "/forbidden" } = options;

  const profile = await getCurrentProfile();
  if (!profile) redirect(loginPath);
  if (!hasRole(profile, allowedRoles)) redirect(forbiddenPath);

  return profile;
}
