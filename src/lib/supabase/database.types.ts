/**
 * Wrapper d'accès aux types Supabase — applique les overrides de
 * `database.types.overrides.ts` sur le fichier généré
 * `database.types.generated.ts`.
 *
 * NE PAS ÉDITER MANUELLEMENT :
 *   • `database.types.generated.ts` est ré-écrit intégralement à
 *     chaque `supabase gen types typescript --linked --schema public
 *     > src/lib/supabase/database.types.generated.ts`. Ne rien y
 *     ajouter à la main — toute édition serait perdue au regen
 *     suivant.
 *   • Ce fichier (`database.types.ts`) ne dépend que des NOMS des
 *     tables/colonnes, pas de leur typage précis dans le fichier
 *     généré. Un ajout de colonne côté DB → regen ; un changement
 *     de CHECK constraint → migration + entrée dans overrides.
 *
 * Le code applicatif importe TOUJOURS `Tables<>`, `TablesInsert<>`,
 * `TablesUpdate<>` depuis ce fichier — jamais depuis `.generated`.
 */

import type { Database as GeneratedDatabase } from "./database.types.generated";
import type { TableOverrides } from "./database.types.overrides";

type GeneratedTables = GeneratedDatabase["public"]["Tables"];

/**
 * Applique un override `TOverride` sur un `TRow` en remplaçant les
 * champs communs. Les champs non listés dans l'override sont
 * conservés tels quels.
 */
type WithOverrides<TRow, TOverride> = Omit<TRow, keyof TOverride> & TOverride;

type OverriddenTable<TName extends keyof GeneratedTables> =
  TName extends keyof TableOverrides
    ? {
        Row: WithOverrides<
          GeneratedTables[TName]["Row"],
          TableOverrides[TName]
        >;
        Insert: WithOverrides<
          GeneratedTables[TName]["Insert"],
          Partial<TableOverrides[TName]>
        >;
        Update: WithOverrides<
          GeneratedTables[TName]["Update"],
          Partial<TableOverrides[TName]>
        >;
        Relationships: GeneratedTables[TName]["Relationships"];
      }
    : GeneratedTables[TName];

export type Database = {
  __InternalSupabase: GeneratedDatabase["__InternalSupabase"];
  public: {
    Tables: { [K in keyof GeneratedTables]: OverriddenTable<K> };
    Views: GeneratedDatabase["public"]["Views"];
    Functions: GeneratedDatabase["public"]["Functions"];
    Enums: GeneratedDatabase["public"]["Enums"];
    CompositeTypes: GeneratedDatabase["public"]["CompositeTypes"];
  };
};

export type { Json } from "./database.types.generated";
export { Constants } from "./database.types.generated";

// Ré-export des unions nommées — le code applicatif les importe
// depuis `database.types` plutôt que de dupliquer les définitions
// dans les services (source de vérité côté DB).
export type {
  ActivityLogSeverity,
  AiGenerationSource,
  AiGenerationStatus,
  ContractType,
  DesignedSupportStatus,
  DiagnosticMode,
  DiagnosticStatus,
  ExpertLevel,
  FundingEligibility,
  PostTrainingReviewStatus,
  PriorityTier,
  ProfessionalStatus,
  ProfileRole,
  ProfileTarget,
  RecommendationStatus,
  SessionDateFormat,
  SessionDateStatus,
  SessionStatus,
  SkillLevel,
  SourceSheet,
  SupportQualityReviewStatus,
  SupportSource,
  SupportStatus,
  ToolMaturity,
  YesNoUnknown,
} from "./database.types.overrides";

// Helpers ergonomiques — signature simple (Row-only) alignée sur
// l'usage historique du repo. Ne pas remplacer par les helpers
// complexes du fichier généré (qui gèrent views + schemas non-public)
// sans revoir tous les callers.
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
