/**
 * Décision de messages pré-génération de proposition — module pur,
 * testable sans DOM ni network.
 *
 * Objectif : distinguer sans ambiguïté les 5 chemins de sortie
 * possibles AVANT le POST /api/generate-training-proposal :
 *   1. session Supabase browser absente/expirée
 *   2. lecture du diagnostic en échec (RLS/réseau/…)
 *   3. diagnostic vraiment introuvable
 *   4. lecture de la recommandation en échec
 *   5. recommandation vraiment absente (l'utilisateur doit lancer
 *      /api/analyze-training-need avant)
 *
 * Le message "Aucune recommandation" n'est plus JAMAIS utilisé pour
 * un échec de lecture (§2 du chantier).
 */

export type PreflightAction = "reload" | "retry" | "analyze" | null;

export type PreflightKind =
  | "ok"
  | "session_missing"
  | "summary_read_failed"
  | "summary_not_found"
  | "reco_read_failed"
  | "reco_not_found";

export interface PreflightServiceResult<T> {
  data: T | null;
  error: string | null;
}

export interface PreflightInputs {
  /**
   * `null` = client Supabase browser non initialisé
   * (`NEXT_PUBLIC_SUPABASE_URL` / `..._ANON_KEY` absentes) — laissé
   * passer (mode dev / démo).
   * `false` = client initialisé mais `getSession` renvoie session
   * absente/expirée → sortie dédiée `session_missing`.
   * `true` = session valide, poursuite du preflight.
   */
  sessionPresent: boolean | null;
  summary: PreflightServiceResult<unknown> | null;
  reco: PreflightServiceResult<unknown> | null;
}

export interface PreflightOutcome {
  ok: boolean;
  kind: PreflightKind;
  message: string | null;
  action: PreflightAction;
}

export const SESSION_MISSING_MESSAGE =
  "Session expirée — rechargez la page pour vous reconnecter.";

export function classifyGenerationPreflight(
  inputs: PreflightInputs
): PreflightOutcome {
  if (inputs.sessionPresent === false) {
    return {
      ok: false,
      kind: "session_missing",
      message: SESSION_MISSING_MESSAGE,
      action: "reload",
    };
  }

  const summary = inputs.summary;
  if (!summary || summary.data === null) {
    if (summary && summary.error) {
      return {
        ok: false,
        kind: "summary_read_failed",
        message: `Impossible de lire le diagnostic (${summary.error}).`,
        action: "retry",
      };
    }
    return {
      ok: false,
      kind: "summary_not_found",
      message: "Diagnostic introuvable.",
      action: null,
    };
  }

  const reco = inputs.reco;
  if (!reco || reco.data === null) {
    if (reco && reco.error) {
      return {
        ok: false,
        kind: "reco_read_failed",
        message: `Impossible de lire la recommandation (${reco.error}).`,
        action: "retry",
      };
    }
    return {
      ok: false,
      kind: "reco_not_found",
      message:
        "Aucune recommandation trouvée — lancez l'analyse avant la proposition.",
      action: "analyze",
    };
  }

  return { ok: true, kind: "ok", message: null, action: null };
}
