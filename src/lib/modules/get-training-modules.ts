import "server-only";

import { moduleCatalog } from "@/lib/data/module-catalog";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import type { TrainingModule } from "@/types";

export type ModuleSource = "supabase" | "local";

export interface GetTrainingModulesResult {
  modules: TrainingModule[];
  source: ModuleSource;
  /** Message d'erreur ou raison du fallback (null si succès). */
  error: string | null;
}

function normalize(row: Tables<"training_modules">): TrainingModule {
  return {
    id: row.id,
    name: row.name,
    family: row.family,
    sourceSheet: row.source_sheet,
    targetProfile: row.target_profile,
    durationHours: row.duration_hours,
    level: row.level,
    tools: row.tools,
    paying: row.paying,
    platform: row.platform,
    needIdentification: row.need_identification,
    isFoundationModule: row.is_foundation_module,
    diagnosticSignals: row.diagnostic_signals,
  };
}

function localFallback(reason: string | null): GetTrainingModulesResult {
  return { modules: moduleCatalog, source: "local", error: reason };
}

/**
 * Lit la table `training_modules` depuis Supabase si possible, sinon
 * retourne le catalogue local (src/lib/data/module-catalog.ts).
 *
 * - Préfère le client `service_role` quand il est disponible côté
 *   serveur, afin que la page Modules reste fonctionnelle même sans
 *   session authentifiée (RLS MVP n'expose pas `anon`).
 * - Bascule silencieusement sur le catalogue local en cas d'absence
 *   d'env, d'erreur réseau, d'erreur SQL ou de table vide. L'appelant
 *   peut afficher la raison via `result.error`.
 */
export async function getTrainingModules(): Promise<GetTrainingModulesResult> {
  const client =
    createSupabaseAdminClient() ?? createSupabaseServerClient();

  if (!client) {
    return localFallback("Variables Supabase non configurées");
  }

  try {
    const { data, error } = await client
      .from("training_modules")
      .select("*")
      .order("source_sheet", { ascending: true })
      .order("family", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      return localFallback(error.message);
    }
    if (!data || data.length === 0) {
      return localFallback("La table training_modules est vide");
    }
    return { modules: data.map(normalize), source: "supabase", error: null };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Erreur Supabase inconnue";
    return localFallback(message);
  }
}
