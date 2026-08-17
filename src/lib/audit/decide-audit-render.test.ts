import { describe, expect, it } from "vitest";

import type { AuditContent, AuditRatio } from "./build-audit-content";
import {
  decideAuditRender,
  decideRatioDisplay,
  isAuditAvailable,
} from "./decide-audit-render";

function makeRatio(overrides: Partial<AuditRatio> = {}): AuditRatio {
  return {
    key: "ratioX",
    label: "Ratio X",
    value: null,
    unit: "percent",
    benchmark: null,
    status: "no_data",
    sourceQuestionIds: ["q"],
    ...overrides,
  };
}

function makeAudit(overrides: Partial<AuditContent> = {}): AuditContent {
  return {
    completeness: {
      answeredCount: 0,
      totalCount: 71,
      byBlock: {
        performance_chain: { answeredCount: 0, totalCount: 30 },
        practices: { answeredCount: 0, totalCount: 41 },
      },
    },
    performanceChain: { ratios: [] },
    practices: { flags: [], gaps: [], verbatims: [] },
    alerts: [],
    internalAlerts: [],
    summary: { keyMetrics: [], topAlerts: [] },
    priorities: [],
    ...overrides,
  };
}

describe("decideRatioDisplay — trois états distincts", () => {
  it("with_benchmark : value + benchmark → chiffre + badge de statut", () => {
    const d = decideRatioDisplay(
      makeRatio({ value: 42, benchmark: 30, status: "above" })
    );
    expect(d.kind).toBe("with_benchmark");
    expect(d.showValue).toBe(true);
    expect(d.showStatusBadge).toBe(true);
    expect(d.emptyValueText).toBeNull();
  });

  it("value_only : value présente, benchmark absent → chiffre SEUL, aucun badge (surtout pas « Non mesuré » sous le chiffre)", () => {
    const d = decideRatioDisplay(
      makeRatio({ value: 4.7, benchmark: null, status: "no_benchmark" })
    );
    expect(d.kind).toBe("value_only");
    expect(d.showValue).toBe(true);
    expect(d.showStatusBadge).toBe(false);
    expect(d.emptyValueText).toBeNull();
  });

  it("no_data : pas de valeur → « Non renseigné », aucun chiffre, aucun badge", () => {
    const d = decideRatioDisplay(
      makeRatio({ value: null, benchmark: null, status: "no_data" })
    );
    expect(d.kind).toBe("no_data");
    expect(d.showValue).toBe(false);
    expect(d.showStatusBadge).toBe(false);
    expect(d.emptyValueText).toBe("Non renseigné");
  });

  it("no_data prime sur benchmark présent (ratio calculé sans dénominateur)", () => {
    const d = decideRatioDisplay(
      makeRatio({ value: null, benchmark: 30, status: "no_data" })
    );
    expect(d.kind).toBe("no_data");
    expect(d.showStatusBadge).toBe(false);
  });
});

describe("isAuditAvailable — gate CTA parcours diagnostic", () => {
  it("0 réponse → indisponible", () => {
    expect(isAuditAvailable(0)).toBe(false);
  });

  it("1 réponse → disponible (seuil identique à decideAuditRender)", () => {
    expect(isAuditAvailable(1)).toBe(true);
  });

  it("N réponses → disponible", () => {
    expect(isAuditAvailable(47)).toBe(true);
  });

  it("aligné avec decideAuditRender : answeredCount=0 ⇔ kind=empty", () => {
    const zeroAudit: AuditContent = {
      completeness: {
        answeredCount: 0,
        totalCount: 71,
        byBlock: {
          performance_chain: { answeredCount: 0, totalCount: 30 },
          practices: { answeredCount: 0, totalCount: 41 },
        },
      },
      performanceChain: { ratios: [] },
      practices: { flags: [], gaps: [], verbatims: [] },
      alerts: [],
      internalAlerts: [],
      summary: { keyMetrics: [], topAlerts: [] },
      priorities: [],
    };
    expect(isAuditAvailable(zeroAudit.completeness.answeredCount)).toBe(false);
    expect(decideAuditRender(zeroAudit).kind).toBe("empty");
  });
});

describe("decideAuditRender — état vide vs audit", () => {
  it("aucune réponse → kind=empty, aucune mention, pas d'exergue priorités", () => {
    const r = decideAuditRender(makeAudit());
    expect(r.kind).toBe("empty");
    expect(r.completenessLabel).toBeNull();
    expect(r.showPrioritiesQuote).toBe(false);
  });

  it("≥1 réponse → kind=audit, mention singulier « 1 réponse sur 71 »", () => {
    const r = decideAuditRender(
      makeAudit({
        completeness: {
          answeredCount: 1,
          totalCount: 71,
          byBlock: {
            performance_chain: { answeredCount: 1, totalCount: 30 },
            practices: { answeredCount: 0, totalCount: 41 },
          },
        },
      })
    );
    expect(r.kind).toBe("audit");
    expect(r.completenessLabel).toBe(
      "Audit établi sur la base de 1 réponse sur 71"
    );
  });

  it("≥2 réponses → pluriel « N réponses sur 71 »", () => {
    const r = decideAuditRender(
      makeAudit({
        completeness: {
          answeredCount: 47,
          totalCount: 71,
          byBlock: {
            performance_chain: { answeredCount: 20, totalCount: 30 },
            practices: { answeredCount: 27, totalCount: 41 },
          },
        },
      })
    );
    expect(r.completenessLabel).toBe(
      "Audit établi sur la base de 47 réponses sur 71"
    );
  });

  it("verbatim top3_priorities non-vide → showPrioritiesQuote=true", () => {
    const r = decideAuditRender(
      makeAudit({
        completeness: {
          answeredCount: 2,
          totalCount: 71,
          byBlock: {
            performance_chain: { answeredCount: 1, totalCount: 30 },
            practices: { answeredCount: 1, totalCount: 41 },
          },
        },
        practices: {
          flags: [],
          gaps: [],
          verbatims: [
            {
              key: "top3_priorities",
              label: "Top 3 priorités",
              content: "Doubler l'exclu, recruter, structurer la prospection",
              sourceQuestionIds: ["mgmt-top3-priorities"],
            },
          ],
        },
      })
    );
    expect(r.showPrioritiesQuote).toBe(true);
  });

  it("verbatim top3_priorities absent OU chaîne vide → showPrioritiesQuote=false", () => {
    const rAbsent = decideAuditRender(
      makeAudit({
        completeness: {
          answeredCount: 1,
          totalCount: 71,
          byBlock: {
            performance_chain: { answeredCount: 1, totalCount: 30 },
            practices: { answeredCount: 0, totalCount: 41 },
          },
        },
      })
    );
    expect(rAbsent.showPrioritiesQuote).toBe(false);

    const rEmpty = decideAuditRender(
      makeAudit({
        completeness: {
          answeredCount: 1,
          totalCount: 71,
          byBlock: {
            performance_chain: { answeredCount: 1, totalCount: 30 },
            practices: { answeredCount: 0, totalCount: 41 },
          },
        },
        practices: {
          flags: [],
          gaps: [],
          verbatims: [
            {
              key: "top3_priorities",
              label: "Top 3 priorités",
              content: "   ",
              sourceQuestionIds: ["mgmt-top3-priorities"],
            },
          ],
        },
      })
    );
    expect(rEmpty.showPrioritiesQuote).toBe(false);
  });
});
