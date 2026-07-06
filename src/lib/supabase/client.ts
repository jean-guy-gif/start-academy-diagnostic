import { createBrowserClient } from "@supabase/ssr";
import { type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Client Supabase utilisable côté navigateur.
 *
 * Utilise `@supabase/ssr` pour stocker la session dans des cookies
 * HttpOnly synchronisés avec le serveur — ainsi les Server Components
 * peuvent lire l'utilisateur connecté via `createSupabaseRouteHandlerClient`.
 *
 * Retourne `null` quand `NEXT_PUBLIC_SUPABASE_URL` ou
 * `NEXT_PUBLIC_SUPABASE_ANON_KEY` ne sont pas renseignées — l'appelant
 * doit alors basculer sur le fallback local (cf. mode dev).
 */
export function createSupabaseBrowserClient(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createBrowserClient<Database>(url, anonKey);
}
