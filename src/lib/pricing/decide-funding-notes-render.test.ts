import { describe, expect, it } from "vitest";

import { decideFundingNotesRender } from "./decide-funding-notes-render";

describe("decideFundingNotesRender — décision de rendu des notes de financement", () => {
  it("liste vide → shouldRender=false, notes=[] (pas de liste vide ni de puce orpheline dans le JSX)", () => {
    const d = decideFundingNotesRender([]);
    expect(d.shouldRender).toBe(false);
    expect(d.notes).toEqual([]);
  });

  it("null / undefined → shouldRender=false (rétro-compat legacy sans le champ)", () => {
    expect(decideFundingNotesRender(null).shouldRender).toBe(false);
    expect(decideFundingNotesRender(undefined).shouldRender).toBe(false);
  });

  it("liste uniquement composée d'entrées vides / espaces → shouldRender=false", () => {
    const d = decideFundingNotesRender(["", "   ", "\t\n"]);
    expect(d.shouldRender).toBe(false);
    expect(d.notes).toEqual([]);
  });

  it("une note non-vide → shouldRender=true, notes=[celle-ci trim]", () => {
    const d = decideFundingNotesRender(["  Salarié éligible OPCO EP — à confirmer avec l'OPCO. "]);
    expect(d.shouldRender).toBe(true);
    expect(d.notes).toEqual(["Salarié éligible OPCO EP — à confirmer avec l'OPCO."]);
  });

  it("mix vide + notes non-vides → seules les non-vides sortent, ordre préservé", () => {
    const d = decideFundingNotesRender(["", "A", "", "B", "   "]);
    expect(d.shouldRender).toBe(true);
    expect(d.notes).toEqual(["A", "B"]);
  });
});
