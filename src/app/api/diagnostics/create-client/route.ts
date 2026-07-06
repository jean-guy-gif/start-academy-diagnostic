import { NextResponse } from "next/server";
import { z } from "zod";

import { requireApiRole } from "@/lib/auth/require-api-role";
import { INTERNAL_APP_ROLES } from "@/lib/auth/roles";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const ProfileTargetSchema = z.enum([
  "conseiller",
  "manager",
  "assistant",
  "direction",
]);

const BodySchema = z.object({
  companyName: z.string().min(1).max(200),
  director: z.string().max(200).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(60).nullable().optional(),
  collaboratorsCount: z.number().int().nonnegative().nullable().optional(),
  teamTypology: z.array(ProfileTargetSchema).max(20).default([]),
});

/**
 * POST /api/diagnostics/create-client
 *
 * Crée une fiche client. Réservé aux rôles internes Start Academy.
 * `created_by` est explicitement posé sur le profil appelant — utile
 * pour les futures policies Phase 2B (`created_by = auth.uid()`).
 */
export async function POST(request: Request) {
  const auth = await requireApiRole(INTERNAL_APP_ROLES);
  if (!auth.ok) return auth.response;

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
        error:
          "Persistance Supabase indisponible (mode local sans service_role).",
      },
      { status: 503 }
    );
  }

  const { data, error } = await supabase
    .from("clients")
    .insert({
      company_name: parsed.data.companyName,
      director: parsed.data.director ?? null,
      email: parsed.data.email ?? null,
      phone: parsed.data.phone ?? null,
      collaborators_count: parsed.data.collaboratorsCount ?? null,
      team_typology: parsed.data.teamTypology,
      created_by: auth.profile.id,
    })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json(
      {
        ok: false,
        code: "insert_failed",
        error: error?.message ?? "Insert refusé.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    client: {
      id: data.id,
      companyName: data.company_name,
      director: data.director,
      email: data.email,
      phone: data.phone,
      collaboratorsCount: data.collaborators_count,
      teamTypology: data.team_typology,
      createdAt: data.created_at,
    },
  });
}
