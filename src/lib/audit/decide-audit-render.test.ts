import { describe, expect, it } from "vitest";

import type { AuditContent } from "./build-audit-content";
import { decideAuditRender } from "./decide-audit-render";

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
    practices: { flags: [], verbatims: [] },
    alerts: [],
    summary: { keyMetrics: [], topAlerts: [] },
    priorities: [],
    ...overrides,
  };
}

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
