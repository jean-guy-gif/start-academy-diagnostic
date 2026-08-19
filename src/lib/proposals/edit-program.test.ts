import { describe, expect, it } from "vitest";

import type {
  ProposalModule,
  TrainingProgram,
} from "@/lib/ai/proposal-schema";

import {
  addModuleToProgram,
  removeModuleFromProgram,
  reorderModuleInProgram,
  updateModuleDurationInProgram,
  updateModuleTextInProgram,
} from "./edit-program";

function m(title: string, hours: number): ProposalModule {
  return {
    title,
    durationHours: hours,
    whyThisModule: `Pourquoi ${title}`,
    themes: [],
    businessUseCases: [],
    expectedOutcomes: [],
  };
}

function makeProgram(modules: ProposalModule[]): TrainingProgram {
  return {
    totalDurationHours: modules.reduce((s, x) => s + x.durationHours, 0),
    suggestedFormat: "Présentiel 1 jour",
    targetAudience: "Équipe commerciale",
    pedagogicalObjectives: [],
    modules,
  };
}

describe("addModuleToProgram — ajout en fin + recalcul total", () => {
  it("ajoute à la fin et recalcule totalDurationHours", () => {
    const before = makeProgram([m("A", 3), m("B", 4)]);
    const after = addModuleToProgram(before, m("C", 2));
    expect(after.modules.map((x) => x.title)).toEqual(["A", "B", "C"]);
    expect(after.totalDurationHours).toBe(9);
    // Immuabilité : la référence d'origine n'est pas mutée.
    expect(before.modules).toHaveLength(2);
    expect(before.totalDurationHours).toBe(7);
  });

  it("ajoute à un programme vide", () => {
    const after = addModuleToProgram(makeProgram([]), m("A", 5));
    expect(after.modules).toHaveLength(1);
    expect(after.totalDurationHours).toBe(5);
  });
});

describe("removeModuleFromProgram — retrait + recalcul total", () => {
  it("retire le module et recalcule le total", () => {
    const before = makeProgram([m("A", 3), m("B", 4), m("C", 2)]);
    const after = removeModuleFromProgram(before, 1);
    expect(after.modules.map((x) => x.title)).toEqual(["A", "C"]);
    expect(after.totalDurationHours).toBe(5);
  });

  it("index hors bornes → no-op (programme identique)", () => {
    const before = makeProgram([m("A", 3)]);
    expect(removeModuleFromProgram(before, 5)).toBe(before);
    expect(removeModuleFromProgram(before, -1)).toBe(before);
  });
});

describe("reorderModuleInProgram — réordre + total inchangé", () => {
  it("déplace du début vers la fin", () => {
    const before = makeProgram([m("A", 3), m("B", 4), m("C", 2)]);
    const after = reorderModuleInProgram(before, 0, 2);
    expect(after.modules.map((x) => x.title)).toEqual(["B", "C", "A"]);
    expect(after.totalDurationHours).toBe(9); // inchangé
  });

  it("déplace du milieu vers le début (boutons haut/bas)", () => {
    const before = makeProgram([m("A", 3), m("B", 4), m("C", 2)]);
    const after = reorderModuleInProgram(before, 1, 0);
    expect(after.modules.map((x) => x.title)).toEqual(["B", "A", "C"]);
  });

  it.each([
    ["index égal", 1, 1],
    ["from hors bornes", -1, 0],
    ["to hors bornes", 0, 99],
  ])("no-op : %s", (_desc, from, to) => {
    const before = makeProgram([m("A", 3), m("B", 4)]);
    expect(reorderModuleInProgram(before, from, to)).toBe(before);
  });
});

describe("updateModuleDurationInProgram — édition durée + recalcul", () => {
  it("met à jour la durée et recalcule le total", () => {
    const before = makeProgram([m("A", 3), m("B", 4)]);
    const after = updateModuleDurationInProgram(before, 1, 7);
    expect(after.modules[1].durationHours).toBe(7);
    expect(after.totalDurationHours).toBe(10);
  });

  it("valeur négative → clampée à 0", () => {
    const before = makeProgram([m("A", 3)]);
    const after = updateModuleDurationInProgram(before, 0, -5);
    expect(after.modules[0].durationHours).toBe(0);
    expect(after.totalDurationHours).toBe(0);
  });

  it("NaN → clampé à 0 (garde-fou input)", () => {
    const before = makeProgram([m("A", 3)]);
    const after = updateModuleDurationInProgram(before, 0, Number.NaN);
    expect(after.modules[0].durationHours).toBe(0);
  });

  it("index hors bornes → no-op", () => {
    const before = makeProgram([m("A", 3)]);
    expect(updateModuleDurationInProgram(before, 5, 10)).toBe(before);
  });
});

describe("updateModuleTextInProgram — édition texte libre", () => {
  it("met à jour le titre", () => {
    const before = makeProgram([m("A", 3)]);
    const after = updateModuleTextInProgram(before, 0, "title", "Nouveau titre");
    expect(after.modules[0].title).toBe("Nouveau titre");
    expect(after.totalDurationHours).toBe(3); // inchangé
  });

  it("met à jour whyThisModule", () => {
    const before = makeProgram([m("A", 3)]);
    const after = updateModuleTextInProgram(before, 0, "whyThisModule", "Nouvelle raison");
    expect(after.modules[0].whyThisModule).toBe("Nouvelle raison");
  });

  it("chaîne vide autorisée à ce niveau (état transitoire, Zod validera au save)", () => {
    const before = makeProgram([m("A", 3)]);
    const after = updateModuleTextInProgram(before, 0, "title", "");
    expect(after.modules[0].title).toBe("");
  });

  it("index hors bornes → no-op", () => {
    const before = makeProgram([m("A", 3)]);
    expect(updateModuleTextInProgram(before, 5, "title", "X")).toBe(before);
  });
});
