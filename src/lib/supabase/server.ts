import "server-only";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const SERVER_AUTH_OPTIONS = {
  auth: { persistSession: false, autoRefreshToken: false },
} as const;

/**
 * Client Supabase « stateless » pour les Server Components / Route
 * Handlers qui n'ont PAS besoin de l'utilisateur connecté
 * (ex : lecture du catalogue public, génération IA déjà autorisée
 * en amont).
 *
 * - Utilise `NEXT_PUBLIC_SUPABASE_ANON_KEY` — soumis à RLS.
 * - Ne lit aucun cookie : la session utilisateur n'est PAS attachée.
 * - Retourne `null` si les variables d'environnement ne sont pas
 *   configurées (mode fallback localStorage).
 *
 * Si tu as besoin de connaître l'utilisateur (ex : ajouter `created_by`
 * sur une insertion), utilise `createSupabaseRouteHandlerClient()` à
 * la place.
 */
export function createSupabaseServerClient(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient<Database>(url, anonKey, SERVER_AUTH_OPTIONS);
}

/**
 * Renvoie true si on tourne en environnement non-local (pré-prod ou
 * prod). Permet d'imposer un failfast sur les variables Supabase
 * critiques. Source de vérité : `APP_ENV` (préféré), sinon
 * `NODE_ENV === "production"`.
 *
 * Valeurs reconnues pour `APP_ENV` :
 *   - `local`   → mode développement local, fallbacks tolérés
 *   - `preprod` → environnement pré-production, failfast actif
 *   - `production` → production, failfast actif
 *
 * Toute valeur absente / inconnue tombe sur le critère `NODE_ENV`.
 */
function isNonLocalEnv(): boolean {
  const appEnv = process.env.APP_ENV?.toLowerCase();
  if (appEnv === "local") return false;
  if (appEnv === "preprod" || appEnv === "production") return true;
  return process.env.NODE_ENV === "production";
}

/**
 * Client Supabase service role — *strictement serveur*.
 *
 * À utiliser uniquement pour les opérations nécessitant de contourner
 * RLS (lecture du catalogue avant authentification, tâches admin,
 * edge functions). Ne JAMAIS exposer côté navigateur : l'import de
 * `server-only` casse le build si ce fichier est référencé depuis un
 * composant client.
 *
 * Comportement :
 *   - **local** (APP_ENV=local ou non-prod) : retourne `null` si la
 *     clé est absente — laisse le caller faire son fallback
 *     (createSupabaseServerClient, payload inline, localStorage…).
 *   - **preprod / production** : **lève une erreur explicite** si
 *     `SUPABASE_SERVICE_ROLE_KEY` est absente. Aucun fallback
 *     silencieux possible. La valeur de la clé n'est JAMAIS incluse
 *     dans le message.
 */
export function createSupabaseAdminClient(): SupabaseClient<Database> | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    if (isNonLocalEnv()) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY manquante en environnement non-local."
      );
    }
    return null;
  }
  return createClient<Database>(url, serviceRoleKey, SERVER_AUTH_OPTIONS);
}

/**
 * Client Supabase SSR — *à utiliser dans les Server Components, Server
 * Actions et Route Handlers qui ont besoin de l'utilisateur connecté*.
 *
 * - Lit la session via les cookies HttpOnly posés par Supabase
 *   (@supabase/ssr).
 * - Refresh automatique du token quand nécessaire.
 * - Soumis à RLS (anon key + JWT user).
 *
 * Retourne `null` si les variables d'environnement Supabase ne sont
 * pas configurées (mode fallback localStorage — aucune notion d'user).
 */
export async function createSupabaseRouteHandlerClient(): Promise<
  SupabaseClient<Database> | null
> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(toSet) {
        try {
          toSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components ne peuvent pas écrire les cookies. C'est
          // attendu : le refresh sera fait par la prochaine Server
          // Action ou Route Handler. Ignorer silencieusement.
        }
      },
    },
  });
}
