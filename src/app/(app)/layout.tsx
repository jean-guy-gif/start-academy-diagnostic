import { Shell } from "@/components/layout/shell";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { requireRole } from "@/lib/auth/require-role";
import { INTERNAL_APP_ROLES, type ProfileWithRole } from "@/lib/auth/roles";

/**
 * Tout ce qui vit sous `(app)/` est authentifié : le layout consomme
 * `cookies()` via `requireRole`, et chaque page enfant rend des
 * données par-user (cockpit) ou délègue à un composant `"use client"`.
 * Aucune page de ce sous-arbre n'a de sens en tant que page statique.
 *
 * Marquer le segment dynamique explicitement empêche Next.js de tenter
 * un prerender au build — précieux quand les env vars serveur
 * (`SUPABASE_SERVICE_ROLE_KEY`, `OPENROUTER_API_KEY`, …) ne sont pas
 * provisionnées dans un preview environment (crash historique sur
 * `settings/modules/page.tsx` → `getTrainingModules` →
 * `createSupabaseAdminClient`). Cf. `docs/backlog-post-stabilisation.md`
 * §3.1 (CI Vercel rouge chronique).
 *
 * Propagation : cette directive s'applique à toutes les pages enfants
 * du segment `(app)/` sauf override explicite. `cockpit/page.tsx`
 * avait sa propre déclaration `force-dynamic` — désormais héritée du
 * layout et retirée dans la même PR.
 */
export const dynamic = "force-dynamic";

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
