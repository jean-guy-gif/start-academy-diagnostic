import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Lot B2 édition proposition — garde-fou structural PR-1 (C1 audit
 * externe : « composant testé mais jamais branché »).
 *
 * Ce fichier est écrit DÈS PR-1 pour verrouiller le contrat de
 * branchement à venir en PR-2 :
 *
 *   • Les fonctions pures livrées en PR-1 (`applyCommercialDiscount`,
 *     `edit-program`) DOIVENT être utilisées par `proposal-view.tsx`
 *     via un composant `ProposalEditor` — sinon le test échoue.
 *
 *   • Le test réel est ÉCRIT ci-dessous mais SKIPPÉ tant que PR-2
 *     n'a pas livré le composant (l'import n'existe pas encore). La
 *     ligne à décommenter est marquée « TODO PR-2 ».
 *
 * Le garde-fou existe donc AVANT l'UI, pas après — c'est le principe
 * C1 : un composant qui n'a pas de contrat structurel de branchement
 * peut dériver silencieusement (cf. fiabilité #45 correctif 1, badge
 * agefice ré-implémenté inline pendant des semaines).
 *
 * ⚠️ RÈGLE PR-2 : décommenter les `it()` correspondants (voir
 * commentaires « décommenter en PR-2 »), NE JAMAIS supprimer ce
 * fichier ni ces assertions.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROPOSAL_VIEW = resolve(__dirname, "proposal-view.tsx");
const SOURCE = readFileSync(PROPOSAL_VIEW, "utf-8");

describe("proposal-view — branchement futur ProposalEditor (garde-fou PR-1)", () => {
  it("PR-1 : les moteurs purs sont livrés dans src/lib/pricing et src/lib/proposals", async () => {
    // Vérifie que les modules existent — si un contributeur les
    // renomme ou les supprime, on le remarque avant PR-2. Import
    // dynamique (l'alias @ n'est pas résolu par require CJS sous Vitest).
    await expect(
      import("@/lib/pricing/apply-commercial-discount")
    ).resolves.toHaveProperty("applyCommercialDiscount");
    await expect(import("@/lib/proposals/edit-program")).resolves.toHaveProperty(
      "addModuleToProgram"
    );
  });

  // ────────────────────────────────────────────────────────────
  // TODO PR-2 : décommenter les assertions ci-dessous une fois que
  // ProposalEditor est livré et branché dans proposal-view.tsx.
  // Ces skips sont VOLONTAIRES — ils matérialisent le contrat à
  // honorer en PR-2 sans casser la CI PR-1.
  // ────────────────────────────────────────────────────────────

  it.skip("PR-2 : proposal-view importe ProposalEditor depuis @/app/(app)/diagnostics/[id]/proposal/proposal-editor", () => {
    // décommenter en PR-2 :
    const importPattern =
      /import\s*\{[^}]*\bProposalEditor\b[^}]*\}\s*from\s*["']\.\/proposal-editor["']/;
    expect(importPattern.test(SOURCE)).toBe(true);
  });

  it.skip("PR-2 : proposal-view utilise ProposalEditor dans le JSX (composant réellement branché, pas juste importé)", () => {
    // décommenter en PR-2 :
    const usagePattern = /<ProposalEditor[\s>]/;
    expect(usagePattern.test(SOURCE)).toBe(true);
  });

  it.skip("PR-2 : proposal-view expose un handler onSave qui appelle applyCommercialDiscount / edit-program (branchement effectif)", () => {
    // décommenter en PR-2 : proposal-editor DOIT importer les 2
    // moteurs — pas juste ré-implémenter la logique inline.
    const editorPath = resolve(__dirname, "proposal-editor.tsx");
    const editorSource = readFileSync(editorPath, "utf-8");
    const importDiscount =
      /import\s*\{[^}]*\bapplyCommercialDiscount\b[^}]*\}\s*from\s*["']@\/lib\/pricing\/apply-commercial-discount["']/;
    const importEdit =
      /import\s*\{[^}]*\b(addModuleToProgram|removeModuleFromProgram|reorderModuleInProgram|updateModuleDurationInProgram)\b[^}]*\}\s*from\s*["']@\/lib\/proposals\/edit-program["']/;
    expect(importDiscount.test(editorSource)).toBe(true);
    expect(importEdit.test(editorSource)).toBe(true);
  });
});
