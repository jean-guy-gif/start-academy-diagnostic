import { NextResponse } from "next/server";
import { z } from "zod";

import { assertCanAccessDiagnostic } from "@/lib/auth/assert-diagnostic-access";
import { getCurrentProfile } from "@/lib/auth/get-current-user";
import { hasRole, INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import {
  listDiagnosticParticipants,
  replaceDiagnosticParticipants,
} from "@/lib/diagnostics/diagnostic-participants-service";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const ParticipantSchema = z.object({
  firstName: z.string().max(80).nullable().optional(),
  professionalStatus: z
    .enum(["salarie", "agent_commercial_independant", "autre"])
    .nullable()
    .optional(),
  previousYearProduction: z.number().nonnegative().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  // v1.0 — saisie partielle autorisée (tout optionnel + nullable).
  lastName: z.string().max(80).nullable().optional(),
  entryDate: z.string().max(40).nullable().optional(),
  formations24mCount: z.number().int().nonnegative().nullable().optional(),
  formations24mHours: z.number().nonnegative().nullable().optional(),
  formations24mAmount: z.number().nonnegative().nullable().optional(),
  expertLevel: z.enum(["debutant", "confirme", "expert"]).nullable().optional(),
  caAnneeEnCours: z.number().nonnegative().nullable().optional(),
  wantsEvolution: z.boolean().nullable().optional(),
  wantsTraining: z.boolean().nullable().optional(),
  priorityNeed: z.string().max(500).nullable().optional(),
  jobTitle: z.string().max(120).nullable().optional(),
  contractType: z.enum(["temps_plein", "temps_partiel"]).nullable().optional(),
  conventionCollective: z.string().max(200).nullable().optional(),
  eligibleOpco: z.boolean().nullable().optional(),
});

const BodySchema = z.object({
  participants: z.array(ParticipantSchema).max(50),
  costPerParticipant: z.number().nonnegative().nullable().optional(),
});

/**
 * GET   /api/diagnostics/[id]/participants  → liste prévisionnelle
 * PUT   /api/diagnostics/[id]/participants  → remplace toute la liste
 *
 * Auth obligatoire (rôle interne). La règle prise en charge est
 * recalculée côté serveur (le client envoie statut + production, le
 * serveur calcule estimation via `training-funding`).
 */
export async function GET(_request: Request, context: RouteContext) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json(
      { error: "Authentification requise." },
      { status: 401 }
    );
  }
  if (!hasRole(profile, INTERNAL_APP_ROLES)) {
    return NextResponse.json({ error: "Rôle insuffisant." }, { status: 403 });
  }

  const { id: diagnosticId } = await context.params;
  // T-9 fix (2026-07-09) — cloisonnement lecture participants. Fuite
  // potentielle (nom + statut pro + CA N-1 + éligibilité OPCO / AGEFICE
  // par participant nominatif — cf. Ch.2.2/2.3 du référentiel v1.0).
  const access = await assertCanAccessDiagnostic(profile, diagnosticId);
  if (!access.ok) return access.response;
  const participants = await listDiagnosticParticipants(diagnosticId);
  return NextResponse.json({ participants });
}

export async function PUT(request: Request, context: RouteContext) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json(
      { error: "Authentification requise." },
      { status: 401 }
    );
  }
  if (!hasRole(profile, INTERNAL_APP_ROLES)) {
    return NextResponse.json({ error: "Rôle insuffisant." }, { status: 403 });
  }

  const { id: diagnosticId } = await context.params;
  // T-9 fix (2026-07-09) — cloisonnement écriture participants. Avant :
  // rôle seul, un commercial pouvait remplacer la liste des
  // participants prévisionnels d'un diagnostic tiers (impact direct sur
  // l'estimation funding et la génération de proposition).
  const access = await assertCanAccessDiagnostic(profile, diagnosticId);
  if (!access.ok) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Corps JSON invalide." },
      { status: 400 }
    );
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Payload invalide.", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const participants = await replaceDiagnosticParticipants({
    diagnosticId,
    participants: parsed.data.participants.map((p) => ({
      firstName: p.firstName ?? null,
      professionalStatus: p.professionalStatus ?? null,
      previousYearProduction: p.previousYearProduction ?? null,
      notes: p.notes ?? null,
      lastName: p.lastName ?? null,
      entryDate: p.entryDate ?? null,
      formations24mCount: p.formations24mCount ?? null,
      formations24mHours: p.formations24mHours ?? null,
      formations24mAmount: p.formations24mAmount ?? null,
      expertLevel: p.expertLevel ?? null,
      caAnneeEnCours: p.caAnneeEnCours ?? null,
      wantsEvolution: p.wantsEvolution ?? null,
      wantsTraining: p.wantsTraining ?? null,
      priorityNeed: p.priorityNeed ?? null,
      jobTitle: p.jobTitle ?? null,
      contractType: p.contractType ?? null,
      conventionCollective: p.conventionCollective ?? null,
      eligibleOpco: p.eligibleOpco ?? null,
    })),
    costPerParticipant: parsed.data.costPerParticipant ?? null,
  });

  return NextResponse.json({ participants });
}
