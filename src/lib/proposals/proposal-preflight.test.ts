import { describe, expect, it } from "vitest";

import {
  SESSION_MISSING_MESSAGE,
  classifyGenerationPreflight,
} from "./proposal-preflight";

/**
 * Contrat de messages : aucune sortie de generateProposal ne doit être
 * ambiguë. Un chemin d'échec = un `kind` + un message + une action UI
 * dédiée. Le message "Aucune recommandation" n'est PAS réutilisé pour
 * un échec de lecture.
 */

describe("classifyGenerationPreflight", () => {
  const okSummary = { data: { any: "value" }, error: null };
  const okReco = { data: { id: "reco-1" }, error: null };

  it("session absente → session_missing + action=reload", () => {
    const r = classifyGenerationPreflight({
      sessionPresent: false,
      summary: okSummary,
      reco: okReco,
    });
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("session_missing");
    expect(r.message).toBe(SESSION_MISSING_MESSAGE);
    expect(r.action).toBe("reload");
  });

  it("session=null (Supabase non configuré, mode dev) → laisse passer", () => {
    const r = classifyGenerationPreflight({
      sessionPresent: null,
      summary: okSummary,
      reco: okReco,
    });
    expect(r.ok).toBe(true);
    expect(r.kind).toBe("ok");
    expect(r.message).toBeNull();
    expect(r.action).toBeNull();
  });

  it("summary data null AVEC error → summary_read_failed + retry (jamais 'introuvable')", () => {
    const r = classifyGenerationPreflight({
      sessionPresent: true,
      summary: { data: null, error: "PostgREST timeout 504" },
      reco: okReco,
    });
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("summary_read_failed");
    expect(r.action).toBe("retry");
    expect(r.message).toContain("Impossible de lire le diagnostic");
    expect(r.message).toContain("PostgREST timeout 504");
    expect(r.message).not.toMatch(/introuvable/i);
  });

  it("summary data null SANS error → summary_not_found (legit)", () => {
    const r = classifyGenerationPreflight({
      sessionPresent: true,
      summary: { data: null, error: null },
      reco: okReco,
    });
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("summary_not_found");
    expect(r.action).toBeNull();
    expect(r.message).toBe("Diagnostic introuvable.");
  });

  it("reco data null AVEC error → reco_read_failed + retry (JAMAIS le message 'lancez l'analyse')", () => {
    const r = classifyGenerationPreflight({
      sessionPresent: true,
      summary: okSummary,
      reco: { data: null, error: "RLS denied" },
    });
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("reco_read_failed");
    expect(r.action).toBe("retry");
    expect(r.message).toContain("Impossible de lire la recommandation");
    expect(r.message).toContain("RLS denied");
    expect(r.message).not.toMatch(/lancez l'analyse/i);
  });

  it("reco data null SANS error → reco_not_found + action=analyze (message legit)", () => {
    const r = classifyGenerationPreflight({
      sessionPresent: true,
      summary: okSummary,
      reco: { data: null, error: null },
    });
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("reco_not_found");
    expect(r.action).toBe("analyze");
    expect(r.message).toMatch(/lancez l'analyse/i);
  });

  it("tous OK → ok:true, action=null, message=null", () => {
    const r = classifyGenerationPreflight({
      sessionPresent: true,
      summary: okSummary,
      reco: okReco,
    });
    expect(r.ok).toBe(true);
    expect(r.kind).toBe("ok");
    expect(r.action).toBeNull();
    expect(r.message).toBeNull();
  });

  it("reco data truthy MAIS error non-null (fallback local trouvé) → passe (data prime)", () => {
    // Cas hérité : getRecommendationByDiagnosticId peut renvoyer data
    // (fallback localStorage) même après une erreur Supabase. Le flux
    // actuel considère ça comme utilisable — on ne casse pas ce cas.
    const r = classifyGenerationPreflight({
      sessionPresent: true,
      summary: okSummary,
      reco: { data: { id: "local-reco" }, error: "supabase offline" },
    });
    expect(r.ok).toBe(true);
  });

  it("summary=null (jamais appelé) → summary_not_found", () => {
    const r = classifyGenerationPreflight({
      sessionPresent: true,
      summary: null,
      reco: okReco,
    });
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("summary_not_found");
  });

  it("reco=null (jamais appelée) → reco_not_found", () => {
    const r = classifyGenerationPreflight({
      sessionPresent: true,
      summary: okSummary,
      reco: null,
    });
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("reco_not_found");
  });
});
