import "server-only";

import {
  EMPTY_COACH_BRAIN_CONTEXT,
  type CoachBrainContext,
  type CoachBrainPattern,
  type CoachBrainTargetProfile,
} from "./coach-brain.types";
import { mapCoachBrainPatternsToContextSync } from "./coach-brain-pattern-adapter";

/**
 * Coach Brain — service d'orchestration côté Start Academy Diagnostic.
 *
 * ÉTAT ACTUEL : placeholder inerte.
 *   Tous les fetchers retournent un contexte vide. Tant qu'aucune source
 *   amont n'est branchée, les routes IA continuent de fonctionner
 *   exactement comme avant (cf. `isCoachBrainContextEmpty`).
 *
 * BRANCHEMENT FUTUR (par ordre prioritaire) :
 *
 *   1. Lecture `coach_brain_patterns` (Supabase, table possédée par NXT
 *      Performance). Requête côté service_role (ce module est
 *      server-only), filtrée par moduleFamily / targetProfile / tags.
 *      → utiliser `mapCoachBrainPatternsToContext` pour normaliser.
 *
 *   2. Enrichissement par documents uploadés (`session_documents`,
 *      catégories `cas_client`, `support_actuel`) après extraction
 *      texte. Conversion via un nouvel adapter dédié.
 *
 *   3. COACHNXT local RAG (SQLite vector + Ollama, côté NXT Performance).
 *      Cet appel passera probablement par un endpoint interne NXT
 *      Performance — on n'embarque PAS le RAG dans Start Academy.
 *
 *   4. Filtres / ranking côté service (priority desc, confidenceScore,
 *      cap items par catégorie). C'est ici qu'on tranche la curation
 *      pour ne PAS gonfler le prompt.
 *
 * RÈGLES DE SÉCURITÉ :
 *   - Aucun appel réseau externe pour l'instant.
 *   - Aucun secret en clair — la clé `SUPABASE_SERVICE_ROLE_KEY` reste
 *     accessible via `createSupabaseAdminClient` quand on branchera la
 *     lecture amont.
 *   - Pas de cache (encore) — le coût d'un appel inerte est nul.
 */

export interface SelectCoachBrainParams {
  /** Identifiant session — utilisé pour récupérer modules + documents. */
  sessionId?: string;
  /** Ids modules Start Academy — utilisés pour filtrer les patterns. */
  moduleIds?: string[];
  /** Profil cible — filtre additionnel sur `targetProfile`. */
  targetProfile?: CoachBrainTargetProfile;
  /** Tags additionnels (ex : signaux faibles, vocabulaire métier). */
  tags?: string[];
  /** Limite défensive : max items par catégorie injectés dans le prompt. */
  maxItemsPerCategory?: number;
}

/**
 * Contexte Coach Brain pour une session donnée.
 *
 * TODO (branchement futur) :
 *   - Lire `training_sessions.recommendation_id` puis
 *     `recommendation_modules.module_id` pour la liste des modules.
 *   - Lire `session_documents` (catégorie `cas_client`, `support_actuel`)
 *     et extraire les textes après ingestion.
 *   - Déléguer à `getCoachBrainContextForModules`.
 */
export async function getCoachBrainContextForSession(
  _sessionId: string
): Promise<CoachBrainContext> {
  return { ...EMPTY_COACH_BRAIN_CONTEXT };
}

/**
 * Contexte Coach Brain pour une liste de modules Start Academy.
 *
 * TODO (branchement futur) :
 *   - Requête : `select * from coach_brain_patterns
 *               where related_module_ids && $1
 *               and (target_profile is null or target_profile = $2)`
 *   - Pré-tri : `priority desc`, `confidence_score desc`.
 *   - Mapping : `mapCoachBrainPatternsToContext(rows)`.
 *   - Cap items par catégorie pour borner le budget tokens
 *     (`maxItemsPerCategory` côté `selectCoachBrainContentForSupport`).
 *
 * Alternative future si NXT Performance n'expose pas la table en
 * lecture directe : appel d'un endpoint interne sécurisé `GET
 * /api/coachnxt/patterns?moduleIds=...` (route côté NXT Performance,
 * pas côté Start Academy).
 */
export async function getCoachBrainContextForModules(
  _moduleIds: string[]
): Promise<CoachBrainContext> {
  return { ...EMPTY_COACH_BRAIN_CONTEXT };
}

/**
 * Orchestre la sélection finale du contenu Coach Brain à injecter
 * dans un prompt de support / support designé.
 *
 * TODO (branchement futur) :
 *   - Combiner `getCoachBrainContextForSession` (cas client,
 *     documents) avec `getCoachBrainContextForModules` (patterns
 *     pédagogiques) en dédupliquant par `id`.
 *   - Appliquer le filtre `targetProfile` + `tags`.
 *   - Trier par `priority` desc, couper à `maxItemsPerCategory`.
 *   - Optionnel : déléguer à COACHNXT local pour reranking
 *     sémantique avant injection.
 */
export async function selectCoachBrainContentForSupport(
  _params: SelectCoachBrainParams
): Promise<CoachBrainContext> {
  return { ...EMPTY_COACH_BRAIN_CONTEXT };
}

/**
 * Convertit une liste brute de patterns (forme NXT Performance) en
 * `CoachBrainContext`. Délégue à l'adapter pur — utile pour les routes
 * qui voudront accepter un payload inline (tests, démos manuelles)
 * sans passer par la lecture Supabase.
 *
 * NOTE : ce wrapper existe pour que les callers serveurs puissent
 * importer une seule fonction depuis le service ; l'adapter sous-jacent
 * reste pur et testable.
 */
export function mapCoachBrainPatternsToContext(
  patterns: CoachBrainPattern[]
): CoachBrainContext {
  return mapCoachBrainPatternsToContextSync(patterns);
}
