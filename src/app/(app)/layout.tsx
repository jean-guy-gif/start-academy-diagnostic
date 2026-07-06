import { Shell } from "@/components/layout/shell";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { requireRole } from "@/lib/auth/require-role";
import { INTERNAL_APP_ROLES, type ProfileWithRole } from "@/lib/auth/roles";

/**
 * Auth obligatoire dès que Supabase est configuré.
 *
 * - Si `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
 *   sont présentes → on exige un user connecté avec un rôle interne
 *   (admin / commercial / trainer). Redirige vers `/login` ou
 *   `/forbidden` sinon.
 *
 * - Si Supabase n'est pas configuré → mode dev / démo localStorage,
 *   aucun contrôle d'accès. Voir docs/rls-hardening-plan.md §1 pour
 *   la transition prod.
 */
function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export default async function AppGroupLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let profile: ProfileWithRole | null = null;

  if (isSupabaseConfigured()) {
    profile = await requireRole(INTERNAL_APP_ROLES);
  } else {
    profile = await getCurrentProfile();
  }

  return <Shell profile={profile}>{children}</Shell>;
}
