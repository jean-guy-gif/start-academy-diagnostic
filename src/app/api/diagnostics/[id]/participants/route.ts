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

const ParticipantSchema = z
  .object({
    firstName: z.string().max(80).nullable().optional(),
    professionalStatus: z
      .enum(["salarie", "agent_commercial_independant", "autre"])
      .nullable()
      .optional(),
    // CA N-1 : indé uniquement — refinement plus bas rejette toute
    // valeur non-null quand statut=salarie (le CHECK constraint SQL
    // `diagnostic_participants_no_n1_for_salarie` fait le même filet
    // côté base, cf. migration 20260719120000).
    previousYearProduction: z.number().nonnegative().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    // v1.0 — saisie partielle autorisée (tout optionnel + nullable).
    lastName: z.string().max(80).nullable().optional(),
    entryDate: z.string().max(40).nullable().optional(),
    // Chantier C1 — heures de formation utilisées cette année civile.
    // Les 2 statuts. Nouveau champ.
    formationsCurrentYearHours: z
      .number()
      .nonnegative()
      .nullable()
      .optional(),
    expertLevel: z
      .enum(["debutant", "confirme", "expert"])
      .nullable()
      .optional(),
    caAnneeEnCours: z.number().nonnegative().nullable().optional(),
    // Chantier A funding-opco-ep §9.2 — montant AGEFICE déjà consommé
    // depuis janvier de l'année civile en cours par ce collaborateur
    // (indé). Le service `training-funding` retranche cette valeur du
    // plafond AGEFICE AVANT le calcul du reste à charge.
    ageficeAmountConsumedCurrentYear: z
      .number()
      .nonnegative()
      .nullable()
      .optional(),
    wantsEvolution: z.boolean().nullable().optional(),
    wantsTraining: z.boolean().nullable().optional(),
    priorityNeed: z.string().max(500).nullable().optional(),
    jobTitle: z.string().max(120).nullable().optional(),
    contractType: z
      .enum(["temps_plein", "temps_partiel"])
      .nullable()
      .optional(),
    conventionCollective: z.string().max(200).nullable().optional(),
    eligibleOpco: z.boolean().nullable().optional(),
    // Chantier C1 — montant OPCO EP pris en charge pour ce salarié
    // cette année civile. Collecté seulement, PAS utilisé dans le
    // calcul (refonte enveloppe entreprise au chantier B).
    opcoEpAmountConsumedCurrentYear: z
      .number()
      .nonnegative()
      .nullable()
      .optional(),
  })
  .refine(
    (p) =>
      p.professionalStatus !== "salarie" ||
      p.previousYearProduction === null ||
      p.previousYearProduction === undefined,
    {
      message:
        "Un salarié ne peut pas avoir de production N-1 (champ réservé aux agents commerciaux indépendants).",
      path: ["previousYearProduction"],
    }
  );

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
      // Chantier C1 — les 3 champs `formations24m*` NE SONT PLUS
      // reçus (le schema Zod ci-dessus les rejette avec strict-by-
      // default). Les valeurs déjà en base restent intactes ; le
      // service `replaceDiagnosticParticipants` ne les écrasera pas
      // (mapper ne fournit plus la clé). Drop des colonnes prévu en
      // PR séparée après bascule complète.
      formationsCurrentYearHours: p.formationsCurrentYearHours ?? null,
      expertLevel: p.expertLevel ?? null,
      caAnneeEnCours: p.caAnneeEnCours ?? null,
      ageficeAmountConsumedCurrentYear:
        p.ageficeAmountConsumedCurrentYear ?? null,
      wantsEvolution: p.wantsEvolution ?? null,
      wantsTraining: p.wantsTraining ?? null,
      priorityNeed: p.priorityNeed ?? null,
      jobTitle: p.jobTitle ?? null,
      contractType: p.contractType ?? null,
      conventionCollective: p.conventionCollective ?? null,
      eligibleOpco: p.eligibleOpco ?? null,
      opcoEpAmountConsumedCurrentYear:
        p.opcoEpAmountConsumedCurrentYear ?? null,
    })),
    costPerParticipant: parsed.data.costPerParticipant ?? null,
  });

  return NextResponse.json({ participants });
}
