import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests non négociables du service serveur `proposals` :
 *
 *   • Contract F-1 — la row `proposal_json` doit passer `ProposalSchema`
 *     Zod à la lecture. Une row corrompue en base est rejetée
 *     (persistence_failed avec message clair), jamais silencieusement
 *     acceptée.
 *
 *   • Ownership T-9 (couche service) — `assertCanAccessDiagnostic`
 *     est invoqué AVANT toute lecture DB. Sur owner-mismatch, la
 *     fonction renvoie `forbidden` ET `createSupabaseAdminClient`
 *     N'EST PAS invoqué. Le retrait de l'assertion ferait échouer ce
 *     test.
 *
 *   • Upsert — 2 générations successives sur le même diagnostic_id
 *     n'appellent PAS insert() séparément : le service passe par
 *     `upsert(..., { onConflict: 'diagnostic_id' })` — la contrainte
 *     unique en base garantit qu'il y a au plus 1 row par diagnostic.
 */

vi.mock("@/lib/auth/assert-diagnostic-access", () => ({
  assertCanAccessDiagnostic: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseAdminClient: vi.fn(),
}));

async function importMocks() {
  const access = await import("@/lib/auth/assert-diagnostic-access");
  const supa = await import("@/lib/supabase/server");
  return {
    assertCanAccessDiagnostic: vi.mocked(access.assertCanAccessDiagnostic),
    createSupabaseAdminClient: vi.mocked(supa.createSupabaseAdminClient),
  };
}

const PROFILE_OWNER = {
  id: "user-A",
  role: "commercial" as const,
  email: "a@t.test",
  full_name: "Commercial A",
  organization: null,
};

const VALID_PROPOSAL_JSON = {
  proposalTitle: "T",
  executiveSummary: "S",
  trainingProgram: {
    totalDurationHours: 4,
    suggestedFormat: "F",
    targetAudience: "A",
    pedagogicalObjectives: [],
    modules: [],
  },
  pricing: {
    costPerParticipant: 336,
    participantCount: 1,
    totalEstimatedCost: 336,
    pricingNote: null,
    estimatedFundingTotal: null,
    estimatedRemainingCost: null,
    eligibleParticipantCount: null,
    fundingDisclaimer: null,
    ageficePresentielCoverage: null,
  },
  nextStepsGuide: {
    steps: [
      {
        title: "Valider la proposition",
        description: "Retour dirigeant sous 48h.",
        actionRequired: "Validation par email",
      },
    ],
  },
  executiveEmail: { subject: "S", body: "B" },
  internalCommunicationPack: {
    whatsappMessage: "W",
    internalEmail: "E",
    teamMeetingPitch: "P",
    linkedinPost: "L",
  },
  missingInformation: [],
  confidenceScore: 80,
};

const CORRUPT_PROPOSAL_JSON = {
  // proposalTitle manquant → Zod rejette
  executiveSummary: "S",
};

function buildSelectChain(row: unknown) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        maybeSingle: vi.fn().mockResolvedValue({ data: row, error: null }),
      }),
    }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Contract F-1 — proposal_json validé par ProposalSchema à la lecture", () => {
  it("row valide → { ok: true, proposal }", async () => {
    const mocks = await importMocks();
    mocks.assertCanAccessDiagnostic.mockResolvedValue({ ok: true });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue(
        buildSelectChain({
          id: "prop-1",
          diagnostic_id: "DIAG_A",
          recommendation_id: null,
          proposal_json: VALID_PROPOSAL_JSON,
          source: "llm",
          provider: "openrouter",
          model: "claude-sonnet-4.5",
          generated_at: "2026-07-18T15:00:00Z",
          notes: [],
          created_by: PROFILE_OWNER.id,
          created_at: "2026-07-18T15:00:00Z",
          updated_at: "2026-07-18T15:00:00Z",
        })
      ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { getProposalByDiagnosticId } = await import("./proposal-server-service");
    const result = await getProposalByDiagnosticId("DIAG_A", PROFILE_OWNER);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.proposal).not.toBeNull();
      expect(result.proposal?.id).toBe("prop-1");
      expect(result.proposal?.proposal.confidenceScore).toBe(80);
    }
  });

  it("row corrompue en base → { ok: false, reason: 'persistence_failed' } avec message", async () => {
    const mocks = await importMocks();
    mocks.assertCanAccessDiagnostic.mockResolvedValue({ ok: true });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue(
        buildSelectChain({
          id: "prop-corrupt",
          diagnostic_id: "DIAG_A",
          recommendation_id: null,
          proposal_json: CORRUPT_PROPOSAL_JSON, // schema Zod incomplet
          source: "llm",
          provider: null,
          model: null,
          generated_at: "2026-07-18T15:00:00Z",
          notes: null,
          created_by: PROFILE_OWNER.id,
          created_at: "2026-07-18T15:00:00Z",
          updated_at: "2026-07-18T15:00:00Z",
        })
      ),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { getProposalByDiagnosticId } = await import("./proposal-server-service");
    const result = await getProposalByDiagnosticId("DIAG_A", PROFILE_OWNER);
    // Preuve F-1 : la row corrompue N'EST PAS silencieusement acceptée.
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("persistence_failed");
    }
  });

  it("aucune row → { ok: true, proposal: null } (pas d'erreur)", async () => {
    const mocks = await importMocks();
    mocks.assertCanAccessDiagnostic.mockResolvedValue({ ok: true });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue(buildSelectChain(null)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { getProposalByDiagnosticId } = await import("./proposal-server-service");
    const result = await getProposalByDiagnosticId("DIAG_A", PROFILE_OWNER);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.proposal).toBeNull();
  });
});

describe("T-9 ownership — service", () => {
  it("owner-mismatch → forbidden + createSupabaseAdminClient JAMAIS appelé", async () => {
    const mocks = await importMocks();
    mocks.assertCanAccessDiagnostic.mockResolvedValue({
      ok: false as const,
      // Response non utilisée par le service, requise par la signature.
      // NextResponse (pas Response) pour matcher le type d'AssertResult.
      response: NextResponse.json(
        { ok: false, code: "forbidden" },
        { status: 403 }
      ),
    });

    const { getProposalByDiagnosticId, upsertProposal } = await import(
      "./proposal-server-service"
    );

    const getResult = await getProposalByDiagnosticId("DIAG_A", PROFILE_OWNER);
    expect(getResult.ok).toBe(false);
    if (!getResult.ok) expect(getResult.reason).toBe("forbidden");

    const putResult = await upsertProposal(
      "DIAG_A",
      {
        recommendationId: null,
        generation: {
          proposal: VALID_PROPOSAL_JSON,
          source: "llm",
          provider: null,
          model: null,
          generatedAt: "2026-07-18T15:00:00Z",
          notes: [],
        },
      },
      PROFILE_OWNER
    );
    expect(putResult.ok).toBe(false);
    if (!putResult.ok) expect(putResult.reason).toBe("forbidden");

    // Preuve T-9 : le client admin (donc Supabase) n'a JAMAIS été
    // instancié. Retrait de `assertCanAccessDiagnostic` du service
    // casserait ce garde-fou.
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled();
  });
});

describe("Upsert — 2ᵉ génération sur le même diagnostic_id écrase (ne duplique pas)", () => {
  it("appelle upsert() avec onConflict='diagnostic_id' (jamais insert() séparé)", async () => {
    const mocks = await importMocks();
    mocks.assertCanAccessDiagnostic.mockResolvedValue({ ok: true });
    const upsertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "prop-1", // même id à chaque appel — semantique upsert
            diagnostic_id: "DIAG_A",
            recommendation_id: null,
            proposal_json: VALID_PROPOSAL_JSON,
            source: "llm",
            provider: null,
            model: null,
            generated_at: "2026-07-18T15:00:00Z",
            notes: [],
            created_by: PROFILE_OWNER.id,
            created_at: "2026-07-18T15:00:00Z",
            updated_at: "2026-07-18T15:00:00Z",
          },
          error: null,
        }),
      }),
    });
    mocks.createSupabaseAdminClient.mockReturnValue({
      from: vi.fn().mockReturnValue({ upsert: upsertMock }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const { upsertProposal } = await import("./proposal-server-service");
    const input = {
      recommendationId: null,
      generation: {
        proposal: VALID_PROPOSAL_JSON,
        source: "llm" as const,
        provider: null,
        model: null,
        generatedAt: "2026-07-18T15:00:00Z",
        notes: [],
      },
    };
    await upsertProposal("DIAG_A", input, PROFILE_OWNER);
    await upsertProposal("DIAG_A", input, PROFILE_OWNER);

    // Preuve : les 2 appels utilisent upsert() (pas insert()) et
    // spécifient onConflict='diagnostic_id'. La contrainte unique en
    // base garantit alors qu'il y a au plus 1 row par diagnostic.
    expect(upsertMock).toHaveBeenCalledTimes(2);
    for (const call of upsertMock.mock.calls) {
      expect(call[1]).toEqual({ onConflict: "diagnostic_id" });
    }
  });
});
