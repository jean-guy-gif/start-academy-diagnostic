import { describe, expect, it } from "vitest";

import { decideModuleAvailability } from "./decide-module-availability";

describe("decideModuleAvailability — 3 états sélecteur catalogue", () => {
  it("module déjà présent dans le programme → 'present', non sélectionnable (anti-doublon)", () => {
    const d = decideModuleAvailability({
      moduleId: "mod-a",
      presentIds: ["mod-a", "mod-b"],
      initialIds: ["mod-a"],
    });
    expect(d.kind).toBe("present");
    expect(d.selectable).toBe(false);
  });

  it("module retiré pendant cette session → 'removed', sélectionnable (réintégration possible)", () => {
    const d = decideModuleAvailability({
      moduleId: "mod-a",
      presentIds: ["mod-b"], // retiré
      initialIds: ["mod-a", "mod-b"], // était initialement présent
    });
    expect(d.kind).toBe("removed");
    expect(d.selectable).toBe(true);
  });

  it("module jamais présent → 'available'", () => {
    const d = decideModuleAvailability({
      moduleId: "mod-c",
      presentIds: ["mod-a", "mod-b"],
      initialIds: ["mod-a", "mod-b"],
    });
    expect(d.kind).toBe("available");
    expect(d.selectable).toBe(true);
  });

  it("module ajouté puis retiré cette session (pas dans initial) → 'available', PAS 'removed'", () => {
    // L'user avait ajouté mod-d, puis l'a retiré. mod-d n'a jamais
    // été dans initial → il est simplement « disponible » (état
    // neutre, pas rouge/barré).
    const d = decideModuleAvailability({
      moduleId: "mod-d",
      presentIds: ["mod-a"],
      initialIds: ["mod-a"],
    });
    expect(d.kind).toBe("available");
  });

  it("initialIds vide (programme partait de zéro) → tout module non-présent est 'available'", () => {
    const d = decideModuleAvailability({
      moduleId: "mod-c",
      presentIds: ["mod-a"],
      initialIds: [],
    });
    expect(d.kind).toBe("available");
  });

  it("réintégration : module retiré puis rajouté → redevient 'present'", () => {
    // Cas d'ajout depuis 'removed' : l'user reclique dans le picker.
    // Après ajout, presentIds contient de nouveau le module → 'present'.
    const removed = decideModuleAvailability({
      moduleId: "mod-a",
      presentIds: ["mod-b"],
      initialIds: ["mod-a", "mod-b"],
    });
    expect(removed.kind).toBe("removed");

    const reAdded = decideModuleAvailability({
      moduleId: "mod-a",
      presentIds: ["mod-a", "mod-b"],
      initialIds: ["mod-a", "mod-b"],
    });
    expect(reAdded.kind).toBe("present");
    expect(reAdded.selectable).toBe(false);
  });
});
