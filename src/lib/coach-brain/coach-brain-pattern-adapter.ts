/**
 * Coach Brain — adapter pur entre la forme amont (CoachBrainPattern,
 * lue depuis `coach_brain_patterns` côté NXT Performance) et la forme
 * locale (CoachBrainContext, injectée dans les prompts Start Academy).
 *
 * Aucun appel réseau, aucun appel Supabase, aucune dépendance Node :
 * ce module est utilisable côté client comme serveur, et reste
 * triviallement testable.
 *
 * Quand la lecture amont sera branchée, ce fichier reste le point
 * unique de conversion — `coach-brain-service` se contente d'appeler
 * ces helpers après la requête.
 */

import {
  EMPTY_COACH_BRAIN_CONTEXT,
  type CoachBrainContext,
  type CoachBrainItem,
  type CoachBrainItemBase,
  type CoachBrainPattern,
  type CoachBrainSourceType,
  type CoachBrainTargetProfile,
} from "./coach-brain.types";

const VALID_TARGET_PROFILES: readonly CoachBrainTargetProfile[] = [
  "conseiller",
  "manager",
  "assistant",
  "direction",
];

const VALID_SOURCE_TYPES: readonly CoachBrainSourceType[] = [
  "nxt_performance",
  "start_academy",
  "coachnxt_local_rag",
  "client_upload",
  "manual",
  "unknown",
];

function normalizeSourceType(value: unknown): CoachBrainSourceType {
  if (typeof value !== "string") return "unknown";
  return (VALID_SOURCE_TYPES as readonly string[]).includes(value)
    ? (value as CoachBrainSourceType)
    : "unknown";
}

function normalizeTargetProfile(
  value: unknown
): CoachBrainTargetProfile | null {
  if (typeof value !== "string") return null;
  return (VALID_TARGET_PROFILES as readonly string[]).includes(value)
    ? (value as CoachBrainTargetProfile)
    : null;
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (v): v is string => typeof v === "string" && v.length > 0
  );
}

function clampPriority(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 50;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function clampConfidence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Convertit un pattern brut en item normalisé pour le contexte.
 * Robuste aux champs manquants : tout l'optionnel devient `null` ou
 * valeur par défaut. La catégorie est conservée telle quelle —
 * `mapCoachBrainPatternsToContextSync` se charge du dispatch.
 */
export function mapPatternToItem(
  pattern: CoachBrainPattern
): CoachBrainItem | null {
  if (!pattern || typeof pattern !== "object") return null;
  if (!pattern.id || !pattern.title || !pattern.category || !pattern.content) {
    return null;
  }

  const base: CoachBrainItemBase = {
    id: pattern.id,
    title: pattern.title,
    category: pattern.category,
    source: pattern.source ?? "unknown",
    sourceType: normalizeSourceType(pattern.sourceType),
    tags: normalizeTags(pattern.tags),
    moduleFamily: pattern.moduleFamily ?? null,
    targetProfile: normalizeTargetProfile(pattern.targetProfile),
    content: pattern.content,
    summary: pattern.summary ?? null,
    visualHint: pattern.visualHint ?? null,
    usageGuidance: pattern.usageGuidance ?? null,
    priority: clampPriority(pattern.priority),
    confidenceScore: clampConfidence(pattern.confidenceScore),
    relatedModuleIds: normalizeTags(pattern.relatedModuleIds),
    createdAt: pattern.createdAt ?? null,
    updatedAt: pattern.updatedAt ?? null,
  };

  // Les sous-types sont structurellement identiques au base + une
  // catégorie littérale. Le cast est sûr côté runtime car `category`
  // est déjà validée par le check initial. TypeScript demande un cast
  // explicite parce que les types sont nominalement distincts.
  switch (pattern.category) {
    case "method":
      return { ...base, category: "method" };
    case "script":
      return { ...base, category: "script" };
    case "objection":
      return { ...base, category: "objection" };
    case "exercise":
      return { ...base, category: "exercise" };
    case "example":
      return { ...base, category: "example" };
    case "prompt":
      return { ...base, category: "prompt" };
    case "slide_reference":
      return { ...base, category: "slide_reference" };
    default:
      return null;
  }
}

/**
 * Convertit une liste de patterns en `CoachBrainContext` groupé par
 * catégorie. Tri secondaire par `priority` desc — laisse le service
 * faire un ranking plus fin si besoin.
 *
 * Pure / synchrone — utilisable client ou serveur. Le pendant async
 * exposé par `coach-brain-service.ts` (`mapCoachBrainPatternsToContext`)
 * délègue à cette fonction.
 */
export function mapCoachBrainPatternsToContextSync(
  patterns: CoachBrainPattern[] | null | undefined
): CoachBrainContext {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return { ...EMPTY_COACH_BRAIN_CONTEXT };
  }

  const ctx: CoachBrainContext = {
    methods: [],
    scripts: [],
    objections: [],
    exercises: [],
    examples: [],
    prompts: [],
    slideReferences: [],
  };

  for (const p of patterns) {
    const item = mapPatternToItem(p);
    if (!item) continue;
    switch (item.category) {
      case "method":
        ctx.methods.push(item);
        break;
      case "script":
        ctx.scripts.push(item);
        break;
      case "objection":
        ctx.objections.push(item);
        break;
      case "exercise":
        ctx.exercises.push(item);
        break;
      case "example":
        ctx.examples.push(item);
        break;
      case "prompt":
        ctx.prompts.push(item);
        break;
      case "slide_reference":
        ctx.slideReferences.push(item);
        break;
    }
  }

  // Tri stable par priorité desc — TODO ajouter `confidenceScore` en
  // tie-breaker quand on aura des données réelles à observer.
  const byPriorityDesc = (a: CoachBrainItemBase, b: CoachBrainItemBase) =>
    b.priority - a.priority;

  ctx.methods.sort(byPriorityDesc);
  ctx.scripts.sort(byPriorityDesc);
  ctx.objections.sort(byPriorityDesc);
  ctx.exercises.sort(byPriorityDesc);
  ctx.examples.sort(byPriorityDesc);
  ctx.prompts.sort(byPriorityDesc);
  ctx.slideReferences.sort(byPriorityDesc);

  return ctx;
}
