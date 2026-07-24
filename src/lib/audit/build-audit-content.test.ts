import { describe, expect, it } from "vitest";

import type { AnswerRecord } from "@/lib/diagnostics/diagnostic-service";
import type { DiagnosticAlert } from "@/lib/diagnostics/ratios-service";
import { diagnosticQuestions } from "@/lib/data/diagnostic-questions";

import {
  QUESTION_MAPPING,
  SUMMARY_KEY_METRICS,
  buildAuditContent,
} from "./build-audit-content";

// ---------------------------------------------------------------------------
// Helpers de test — factory AnswerRecord
// ---------------------------------------------------------------------------

function makeAnswer(
  questionId: string,
  answer: string | null,
  overrides: Partial<AnswerRecord> = {}
): AnswerRecord {
  return {
    id: `ans-${questionId}`,
    diagnosticId: "diag-test",
    questionId,
    questionText: "",
    category: null,
    answer,
    note: null,
    isWeakSignal: false,
    isSkipped: false,
    createdAt: "2026-07-24T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// (1) Contrat de couverture du mapping
// ---------------------------------------------------------------------------

describe("QUESTION_MAPPING — contrat de couverture", () => {
  it("chaque question du fichier source (chapitres 3-11) est mappée quelque part", () => {
    const mappable = diagnosticQuestions.filter(
      (q) => q.chapter !== undefined && q.chapter >= 3 && q.chapter <= 11
    );
    const orphans = mappable.filter((q) => !(q.id in QUESTION_MAPPING));
    expect(orphans.map((q) => q.id)).toEqual([]);
  });

  it("aucun ID du mapping n'est absent du fichier source (fail si un ID orphelin subsiste)", () => {
    const sourceIds = new Set(diagnosticQuestions.map((q) => q.id));
    const mappingIds = Object.keys(QUESTION_MAPPING);
    const orphansInMapping = mappingIds.filter((id) => !sourceIds.has(id));
    expect(orphansInMapping).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (2) Ratios calculés — jeu de réponses connu
// ---------------------------------------------------------------------------

describe("Ratios calculés — bloc performance_chain", () => {
  it("contactsToRdvPercent = 100 × rdv / contacts, division-par-zéro gardée", () => {
    const answers = [
      makeAnswer("prospecting-contacts-per-month", "100"),
      makeAnswer("seller-meetings-per-month", "25"),
    ];
    const audit = buildAuditContent({ answers });
    const r = audit.performanceChain.ratios.find(
      (x) => x.key === "contactsToRdvPercent"
    );
    expect(r?.value).toBe(25);
    expect(r?.status).toBe("above");
    expect(r?.benchmark).toBe(20);
  });

  it("contactsToRdvPercent = null si dénominateur 0 (aucune valeur inventée)", () => {
    const answers = [
      makeAnswer("prospecting-contacts-per-month", "0"),
      makeAnswer("seller-meetings-per-month", "25"),
    ];
    const audit = buildAuditContent({ answers });
    const r = audit.performanceChain.ratios.find(
      (x) => x.key === "contactsToRdvPercent"
    );
    expect(r?.value).toBeNull();
    expect(r?.status).toBe("unknown");
  });

  it("tunnel visites → offres → compromis → actes calculé correctement", () => {
    const answers = [
      makeAnswer("visits-per-month", "100"),
      makeAnswer("offers-per-month", "30"),
      makeAnswer("compromis-per-month", "20"),
      makeAnswer("actes-per-month", "18"),
    ];
    const audit = buildAuditContent({ answers });
    const byKey = new Map(
      audit.performanceChain.ratios.map((r) => [r.key, r])
    );
    expect(byKey.get("visitesToOffresPercent")?.value).toBe(30);
    expect(byKey.get("offresToCompromisPercent")?.value).toBeCloseTo(66.7, 1);
    expect(byKey.get("offresToCompromisPercent")?.status).toBe("above");
    expect(byKey.get("compromisToActePercent")?.value).toBe(90);
    expect(byKey.get("compromisToActePercent")?.status).toBe("above");
  });

  it("données manquantes → value null, status unknown, JAMAIS de valeur inventée", () => {
    const audit = buildAuditContent({ answers: [] });
    for (const r of audit.performanceChain.ratios) {
      expect(r.value, `${r.key} devrait être null`).toBeNull();
      expect(r.status).toBe("unknown");
    }
  });

  it("estimation → mandat direct depuis perf-rate-mandat", () => {
    const answers = [makeAnswer("perf-rate-mandat", "45")];
    const audit = buildAuditContent({ answers });
    const r = audit.performanceChain.ratios.find(
      (x) => x.key === "estimationToMandatPercent"
    );
    expect(r?.value).toBe(45);
    expect(r?.benchmark).toBe(40);
    expect(r?.status).toBe("above");
  });
});

// ---------------------------------------------------------------------------
// Cas particulier — note Google sur 5
// ---------------------------------------------------------------------------

describe("google-reviews-score — traité comme note sur 5 malgré son type percent", () => {
  it("valeur 4,6 → unit rating_5, benchmark 4.5, status above", () => {
    const answers = [makeAnswer("google-reviews-score", "4,6")];
    const audit = buildAuditContent({ answers });
    const r = audit.performanceChain.ratios.find(
      (x) => x.key === "googleReviewsScore"
    );
    expect(r?.value).toBeCloseTo(4.6, 2);
    expect(r?.unit).toBe("rating_5");
    expect(r?.benchmark).toBe(4.5);
    expect(r?.status).toBe("above");
  });

  it("valeur 3,8 → status below", () => {
    const answers = [makeAnswer("google-reviews-score", "3.8")];
    const audit = buildAuditContent({ answers });
    const r = audit.performanceChain.ratios.find(
      (x) => x.key === "googleReviewsScore"
    );
    expect(r?.status).toBe("below");
  });
});

// ---------------------------------------------------------------------------
// (3) Practices — flags & verbatims
// ---------------------------------------------------------------------------

describe("Practices — flags & verbatims", () => {
  it("yesno = oui → value=true, non → value=false, absent → value=null", () => {
    const answers = [
      makeAnswer("prospecting-script", "oui"),
      makeAnswer("skill-prospection", "non"),
      // buyers-financing-verified non répondu
    ];
    const audit = buildAuditContent({ answers });
    const flags = new Map(audit.practices.flags.map((f) => [f.key, f]));
    expect(flags.get("prospecting-script")?.value).toBe(true);
    expect(flags.get("skill-prospection")?.value).toBe(false);
    expect(flags.get("buyers-financing-verified")?.value).toBeNull();
  });

  it("multichoice éclaté en tableau", () => {
    const answers = [
      makeAnswer("tools-ai-usage", "redaction, estimation, reponses_avis"),
    ];
    const audit = buildAuditContent({ answers });
    const flag = audit.practices.flags.find((f) => f.key === "tools-ai-usage");
    expect(flag?.value).toEqual([
      "redaction",
      "estimation",
      "reponses_avis",
    ]);
  });

  it("verbatim text — content conservé + sourceQuestionIds", () => {
    const answers = [
      makeAnswer(
        "mgmt-top3-priorities",
        "Recruter un manager, passer 50 % d'exclusivité, industrialiser la prospection"
      ),
    ];
    const audit = buildAuditContent({ answers });
    const v = audit.practices.verbatims.find(
      (x) => x.key === "top3_priorities"
    );
    expect(v?.content).toMatch(/Recruter un manager/);
    expect(v?.sourceQuestionIds).toEqual(["mgmt-top3-priorities"]);
  });
});

// ---------------------------------------------------------------------------
// Dédup pige — prospecting-pige-tool + tools-pige
// ---------------------------------------------------------------------------

describe("Dédup pige_tool — prospecting-pige-tool + tools-pige fusionnés", () => {
  it("les 2 renseignés → 1 seul verbatim `pige_tool`, valeur la plus longue gagne", () => {
    const answers = [
      makeAnswer("prospecting-pige-tool", "Meilleursagents"),
      makeAnswer("tools-pige", "Meilleursagents Pro + veille manuelle"),
    ];
    const audit = buildAuditContent({ answers });
    const pige = audit.practices.verbatims.filter(
      (v) => v.key === "pige_tool"
    );
    expect(pige).toHaveLength(1);
    expect(pige[0].content).toBe("Meilleursagents Pro + veille manuelle");
    expect(pige[0].sourceQuestionIds.sort()).toEqual([
      "prospecting-pige-tool",
      "tools-pige",
    ]);
  });

  it("une seule renseignée → verbatim présent, seule source citée", () => {
    const answers = [makeAnswer("tools-pige", "Périclès Web")];
    const audit = buildAuditContent({ answers });
    const pige = audit.practices.verbatims.filter(
      (v) => v.key === "pige_tool"
    );
    expect(pige).toHaveLength(1);
    expect(pige[0].content).toBe("Périclès Web");
    expect(pige[0].sourceQuestionIds).toEqual(["tools-pige"]);
  });

  it("aucune renseignée → aucun verbatim pige_tool", () => {
    const audit = buildAuditContent({ answers: [] });
    const pige = audit.practices.verbatims.filter(
      (v) => v.key === "pige_tool"
    );
    expect(pige).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// (4) Alertes — pas de duplication, top N par sévérité
// ---------------------------------------------------------------------------

describe("Alertes — propagation depuis l'entrée, tri par sévérité", () => {
  const alertsSample: DiagnosticAlert[] = [
    {
      code: "info_test",
      chapter: 3,
      label: "Info test",
      severity: "info",
      observed: null,
      threshold: null,
    },
    {
      code: "warning_test",
      chapter: 4,
      label: "Warning test",
      severity: "warning",
      observed: null,
      threshold: null,
    },
    {
      code: "error_test",
      chapter: 5,
      label: "Error test",
      severity: "error",
      observed: null,
      threshold: null,
    },
    {
      code: "warning_2",
      chapter: 6,
      label: "Warning 2",
      severity: "warning",
      observed: null,
      threshold: null,
    },
  ];

  it("audit.alerts = pass-through des alertes en entrée (aucune duplication)", () => {
    const audit = buildAuditContent({ answers: [], alerts: alertsSample });
    expect(audit.alerts).toBe(alertsSample);
    expect(audit.alerts).toHaveLength(4);
  });

  it("summary.topAlerts + priorities triés par sévérité, limite 3", () => {
    const audit = buildAuditContent({ answers: [], alerts: alertsSample });
    expect(audit.summary.topAlerts).toHaveLength(3);
    expect(audit.summary.topAlerts[0].code).toBe("error_test");
    expect(audit.priorities.map((p) => p.rank)).toEqual([1, 2, 3]);
    expect(audit.priorities[0].sourceAlertCodes).toEqual(["error_test"]);
    // Warning/warning en 2 & 3 (ordre stable par mergesort JS)
    expect(audit.priorities[1].severity).toBe("warning");
    expect(audit.priorities[2].severity).toBe("warning");
  });

  it("topAlertsLimit=1 → 1 seule alerte remontée", () => {
    const audit = buildAuditContent({
      answers: [],
      alerts: alertsSample,
      topAlertsLimit: 1,
    });
    expect(audit.summary.topAlerts).toHaveLength(1);
    expect(audit.priorities).toHaveLength(1);
  });

  it("aucune alerte → priorities et topAlerts vides", () => {
    const audit = buildAuditContent({ answers: [] });
    expect(audit.priorities).toEqual([]);
    expect(audit.summary.topAlerts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (5) Synthèse dirigeant — 3 chiffres clés
// ---------------------------------------------------------------------------

describe("Synthèse dirigeant — SUMMARY_KEY_METRICS", () => {
  it("summary.keyMetrics = ratios sélectionnés par SUMMARY_KEY_METRICS", () => {
    const answers = [
      makeAnswer("perf-rate-mandat", "42"),
      makeAnswer("mandates-exclusivity-percent", "35"),
      makeAnswer("mandates-average-duration-months", "5"),
    ];
    const audit = buildAuditContent({ answers });
    expect(audit.summary.keyMetrics).toHaveLength(SUMMARY_KEY_METRICS.length);
    expect(audit.summary.keyMetrics.map((r) => r.key)).toEqual([
      "estimationToMandatPercent",
      "exclusivityPercent",
      "mandatesAverageDurationMonths",
    ]);
    expect(audit.summary.keyMetrics[0].value).toBe(42);
    expect(audit.summary.keyMetrics[1].value).toBe(35);
    expect(audit.summary.keyMetrics[2].value).toBe(5);
  });

  it("valeurs absentes → keyMetrics présents avec value=null", () => {
    const audit = buildAuditContent({ answers: [] });
    for (const km of audit.summary.keyMetrics) {
      expect(km.value).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// (6) Complétude — global + par bloc
// ---------------------------------------------------------------------------

describe("Complétude — global + par bloc", () => {
  it("réponses vides / skipped ne comptent pas comme répondues", () => {
    const answers = [
      makeAnswer("prospecting-script", "oui"), // compté
      makeAnswer("skill-prospection", "", { isSkipped: true }), // pas compté
      makeAnswer("perf-contacts-week", "   "), // pas compté (blanc)
      makeAnswer("perf-rate-rdv", "20"), // compté
    ];
    const audit = buildAuditContent({ answers });
    expect(audit.completeness.answeredCount).toBe(2);
    expect(audit.completeness.totalCount).toBe(71);
  });

  it("répartition par bloc cohérente (somme = total)", () => {
    const answers = [
      makeAnswer("prospecting-script", "oui"),
      makeAnswer("perf-contacts-week", "12"),
      makeAnswer("mandates-per-month", "3"),
    ];
    const audit = buildAuditContent({ answers });
    const perf = audit.completeness.byBlock.performance_chain;
    const prac = audit.completeness.byBlock.practices;
    expect(perf.answeredCount + prac.answeredCount).toBe(
      audit.completeness.answeredCount
    );
    expect(perf.totalCount + prac.totalCount).toBe(71);
    // 2 des 3 réponses sont bloc performance_chain, 1 bloc practices.
    expect(perf.answeredCount).toBe(2);
    expect(prac.answeredCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// (7) Bout-à-bout — agence fictive complète
// ---------------------------------------------------------------------------

describe("Bout-à-bout — agence fictive complète", () => {
  it("construction cohérente sur ~15 réponses variées + 2 alertes", () => {
    const answers: AnswerRecord[] = [
      // Prospection
      makeAnswer("prospecting-methods", "pige, recommandation"),
      makeAnswer("prospecting-who", "certains"),
      makeAnswer("prospecting-contacts-per-month", "80"),
      makeAnswer("seller-meetings-per-month", "22"),
      // Mandats
      makeAnswer("perf-rate-mandat", "38"),
      makeAnswer("mandates-exclusivity-percent", "45"),
      makeAnswer("mandates-average-duration-months", "6"),
      // Tunnel
      makeAnswer("visits-per-month", "60"),
      makeAnswer("offers-per-month", "25"),
      makeAnswer("compromis-per-month", "20"),
      makeAnswer("actes-per-month", "18"),
      // BDD & réputation
      makeAnswer("db-volume", "5400"),
      makeAnswer("google-reviews-count", "42"),
      makeAnswer("google-reviews-score", "4.7"),
      // Verbatims + practices
      makeAnswer("mgmt-top3-priorities", "Doubler l'exclu, recruter"),
      makeAnswer("skill-prospection", "non"),
    ];
    const alerts: DiagnosticAlert[] = [
      {
        code: "no_one_prospects",
        chapter: 3,
        label: "Prospection portée par personne",
        severity: "warning",
        observed: null,
        threshold: null,
      },
      {
        code: "rdv_to_mandat_below_benchmark",
        chapter: 5,
        label: "Taux RDV → mandat sous le benchmark",
        severity: "error",
        observed: 25,
        threshold: 40,
      },
    ];
    const audit = buildAuditContent({ answers, alerts });

    // Structure présente
    expect(audit.completeness.answeredCount).toBe(16);
    expect(audit.performanceChain.ratios.length).toBeGreaterThanOrEqual(15);
    expect(audit.practices.flags.length).toBeGreaterThanOrEqual(1);
    expect(audit.practices.verbatims.length).toBe(1);
    expect(audit.alerts).toHaveLength(2);

    // Priorité 1 = alerte error, verrouillé par tri sévérité
    expect(audit.priorities[0].sourceAlertCodes).toEqual([
      "rdv_to_mandat_below_benchmark",
    ]);
    expect(audit.priorities[0].severity).toBe("error");

    // Aucun ratio invente une valeur
    for (const r of audit.performanceChain.ratios) {
      if (r.value !== null) expect(Number.isFinite(r.value)).toBe(true);
    }

    // Note Google traitée sur 5
    const googleScore = audit.performanceChain.ratios.find(
      (r) => r.key === "googleReviewsScore"
    );
    expect(googleScore?.unit).toBe("rating_5");
    expect(googleScore?.status).toBe("above");
  });
});
