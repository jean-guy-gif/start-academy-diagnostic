import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Correctif 1 (lot fiabilité — audit externe).
 *
 * Garde-fou structural : le rendu du badge AGEFICE présentiel dans la
 * page proposition DOIT passer par le composant partagé
 * `AgeficePresentielCoverageBadge(View)`. Toute ré-implémentation
 * inline (span data-testid, texte « Prise en charge 100 % » …) réactive
 * la duplication historique qui avait déjà divergé de la règle
 * d'agrégation stricte.
 *
 * Ce test s'exécute sur le source TSX brut — pas de rendu React,
 * aucune dépendance à Next.js. Il échoue si :
 *   • l'import du composant partagé disparaît,
 *   • ou si un span data-testid="agefice-*" réapparaît en JSX inline
 *     dans le fichier proposal-view (les seuls emplacements légitimes
 *     de ces data-testid sont désormais dans le composant partagé).
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROPOSAL_VIEW = resolve(__dirname, "proposal-view.tsx");
const SOURCE = readFileSync(PROPOSAL_VIEW, "utf-8");

describe("proposal-view — badge AGEFICE présentiel via composant partagé", () => {
  it("importe AgeficePresentielCoverageBadgeView depuis @/components/funding", () => {
    // Un import nommé qui contient explicitement `AgeficePresentielCoverageBadgeView`
    // en provenance du module partagé. Le regex tolère les 2 formes
    // usuelles (import { A, B, C } from ...).
    const importPattern =
      /import\s*\{[^}]*\bAgeficePresentielCoverageBadgeView\b[^}]*\}\s*from\s*["']@\/components\/funding\/agefice-presentiel-coverage-badge["']/;
    expect(
      importPattern.test(SOURCE),
      "proposal-view.tsx doit importer AgeficePresentielCoverageBadgeView depuis @/components/funding/agefice-presentiel-coverage-badge"
    ).toBe(true);
  });

  it("ne contient PLUS aucun span inline data-testid=\"agefice-*\"", () => {
    // Les 2 marqueurs de la ré-implémentation historique. Ils ne
    // doivent plus exister dans proposal-view.tsx — ils vivent
    // uniquement dans le composant partagé.
    const fullBadge = /data-testid=["']agefice-full-coverage-badge["']/;
    const alertBadge = /data-testid=["']agefice-rights-check-alert["']/;
    expect(fullBadge.test(SOURCE)).toBe(false);
    expect(alertBadge.test(SOURCE)).toBe(false);
  });

  it("utilise le composant importé au moins une fois dans le JSX", () => {
    // Confirme que l'import n'est pas mort (sinon un futur refactor
    // pourrait retirer l'usage sans casser l'assertion d'import).
    const usagePattern = /<AgeficePresentielCoverageBadgeView[\s>]/;
    expect(usagePattern.test(SOURCE)).toBe(true);
  });
});
