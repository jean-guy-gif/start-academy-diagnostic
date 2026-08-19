import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Garde-fou NON-NÉGOCIABLE (audit interne — classe de bug la plus
 * insidieuse du projet : donnée correctement écrite en base mais
 * jamais relue à cause d'un cache stale).
 *
 * La route `/api/diagnostics/[id]/proposal` DOIT :
 *   • déclarer `export const dynamic = 'force-dynamic'` (empêche le
 *     rendu statique / cache Vercel edge de la réponse GET) ;
 *   • le fetch client GET DOIT poser `cache: 'no-store'` (empêche le
 *     browser HTTP cache de resservir l'ancienne réponse).
 *
 * Toute PR qui retire l'un des deux fait échouer ce test à la CI.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROUTE = resolve(__dirname, "route.ts");
const SERVICE = resolve(
  __dirname,
  "../../../../../lib/proposals/proposal-service.ts"
);
const SAVE_SERVICE = resolve(
  __dirname,
  "../../../../../lib/proposals/save-proposal.ts"
);

const ROUTE_SOURCE = readFileSync(ROUTE, "utf-8");
const SERVICE_SOURCE = readFileSync(SERVICE, "utf-8");
const SAVE_SOURCE = readFileSync(SAVE_SERVICE, "utf-8");

describe("route /api/diagnostics/[id]/proposal — anti cache stale (non négociable)", () => {
  it("route.ts : export const dynamic = 'force-dynamic'", () => {
    const pattern =
      /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/;
    expect(
      pattern.test(ROUTE_SOURCE),
      "route.ts doit exporter `dynamic = 'force-dynamic'` — sans ça, une réponse GET peut être resservie depuis le cache après un PUT."
    ).toBe(true);
  });

  it("proposal-service.ts (getProposalByDiagnosticId) : fetch GET avec cache: 'no-store'", () => {
    // On isole le corps de la fonction `getProposalByDiagnosticId`
    // (jusqu'à la fermeture de la function) et on vérifie qu'elle
    // contient `method: "GET"` ET `cache: "no-store"`.
    const start = SERVICE_SOURCE.indexOf(
      "export async function getProposalByDiagnosticId"
    );
    expect(start).toBeGreaterThan(-1);
    // Corps de fonction jusqu'au prochain "export " top-level.
    const nextExport = SERVICE_SOURCE.indexOf("\nexport ", start + 1);
    const body =
      nextExport === -1
        ? SERVICE_SOURCE.slice(start)
        : SERVICE_SOURCE.slice(start, nextExport);
    expect(
      /method:\s*["']GET["']/.test(body),
      "getProposalByDiagnosticId doit faire un fetch GET."
    ).toBe(true);
    expect(
      /cache:\s*["']no-store["']/.test(body),
      "getProposalByDiagnosticId doit passer `cache: 'no-store'` sur son fetch GET."
    ).toBe(true);
  });

  it("save-proposal.ts (saveProposal PUT) : fetch avec cache: 'no-store'", () => {
    const pattern = /cache:\s*["']no-store["']/;
    expect(
      pattern.test(SAVE_SOURCE),
      "saveProposal doit passer `cache: 'no-store'` sur son fetch PUT (cohérence anti-cache)."
    ).toBe(true);
  });
});
