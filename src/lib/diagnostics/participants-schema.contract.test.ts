import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Test de contrat SQL ↔ Zod / service (pattern F-1) — chantier C1.
 *
 * Verrouille l'alignement STRICT entre :
 *   • la migration `20260719120000_participant_current_year_hours_and_
 *     status_rules.sql` (source de vérité DB),
 *   • le service `src/lib/diagnostics/diagnostic-participants-service.ts`
 *     qui SELECT / INSERT ces colonnes,
 *   • le schema Zod de la route `src/app/api/diagnostics/[id]/
 *     participants/route.ts` qui les valide côté API.
 *
 * Toute divergence entre ces bords ferait dériver le modèle participant
 * unifié C1 selon la disponibilité Supabase — inacceptable côté produit.
 * Test échoue au build si l'un des bords change sans les autres
 * (leçon T-3 / T-4 / F-1).
 */

const MIGRATION_PATH = join(
  process.cwd(),
  "supabase/migrations/20260719120000_participant_current_year_hours_and_status_rules.sql"
);
const SERVICE_PATH = join(
  process.cwd(),
  "src/lib/diagnostics/diagnostic-participants-service.ts"
);
const ROUTE_PATH = join(
  process.cwd(),
  "src/app/api/diagnostics/[id]/participants/route.ts"
);

function readMigration(): string {
  return readFileSync(MIGRATION_PATH, "utf8");
}
function readService(): string {
  return readFileSync(SERVICE_PATH, "utf8");
}
function readRoute(): string {
  return readFileSync(ROUTE_PATH, "utf8");
}

describe("Contract SQL ↔ Zod / service — colonnes chantier C1", () => {
  it("migration ajoute bien `formations_current_year_hours` et `opco_ep_amount_consumed_current_year`", () => {
    const sql = readMigration();
    expect(sql).toMatch(
      /add column if not exists\s+formations_current_year_hours/i
    );
    expect(sql).toMatch(
      /add column if not exists\s+opco_ep_amount_consumed_current_year/i
    );
  });

  it("service SELECT + Row incluent les 2 nouvelles colonnes", () => {
    const service = readService();
    expect(service).toMatch(/formations_current_year_hours/);
    expect(service).toMatch(/opco_ep_amount_consumed_current_year/);
  });

  it("service N'INCLUT PLUS les 3 colonnes `formations_24m_*` dans les SELECT / INSERT (arrêt d'écriture)", () => {
    const service = readService();
    // Les identifiants `formations_24m_*` peuvent encore apparaître
    // dans des commentaires (dead data documentation). On vérifie
    // qu'ils ne sont plus référencés dans du code exécutable en
    // filtrant les lignes de commentaire.
    const codeLines = service
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(codeLines).not.toMatch(/formations_24m_count/);
    expect(codeLines).not.toMatch(/formations_24m_hours/);
    expect(codeLines).not.toMatch(/formations_24m_amount/);
  });

  it("route Zod accepte `formationsCurrentYearHours` et `opcoEpAmountConsumedCurrentYear`", () => {
    const route = readRoute();
    expect(route).toMatch(/formationsCurrentYearHours\s*:/);
    expect(route).toMatch(/opcoEpAmountConsumedCurrentYear\s*:/);
  });

  it("route Zod N'ACCEPTE PLUS les 3 champs `formations24m*` (arrêt d'écriture)", () => {
    const route = readRoute();
    const codeLines = route
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(codeLines).not.toMatch(/formations24mCount\s*:/);
    expect(codeLines).not.toMatch(/formations24mHours\s*:/);
    expect(codeLines).not.toMatch(/formations24mAmount\s*:/);
  });
});

describe("Contract SQL ↔ Zod — CHECK constraint N-1 salarié", () => {
  it("migration crée la contrainte `diagnostic_participants_no_n1_for_salarie`", () => {
    const sql = readMigration();
    expect(sql).toMatch(
      /add constraint\s+diagnostic_participants_no_n1_for_salarie/i
    );
    // La contrainte doit refléter le refinement Zod : salarié ⇒ N-1
    // est null.
    expect(sql).toMatch(/professional_status\s*<>\s*'salarie'/);
    expect(sql).toMatch(/previous_year_production\s+is\s+null/);
  });

  it("route Zod expose bien le refinement (message contient « salarié »)", () => {
    const route = readRoute();
    expect(route).toMatch(/refine\s*\(/);
    expect(route).toMatch(/salarié/);
    expect(route).toMatch(/previousYearProduction/);
  });
});
