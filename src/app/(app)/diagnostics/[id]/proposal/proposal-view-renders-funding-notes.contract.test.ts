import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Micro-PR OPCO note visible — garde-fou structural.
 *
 * proposal-view.tsx DOIT rendre les notes par cas participant via la
 * fonction pure `decideFundingNotesRender` — pas de logique inline
 * `pricing.fundingNotes.map(...)` sans passage par la décision.
 *
 * Ce test s'exécute sur le source TSX brut (pas de rendu React).
 * Il échoue si :
 *   • l'import de `decideFundingNotesRender` disparaît ;
 *   • le composant ne l'appelle plus (usage mort) ;
 *   • le rendu du conteneur `<ul>` n'est plus gardé par
 *     `shouldRender` (garde-fou anti « liste vide / puce orpheline ») ;
 *   • un `pricing.fundingNotes.map(` inline apparaît sans passer par
 *     la décision.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROPOSAL_VIEW = resolve(__dirname, "proposal-view.tsx");
const SOURCE = readFileSync(PROPOSAL_VIEW, "utf-8");

describe("proposal-view — rendu notes financement via decideFundingNotesRender", () => {
  it("importe decideFundingNotesRender depuis @/lib/pricing/decide-funding-notes-render", () => {
    const importPattern =
      /import\s*\{[^}]*\bdecideFundingNotesRender\b[^}]*\}\s*from\s*["']@\/lib\/pricing\/decide-funding-notes-render["']/;
    expect(
      importPattern.test(SOURCE),
      "proposal-view.tsx doit importer decideFundingNotesRender"
    ).toBe(true);
  });

  it("appelle decideFundingNotesRender au moins une fois", () => {
    const usagePattern = /decideFundingNotesRender\s*\(/;
    expect(usagePattern.test(SOURCE)).toBe(true);
  });

  it("garde-fou : le rendu de la liste est conditionné par shouldRender (aucune liste vide / puce orpheline)", () => {
    // On cherche un pattern « <quelque chose>.shouldRender && ... <ul »
    // ou équivalent avec les notes en dessous — preuve que la décision
    // gate bien la présence du conteneur.
    const shouldRenderGuard =
      /shouldRender\s*&&[\s\S]{0,300}<ul[\s>]/;
    expect(
      shouldRenderGuard.test(SOURCE),
      "Le conteneur <ul> des funding notes doit être gardé par .shouldRender — pas de <ul> inconditionnel"
    ).toBe(true);
  });

  it("pas d'itération inline directe sur pricing.fundingNotes (le rendu passe par la décision)", () => {
    // Pattern refusé : `pricing.fundingNotes.map(` — l'itération doit
    // se faire sur la variable renvoyée par decideFundingNotesRender
    // (typiquement `.notes.map(`). Cela empêche un contributeur futur
    // de shortcuter la décision.
    const inlineIteration = /pricing\.fundingNotes\.map\s*\(/;
    expect(inlineIteration.test(SOURCE)).toBe(false);
  });
});
