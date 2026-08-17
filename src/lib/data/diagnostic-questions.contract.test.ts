import { describe, expect, it } from "vitest";

import { diagnosticQuestions } from "./diagnostic-questions";

/**
 * Contrat anti-dérive du chantier reformulation 2026-07-24.
 *
 * Verrouille l'INVARIANT technique : la liste des IDs et le typage
 * de chaque question ne DOIVENT PAS changer entre la version pré-
 * reformulation et la version reformulée. La reformulation touche
 * uniquement les champs `question` (libellé) et `hint` (aide de saisie
 * commercial).
 *
 * Toute modification de cette liste ferait sauter :
 *   • les réponses déjà persistées en `diagnostic_answers` par ID
 *   • les tests unitaires du moteur ratios / alertes
 *   • le prompt IA qui adresse chaque question par son ID
 *
 * Ajouter/supprimer/renommer une question demande de bumper cette
 * baseline consciemment (et de gérer la migration des données).
 */

// Baseline — 69 questions, 9 chapitres. Chaque entrée = [id, chapter, type].
// Note : passage 71 → 69 par retrait des doublons Ch.3/Ch.4 (les 2 outils
// pige & estimation ne vivent plus qu'en Ch.10 après consolidation).
const BASELINE: ReadonlyArray<readonly [string, number, string]> = [
  // Ch.3 — Prospection & entrées vendeurs (8)
  ["prospecting-methods", 3, "multichoice"],
  ["prospecting-who", 3, "choice"],
  ["perf-contacts-week", 3, "int"],
  ["prospecting-contacts-per-month", 3, "int"],
  ["prospecting-hours-per-week", 3, "int"],
  ["perf-rate-rdv", 3, "percent"],
  ["prospecting-script", 3, "yesno"],
  ["skill-prospection", 3, "yesno"],
  // Ch.4 — RDV vendeur (9)
  ["seller-meetings-per-month", 4, "int"],
  ["perf-rate-estimation", 4, "percent"],
  ["seller-meeting-format", 4, "choice"],
  ["seller-discovery-formalized", 4, "yesno"],
  ["estimation-delivery-delay", 4, "choice"],
  ["seller-written-valuation", 4, "yesno"],
  ["skill-qualification", 4, "yesno"],
  ["skill-estimation", 4, "yesno"],
  ["skill-objections", 4, "yesno"],
  // Ch.5 — Mandats & exclusivité (8)
  ["mandates-active-stock", 5, "int"],
  ["mandates-per-month", 5, "int"],
  ["perf-rate-mandat", 5, "percent"],
  ["perf-rate-exclusivity", 5, "percent"],
  ["mandates-exclusivity-percent", 5, "percent"],
  ["mandates-price-above-market", 5, "choice"],
  ["skill-price-defense", 5, "yesno"],
  ["mandates-average-duration-months", 5, "int"],
  // Ch.6 — Commercialisation & suivi vendeur (3)
  ["commercial-followup-frequency", 6, "choice"],
  ["commercial-price-drop-per-month-percent", 6, "percent"],
  ["commercial-requalification-process", 6, "yesno"],
  // Ch.7 — Acquéreurs (4)
  ["buyers-sources-repartition", 7, "text"],
  ["buyers-contacts-per-month", 7, "int"],
  ["buyers-discovery-formalized", 7, "yesno"],
  ["buyers-financing-verified", 7, "yesno"],
  // Ch.8 — Visites, offres & transformation (5)
  ["visits-per-month", 8, "int"],
  ["offers-per-month", 8, "int"],
  ["compromis-per-month", 8, "int"],
  ["actes-per-month", 8, "int"],
  ["chute-compromis-acte-percent", 8, "percent"],
  // Ch.9 — Base de données & e-réputation (7)
  ["db-volume", 9, "int"],
  ["db-crm-uptodate", 9, "choice"],
  ["perf-crm-usage", 9, "percent"],
  ["db-exploitation", 9, "multichoice"],
  ["google-reviews-count", 9, "int"],
  ["google-reviews-score", 9, "percent"],
  ["reviews-collection-process", 9, "yesno"],
  // Ch.10 — Outils & IA (16)
  ["tools-metier", 10, "text"],
  ["tools-estimation", 10, "text"],
  ["tools-pige", 10, "text"],
  ["tools-portals", 10, "multichoice"],
  ["tools-esignature", 10, "yesno"],
  ["tools-ai-usage", 10, "multichoice"],
  ["tool-chatgpt-usage", 10, "text"],
  ["tool-claude-gemini", 10, "yesno"],
  ["tool-team-access", 10, "yesno"],
  ["tool-chatgpt-setup", 10, "yesno"],
  ["tool-chatgpt-instructions", 10, "yesno"],
  ["tool-prompts-standard", 10, "yesno"],
  ["tool-anti-hallucination", 10, "yesno"],
  ["tool-notebooklm", 10, "yesno"],
  ["tool-notebook-created", 10, "yesno"],
  ["tool-gamma", 10, "yesno"],
  // Ch.11 — Management, pilotage & vision (9)
  ["mgmt-team-meeting-frequency", 11, "choice"],
  ["exec-manager-reporting", 11, "yesno"],
  ["mgmt-coaching-individual", 11, "yesno"],
  ["exec-week-structure", 11, "yesno"],
  ["exec-autonomy", 11, "yesno"],
  ["mgmt-indicators-followed", 11, "multichoice"],
  ["mgmt-recruitment", 11, "yesno"],
  ["mgmt-top3-difficulties", 11, "text"],
  ["mgmt-top3-priorities", 11, "text"],
];

describe("Contrat anti-dérive diagnosticQuestions (chantier reformulation)", () => {
  it("le nombre total de questions reste 69 (post-consolidation doublons pige/estimation)", () => {
    expect(diagnosticQuestions).toHaveLength(BASELINE.length);
    expect(diagnosticQuestions).toHaveLength(69);
  });

  it("l'ensemble des IDs est strictement égal à la baseline (aucun ajout, aucun retrait, aucun renommage)", () => {
    const actualIds = new Set(diagnosticQuestions.map((q) => q.id));
    const baselineIds = new Set(BASELINE.map(([id]) => id));
    expect([...actualIds].sort()).toEqual([...baselineIds].sort());
  });

  it("le type de chaque question correspond à la baseline (aucun changement de contrat de réponse)", () => {
    const actualByIdEntries = new Map(
      diagnosticQuestions.map((q) => [q.id, { chapter: q.chapter, type: q.type }])
    );
    for (const [id, chapter, type] of BASELINE) {
      const found = actualByIdEntries.get(id);
      expect(found, `Question ${id} absente`).toBeDefined();
      expect(found!.chapter, `Chapitre différent pour ${id}`).toBe(chapter);
      expect(found!.type, `Type différent pour ${id}`).toBe(type);
    }
  });
});
