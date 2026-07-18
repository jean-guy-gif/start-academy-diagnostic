import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiRole } from "@/lib/auth/require-api-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { assertCanAccessDiagnostic } from "@/lib/auth/assert-diagnostic-access";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Chantier A funding-opco-ep §9.1 — persiste la consommation OPCO EP
// annuelle entreprise saisie par le dirigeant en synthèse ch.2. NULL
// autorisé : le user peut ne pas savoir (le funding produira un warning
// « estimation à valider » plutôt que de calculer sur 0).
const BodySchema = z.object({
  opcoEpAmountConsumedCurrentYear: z.number().nonnegative().nullable(),
});

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiRole(INTERNAL_APP_ROLES);
  if (!auth.ok) return auth.response;

  const { id: diagnosticId } = await context.params;
  if (!diagnosticId) {
    return NextResponse.json(
      { ok: false, code: "invalid_input", error: "diagnosticId manquant." },
      { status: 400 }
    );
  }

  // T-9 pattern — cloisonnement écriture sur le champ funding
  // (visibilité budget entreprise). Un commercial ne peut modifier ce
  // champ que sur un diagnostic dont il est propriétaire (ou admin).
  const access = await assertCanAccessDiagnostic(auth.profile, diagnosticId);
  if (!access.ok) return access.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "invalid_input", error: "Corps JSON invalide." },
      { status: 400 }
    );
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        code: "invalid_input",
        error: "Payload invalide.",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    return NextResponse.json(
      {
        ok: false,
        code: "service_unavailable",
        error: "Persistance Supabase indisponible.",
      },
      { status: 503 }
    );
  }

  const { error } = await supabase
    .from("diagnostics")
    .update({
      opco_ep_amount_consumed_current_year:
        parsed.data.opcoEpAmountConsumedCurrentYear,
    })
    .eq("id", diagnosticId);

  if (error) {
    return NextResponse.json(
      { ok: false, code: "update_failed", error: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
