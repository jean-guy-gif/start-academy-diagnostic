import "server-only";

import { cache } from "react";
import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";
import { parseRole, type ProfileWithRole } from "./roles";

export interface AuthenticatedUser {
  id: string;
  email: string | null;
}

/**
 * Renvoie l'utilisateur connecté (lecture cookie HttpOnly via
 * `@supabase/ssr`). `null` si :
 *   - aucune session active,
 *   - Supabase n'est pas configuré (mode dev / fallback localStorage).
 *
 * Mémoïsé pour la durée d'une requête via `React.cache` — appelable
 * librement depuis Server Components, layouts et Server Actions sans
 * multiplier les appels réseau.
 */
export const getCurrentUser = cache(
  async (): Promise<AuthenticatedUser | null> => {
    const supabase = await createSupabaseRouteHandlerClient();
    if (!supabase) return null;

    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;

    return {
      id: data.user.id,
      email: data.user.email ?? null,
    };
  }
);

/**
 * Renvoie le profil Start Academy de l'utilisateur connecté (rôle,
 * organisation, nom complet). Effectue un join implicite via la table
 * `profiles`. `null` si non connecté ou profil introuvable.
 *
 * Mémoïsé pour la durée d'une requête.
 */
export const getCurrentProfile = cache(
  async (): Promise<ProfileWithRole | null> => {
    const user = await getCurrentUser();
    if (!user) return null;

    const supabase = await createSupabaseRouteHandlerClient();
    if (!supabase) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select("id, role, full_name, email, organization")
      .eq("id", user.id)
      .maybeSingle();

    if (error || !data) return null;

    const role = parseRole(data.role);
    if (!role) return null;

    return {
      id: data.id,
      role,
      full_name: data.full_name,
      email: data.email,
      organization: data.organization,
    };
  }
);
