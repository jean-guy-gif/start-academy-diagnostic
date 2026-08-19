import { describe, expect, it } from "vitest";

import type { AnswerRecord } from "@/lib/diagnostics/diagnostic-service";
import type { DiagnosticAlert } from "@/lib/diagnostics/ratios-service";
import { DEFAULT_BENCHMARKS } from "@/lib/diagnostics/ratios-service";
import { diagnosticQuestions } from "@/lib/data/diagnostic-questions";

import {
  CHOICE_GAP_EMPTY_KEY,
  PRACTICE_CHOICE_GAP_RULES,
  PRACTICE_GAP_STATEMENTS,
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
    expect(r?.status).toBe("no_data");
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

  it("données manquantes → value null, status no_data, JAMAIS de valeur inventée", () => {
    const audit = buildAuditContent({ answers: [] });
    for (const r of audit.performanceChain.ratios) {
      expect(r.value, `${r.key} devrait être null`).toBeNull();
      expect(r.status).toBe("no_data");
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

describe("google-reviews-score — note sur 5 sans benchmark (value_only)", () => {
  it("valeur 4,6 → value 4.6, unit rating_5, benchmark null, status no_benchmark", () => {
    const answers = [makeAnswer("google-reviews-score", "4,6")];
    const audit = buildAuditContent({ answers });
    const r = audit.performanceChain.ratios.find(
      (x) => x.key === "googleReviewsScore"
    );
    expect(r?.value).toBeCloseTo(4.6, 2);
    expect(r?.unit).toBe("rating_5");
    expect(r?.benchmark).toBeNull();
    expect(r?.status).toBe("no_benchmark");
  });

  it("valeur 3,8 → status no_benchmark (aucun seuil de dupliqué en dur)", () => {
    const answers = [makeAnswer("google-reviews-score", "3.8")];
    const audit = buildAuditContent({ answers });
    const r = audit.performanceChain.ratios.find(
      (x) => x.key === "googleReviewsScore"
    );
    expect(r?.status).toBe("no_benchmark");
  });
});

// ---------------------------------------------------------------------------
// Contract benchmarks partagés — pas de copie en dur des seuils
// ---------------------------------------------------------------------------

describe("Contract benchmarks — mêmes constantes que ratios-service, pas de copie en dur", () => {
  it("les benchmarks exposés correspondent à DEFAULT_BENCHMARKS (source unique)", () => {
    const audit = buildAuditContent({ answers: [] });
    const byKey = new Map(
      audit.performanceChain.ratios.map((r) => [r.key, r])
    );
    // Chaque ratio avec benchmark non-null DOIT correspondre à une
    // clé exacte de DEFAULT_BENCHMARKS. Si quelqu'un copie « 40 » en
    // dur au lieu de lire depuis la source, le mapping ci-dessous
    // reste vrai — donc on complète avec le test d'override qui
    // capte la copie en dur.
    expect(byKey.get("contactsToRdvPercent")?.benchmark).toBe(
      DEFAULT_BENCHMARKS.contactsToRdvPercent
    );
    expect(byKey.get("estimationToMandatPercent")?.benchmark).toBe(
      DEFAULT_BENCHMARKS.rdvToMandatPercent
    );
    expect(byKey.get("exclusivityPercent")?.benchmark).toBe(
      DEFAULT_BENCHMARKS.exclusivityPercent
    );
    expect(byKey.get("offresToCompromisPercent")?.benchmark).toBe(
      DEFAULT_BENCHMARKS.offresToCompromisPercent
    );
    expect(byKey.get("compromisToActePercent")?.benchmark).toBe(
      DEFAULT_BENCHMARKS.compromisToActePercent
    );
  });

  it("override `input.benchmarks` est propagé aux ratios — preuve qu'aucun seuil n'est copié en dur", () => {
    // Chaque seuil est repoussé à une valeur très distinctive : si
    // le module contenait une copie en dur (« 40 »), le benchmark
    // exposé ne bougerait pas et le test échouerait. Cast : le type
    // `BenchmarksOverride` porte les littéraux du const `as const`
    // du référentiel — l'override numérique par un chiffre distinct
    // n'est possible qu'en cast (contrainte de la source, pas du test).
    const override = {
      contactsToRdvPercent: 999,
      rdvToMandatPercent: 998,
      exclusivityPercent: 997,
      offresToCompromisPercent: 996,
      compromisToActePercent: 995,
    } as unknown as import("@/lib/diagnostics/ratios-service").BenchmarksOverride;
    const audit = buildAuditContent({
      answers: [],
      benchmarks: override,
    });
    const byKey = new Map(
      audit.performanceChain.ratios.map((r) => [r.key, r])
    );
    expect(byKey.get("contactsToRdvPercent")?.benchmark).toBe(999);
    expect(byKey.get("estimationToMandatPercent")?.benchmark).toBe(998);
    expect(byKey.get("exclusivityPercent")?.benchmark).toBe(997);
    expect(byKey.get("offresToCompromisPercent")?.benchmark).toBe(996);
    expect(byKey.get("compromisToActePercent")?.benchmark).toBe(995);
  });

  it("le statut est recalculé sur l'override — preuve que le seuil est LU dynamiquement, pas figé", () => {
    // Sans override, 45 % > benchmark 40 % (défaut) → status above.
    // Avec override 50 %, 45 % < 50 % → status below.
    const answers = [makeAnswer("perf-rate-mandat", "45")];

    const baseline = buildAuditContent({ answers });
    const baselineRatio = baseline.performanceChain.ratios.find(
      (r) => r.key === "estimationToMandatPercent"
    );
    expect(baselineRatio?.status).toBe("above");
    expect(baselineRatio?.benchmark).toBe(40);

    const overridden = buildAuditContent({
      answers,
      benchmarks: {
        rdvToMandatPercent: 50,
      } as unknown as import("@/lib/diagnostics/ratios-service").BenchmarksOverride,
    });
    const overriddenRatio = overridden.performanceChain.ratios.find(
      (r) => r.key === "estimationToMandatPercent"
    );
    expect(overriddenRatio?.status).toBe("below");
    expect(overriddenRatio?.benchmark).toBe(50);
  });
});

describe("higherIsWorse — ratios inversés", () => {
  it("chuteCompromisActePercent + mandatesAverageDurationMonths portent higherIsWorse=true", () => {
    const audit = buildAuditContent({ answers: [] });
    const byKey = new Map(
      audit.performanceChain.ratios.map((r) => [r.key, r])
    );
    expect(byKey.get("chuteCompromisActePercent")?.higherIsWorse).toBe(true);
    expect(byKey.get("mandatesAverageDurationMonths")?.higherIsWorse).toBe(
      true
    );
  });

  it("les autres ratios n'ont pas higherIsWorse (défaut = falsy)", () => {
    const audit = buildAuditContent({ answers: [] });
    const inverted = new Set([
      "chuteCompromisActePercent",
      "mandatesAverageDurationMonths",
    ]);
    for (const r of audit.performanceChain.ratios) {
      if (inverted.has(r.key)) continue;
      expect(r.higherIsWorse ?? false).toBe(false);
    }
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
// Verbatim pige_tool — source unique Ch.10 après consolidation
// (l'ancien doublon Ch.3 `prospecting-pige-tool` a été supprimé du
// questionnaire ; le dédup verbatim par « valeur la plus longue » n'est
// donc plus exercé — le mécanisme reste dans buildVerbatims mais ne
// s'applique plus qu'à une seule source ici.)
// ---------------------------------------------------------------------------

describe("Verbatim pige_tool — source unique tools-pige (Ch.10)", () => {
  it("renseigné → verbatim présent, seule source citée", () => {
    const audit = buildAuditContent({
      answers: [makeAnswer("tools-pige", "Périclès Web")],
    });
    const pige = audit.practices.verbatims.filter(
      (v) => v.key === "pige_tool"
    );
    expect(pige).toHaveLength(1);
    expect(pige[0].content).toBe("Périclès Web");
    expect(pige[0].sourceQuestionIds).toEqual(["tools-pige"]);
  });

  it("non renseigné → aucun verbatim pige_tool", () => {
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
      audience: "client",
      observed: null,
      threshold: null,
    },
    {
      code: "warning_test",
      chapter: 4,
      label: "Warning test",
      severity: "warning",
      audience: "client",
      observed: null,
      threshold: null,
    },
    {
      code: "error_test",
      chapter: 5,
      label: "Error test",
      severity: "error",
      audience: "client",
      observed: null,
      threshold: null,
    },
    {
      code: "warning_2",
      chapter: 6,
      label: "Warning 2",
      severity: "warning",
      audience: "client",
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
// (4-bis) Séparation audience client vs internal — lot audit-fix
// ---------------------------------------------------------------------------

describe("Alertes — audience 'internal' JAMAIS dans le doc client", () => {
  const mixed: DiagnosticAlert[] = [
    {
      code: "no_one_prospects",
      chapter: 3,
      label: "Personne ne prospecte",
      severity: "error",
      audience: "client",
      observed: null,
      threshold: null,
    },
    {
      code: "missing_required_data:perf-rate-mandat",
      chapter: 5,
      label: "Donnée obligatoire manquante — Taux RDV → mandat",
      severity: "warning",
      audience: "internal",
      observed: null,
      threshold: null,
    },
    {
      code: "missing_required_data:google-reviews-count",
      chapter: 9,
      label: "Donnée obligatoire manquante — Nombre d'avis Google",
      severity: "warning",
      audience: "internal",
      observed: null,
      threshold: null,
    },
  ];

  it("summary.topAlerts ne contient AUCUNE alerte internal", () => {
    const audit = buildAuditContent({ answers: [], alerts: mixed });
    expect(
      audit.summary.topAlerts.every((a) => a.audience === "client")
    ).toBe(true);
    expect(audit.summary.topAlerts.map((a) => a.code)).toEqual([
      "no_one_prospects",
    ]);
  });

  it("priorities ne contient AUCUNE alerte internal", () => {
    const audit = buildAuditContent({ answers: [], alerts: mixed });
    expect(audit.priorities).toHaveLength(1);
    expect(audit.priorities[0].sourceAlertCodes).toEqual(["no_one_prospects"]);
  });

  it("internalAlerts sépare exactement les 2 alertes internes", () => {
    const audit = buildAuditContent({ answers: [], alerts: mixed });
    expect(audit.internalAlerts).toHaveLength(2);
    expect(audit.internalAlerts.every((a) => a.audience === "internal")).toBe(
      true
    );
  });

  it("audit.alerts (pass-through) reste inchangé — les 3 alertes présentes", () => {
    const audit = buildAuditContent({ answers: [], alerts: mixed });
    expect(audit.alerts).toHaveLength(3);
  });

  it("filtrage structural, pas par texte : une alerte client avec 'missing' dans le code passe quand même", () => {
    const trap: DiagnosticAlert[] = [
      {
        code: "missing_offers_signal",
        chapter: 8,
        label: "Signal missing dans le code mais audience=client",
        severity: "warning",
        audience: "client",
        observed: null,
        threshold: null,
      },
    ];
    const audit = buildAuditContent({ answers: [], alerts: trap });
    expect(audit.summary.topAlerts).toHaveLength(1);
    expect(audit.summary.topAlerts[0].code).toBe("missing_offers_signal");
    expect(audit.internalAlerts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (4-ter) Ratio dérivé — chute compromis→acte non rendu (marqué derived)
// ---------------------------------------------------------------------------

describe("Ratios dérivés — dédoublonnage chute compromis→acte", () => {
  it("chuteCompromisActePercent est marqué derived: true", () => {
    const audit = buildAuditContent({
      answers: [makeAnswer("chute-compromis-acte-percent", "15")],
    });
    const r = audit.performanceChain.ratios.find(
      (x) => x.key === "chuteCompromisActePercent"
    );
    expect(r).toBeDefined();
    expect(r?.derived).toBe(true);
  });

  it("compromisToActePercent n'est PAS marqué derived", () => {
    const audit = buildAuditContent({
      answers: [
        makeAnswer("compromis-per-month", "20"),
        makeAnswer("actes-per-month", "18"),
      ],
    });
    const r = audit.performanceChain.ratios.find(
      (x) => x.key === "compromisToActePercent"
    );
    expect(r?.derived).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// (4-quater) Gaps par thème — bloc Pratiques version courte
// ---------------------------------------------------------------------------

describe("Practice gaps — constats de manque par thème", () => {
  it("yesno === false + mapping présent → un gap est émis", () => {
    const audit = buildAuditContent({
      answers: [makeAnswer("seller-discovery-formalized", "non")],
    });
    const gap = audit.practices.gaps.find(
      (g) => g.sourceQuestionId === "seller-discovery-formalized"
    );
    expect(gap).toBeDefined();
    expect(gap?.statement).toBe("Pas de trame de découverte vendeur");
    expect(gap?.theme).toBe("seller_rituals");
  });

  it("yesno === true → aucun gap (la pratique EST présente)", () => {
    const audit = buildAuditContent({
      answers: [makeAnswer("seller-discovery-formalized", "oui")],
    });
    const gap = audit.practices.gaps.find(
      (g) => g.sourceQuestionId === "seller-discovery-formalized"
    );
    expect(gap).toBeUndefined();
  });

  it("yesno === false SANS mapping → aucun gap (mapping ID explicite requis)", () => {
    const audit = buildAuditContent({
      answers: [makeAnswer("mgmt-team-meeting-frequency", "non")],
    });
    const gap = audit.practices.gaps.find(
      (g) => g.sourceQuestionId === "mgmt-team-meeting-frequency"
    );
    expect(gap).toBeUndefined();
  });

  it("aucune réponse → aucun gap", () => {
    const audit = buildAuditContent({ answers: [] });
    expect(audit.practices.gaps).toEqual([]);
  });

  it("mgmt-recruitment n'émet PAS de gap (retiré du mapping — un recrutement en cours n'est pas un manquement)", () => {
    const audit = buildAuditContent({
      answers: [makeAnswer("mgmt-recruitment", "non")],
    });
    expect(
      audit.practices.gaps.find((g) => g.sourceQuestionId === "mgmt-recruitment")
    ).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // Règles CHOICE — valeur retenue → constat spécifique
  // -------------------------------------------------------------------------

  it("mandates-price-above-market = souvent → constat de dérive tarifaire", () => {
    const audit = buildAuditContent({
      answers: [makeAnswer("mandates-price-above-market", "souvent")],
    });
    const gap = audit.practices.gaps.find(
      (g) => g.sourceQuestionId === "mandates-price-above-market"
    );
    expect(gap?.statement).toBe(
      "Prise de mandats au-dessus du prix de marché sans stratégie de repli"
    );
    expect(gap?.theme).toBe("mandates_setup");
  });

  it("mandates-price-above-market = parfois OU jamais → AUCUN gap", () => {
    for (const v of ["parfois", "jamais"]) {
      const audit = buildAuditContent({
        answers: [makeAnswer("mandates-price-above-market", v)],
      });
      expect(
        audit.practices.gaps.find(
          (g) => g.sourceQuestionId === "mandates-price-above-market"
        )
      ).toBeUndefined();
    }
  });

  it("db-crm-uptodate = non → « Base de contacts obsolète »", () => {
    const audit = buildAuditContent({
      answers: [makeAnswer("db-crm-uptodate", "non")],
    });
    const gap = audit.practices.gaps.find(
      (g) => g.sourceQuestionId === "db-crm-uptodate"
    );
    expect(gap?.statement).toBe("Base de contacts obsolète");
  });

  it("db-crm-uptodate = partiellement → « Base de contacts partiellement à jour »", () => {
    const audit = buildAuditContent({
      answers: [makeAnswer("db-crm-uptodate", "partiellement")],
    });
    const gap = audit.practices.gaps.find(
      (g) => g.sourceQuestionId === "db-crm-uptodate"
    );
    expect(gap?.statement).toBe("Base de contacts partiellement à jour");
  });

  it("db-crm-uptodate = oui → AUCUN gap", () => {
    const audit = buildAuditContent({
      answers: [makeAnswer("db-crm-uptodate", "oui")],
    });
    expect(
      audit.practices.gaps.find((g) => g.sourceQuestionId === "db-crm-uptodate")
    ).toBeUndefined();
  });

  it("choice avec casse mixte / espaces → toujours matché (comparaison normalisée)", () => {
    const audit = buildAuditContent({
      answers: [makeAnswer("mandates-price-above-market", "  Souvent  ")],
    });
    expect(
      audit.practices.gaps.find(
        (g) => g.sourceQuestionId === "mandates-price-above-market"
      )?.statement
    ).toBe(
      "Prise de mandats au-dessus du prix de marché sans stratégie de repli"
    );
  });

  // -------------------------------------------------------------------------
  // Règle MULTICHOICE — tools-ai-usage
  // -------------------------------------------------------------------------

  it("tools-ai-usage = [aucun] → « Aucun outil IA utilisé au quotidien »", () => {
    const audit = buildAuditContent({
      answers: [makeAnswer("tools-ai-usage", '["aucun"]')],
    });
    const gap = audit.practices.gaps.find(
      (g) => g.sourceQuestionId === "tools-ai-usage"
    );
    expect(gap?.statement).toBe("Aucun outil IA utilisé au quotidien");
    expect(gap?.theme).toBe("tools_ai");
  });

  it("tools-ai-usage = [] (sélection vide) → même constat que aucun", () => {
    const audit = buildAuditContent({
      answers: [makeAnswer("tools-ai-usage", "[]")],
    });
    const gap = audit.practices.gaps.find(
      (g) => g.sourceQuestionId === "tools-ai-usage"
    );
    expect(gap?.statement).toBe("Aucun outil IA utilisé au quotidien");
  });

  it("tools-ai-usage = [redaction_annonces] → AUCUN gap", () => {
    const audit = buildAuditContent({
      answers: [makeAnswer("tools-ai-usage", '["redaction_annonces"]')],
    });
    expect(
      audit.practices.gaps.find((g) => g.sourceQuestionId === "tools-ai-usage")
    ).toBeUndefined();
  });

  it("tools-ai-usage = [redaction_annonces, estimation] → AUCUN gap", () => {
    const audit = buildAuditContent({
      answers: [
        makeAnswer("tools-ai-usage", '["redaction_annonces","estimation"]'),
      ],
    });
    expect(
      audit.practices.gaps.find((g) => g.sourceQuestionId === "tools-ai-usage")
    ).toBeUndefined();
  });

  it("tools-ai-usage = [aucun, redaction_annonces] (données incohérentes) → gap émis quand même (aucun présent)", () => {
    const audit = buildAuditContent({
      answers: [
        makeAnswer("tools-ai-usage", '["aucun","redaction_annonces"]'),
      ],
    });
    expect(
      audit.practices.gaps.find((g) => g.sourceQuestionId === "tools-ai-usage")
        ?.statement
    ).toBe("Aucun outil IA utilisé au quotidien");
  });
});

// ---------------------------------------------------------------------------
// (4-quinquies) Contract tests structurels — mapping ↔ type déclaré
// ---------------------------------------------------------------------------
//
// Ces tests garantissent qu'on ne peut plus jamais mapper une question
// vers un mauvais système de gap sans que la CI ne pête. Toute drift
// silencieuse (question retypée dans le questionnaire, mapping oublié)
// est bloquée à la construction du build.

describe("Contract — mapping des gaps aligné avec les types du questionnaire", () => {
  it("chaque ID de PRACTICE_GAP_STATEMENTS est de type yesno", () => {
    const violations: string[] = [];
    for (const id of Object.keys(PRACTICE_GAP_STATEMENTS)) {
      const q = diagnosticQuestions.find((x) => x.id === id);
      if (!q) {
        violations.push(`${id} : question introuvable dans diagnosticQuestions`);
        continue;
      }
      if (q.type !== "yesno") {
        violations.push(`${id} : type "${q.type}" (attendu "yesno")`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("chaque ID de PRACTICE_CHOICE_GAP_RULES est de type choice ou multichoice", () => {
    const violations: string[] = [];
    for (const id of Object.keys(PRACTICE_CHOICE_GAP_RULES)) {
      const q = diagnosticQuestions.find((x) => x.id === id);
      if (!q) {
        violations.push(`${id} : question introuvable dans diagnosticQuestions`);
        continue;
      }
      if (q.type !== "choice" && q.type !== "multichoice") {
        violations.push(
          `${id} : type "${q.type}" (attendu "choice" ou "multichoice")`
        );
      }
    }
    expect(violations).toEqual([]);
  });

  it("chaque clé non-sentinelle d'une règle choice/multichoice existe dans les choices déclarés", () => {
    const violations: string[] = [];
    for (const [id, rules] of Object.entries(PRACTICE_CHOICE_GAP_RULES)) {
      const q = diagnosticQuestions.find((x) => x.id === id);
      if (!q || (q.type !== "choice" && q.type !== "multichoice")) continue;
      const declaredChoices = new Set(
        (q.choices ?? []).map((c) => c.trim().toLowerCase())
      );
      for (const key of Object.keys(rules)) {
        if (key === CHOICE_GAP_EMPTY_KEY) continue;
        if (!declaredChoices.has(key)) {
          violations.push(
            `${id} : clé "${key}" absente des choices [${(q.choices ?? []).join(", ")}]`
          );
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("aucun ID ne peut être mappé simultanément dans yesno et choice (systèmes exclusifs)", () => {
    const dupes = Object.keys(PRACTICE_GAP_STATEMENTS).filter(
      (id) => id in PRACTICE_CHOICE_GAP_RULES
    );
    expect(dupes).toEqual([]);
  });

  it("__empty__ n'est utilisé que pour des questions multichoice (sémantique définie uniquement là)", () => {
    const violations: string[] = [];
    for (const [id, rules] of Object.entries(PRACTICE_CHOICE_GAP_RULES)) {
      if (!(CHOICE_GAP_EMPTY_KEY in rules)) continue;
      const q = diagnosticQuestions.find((x) => x.id === id);
      if (q?.type !== "multichoice") {
        violations.push(
          `${id} : __empty__ défini mais type "${q?.type}" (attendu "multichoice")`
        );
      }
    }
    expect(violations).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (5) Synthèse dirigeant — 3 chiffres clés
// ---------------------------------------------------------------------------

describe("Synthèse dirigeant — SUMMARY_KEY_METRICS liste de préférence (correction audit imprimé)", () => {
  it("3 ratios prioritaires renseignés → keyMetrics = les 3, dans l'ordre de préférence", () => {
    const answers = [
      makeAnswer("perf-rate-mandat", "42"),
      makeAnswer("mandates-exclusivity-percent", "35"),
      makeAnswer("mandates-average-duration-months", "5"),
    ];
    const audit = buildAuditContent({ answers });
    expect(audit.summary.keyMetrics).toHaveLength(3);
    expect(audit.summary.keyMetrics.map((r) => r.key)).toEqual([
      "estimationToMandatPercent",
      "exclusivityPercent",
      "mandatesAverageDurationMonths",
    ]);
  });

  it("moins de 3 renseignés → keyMetrics ne contient QUE ce qui existe (jamais de « Non mesuré » en synthèse)", () => {
    const answers = [
      makeAnswer("perf-rate-mandat", "42"), // 1 seul renseigné
    ];
    const audit = buildAuditContent({ answers });
    expect(audit.summary.keyMetrics).toHaveLength(1);
    expect(audit.summary.keyMetrics[0].key).toBe("estimationToMandatPercent");
    expect(audit.summary.keyMetrics[0].value).toBe(42);
  });

  it("aucun ratio renseigné → keyMetrics est VIDE (aucun « Non mesuré » affiché)", () => {
    const audit = buildAuditContent({ answers: [] });
    expect(audit.summary.keyMetrics).toEqual([]);
  });

  it("les 3 prioritaires manquent mais les repli sont renseignés → repli utilisés dans l'ordre", () => {
    // Aucun des 3 prioritaires. Les repli (contactsToRdv, compromis→acte,
    // offres→compromis) sont calculés via des ratios d'input.
    const answers = [
      makeAnswer("prospecting-contacts-per-month", "100"),
      makeAnswer("seller-meetings-per-month", "25"), // contactsToRdv = 25%
      makeAnswer("compromis-per-month", "20"),
      makeAnswer("actes-per-month", "18"), // compromisToActe = 90%
    ];
    const audit = buildAuditContent({ answers });
    // On attend les 2 repli renseignés en ordre : contactsToRdv puis compromisToActe.
    expect(audit.summary.keyMetrics.length).toBeGreaterThanOrEqual(2);
    const keys = audit.summary.keyMetrics.map((r) => r.key);
    expect(keys).toContain("contactsToRdvPercent");
    expect(keys).toContain("compromisToActePercent");
    // Vérifie ordre de préférence : contactsToRdvPercent avant compromisToActePercent.
    expect(keys.indexOf("contactsToRdvPercent")).toBeLessThan(
      keys.indexOf("compromisToActePercent")
    );
  });

  it("liste de préférence exposée avec au moins les 3 ratios prioritaires en tête", () => {
    // Sanity : le premier de la liste doit rester `estimationToMandatPercent`.
    expect(SUMMARY_KEY_METRICS[0]).toBe("estimationToMandatPercent");
    expect(SUMMARY_KEY_METRICS.length).toBeGreaterThanOrEqual(3);
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
    expect(audit.completeness.totalCount).toBe(69);
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
    expect(perf.totalCount + prac.totalCount).toBe(69);
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
        audience: "client",
        observed: null,
        threshold: null,
      },
      {
        code: "rdv_to_mandat_below_benchmark",
        chapter: 5,
        label: "Taux RDV → mandat sous le benchmark",
        severity: "error",
        audience: "client",
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

    // Note Google traitée sur 5, sans benchmark → value_only :
    // valeur présente mais aucun repère → status no_benchmark.
    const googleScore = audit.performanceChain.ratios.find(
      (r) => r.key === "googleReviewsScore"
    );
    expect(googleScore?.unit).toBe("rating_5");
    expect(googleScore?.status).toBe("no_benchmark");
    expect(googleScore?.benchmark).toBeNull();
  });
});
