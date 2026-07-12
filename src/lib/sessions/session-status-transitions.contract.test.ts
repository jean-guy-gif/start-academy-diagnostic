import { describe, expect, it } from "vitest";

import type { SessionStatus } from "@/types";
import {
  ALLOWED_TRANSITIONS,
  IRREVERSIBLE_STATUSES,
  getBackwardOptions,
  getNextForwardStatus,
  isIrreversibleTarget,
  isTransitionAllowed,
} from "./session-status-transitions";

/**
 * Test de contrat T-8 — machine à états `training_sessions.status`.
 *
 * Verrouille la matrice validée manuellement le 2026-07-12 (PRD §11.2
 * T-8 + tableau de transitions). Objectif : toute modification silencieuse
 * (ajout, suppression, réordonnancement) fait échouer ce test au build.
 *
 * Structure :
 *   1. Rail principal — 10 transitions AVANT exactes.
 *   2. Retours arrière — 7 transitions autorisées, listées explicitement.
 *   3. Transitions interdites notables (échantillons non exhaustifs mais
 *      cruciaux : sauts d'étapes, retours en cascade, sortie de terminal).
 *   4. Cardinalité totale : 10 AVANT + 7 RETOUR = 17. Toute transition
 *      hors matrice DOIT être refusée.
 *   5. `IRREVERSIBLE_STATUSES` = { delivered, report_sent }.
 *   6. Helpers `getNextForwardStatus` / `getBackwardOptions` cohérents
 *      avec la matrice.
 */

// ---------------------------------------------------------------------------
// 1. Rail principal — transitions AVANT
// ---------------------------------------------------------------------------

const FORWARD_TRANSITIONS: ReadonlyArray<[SessionStatus, SessionStatus]> = [
  ["created", "awaiting_client_validation"],
  ["awaiting_client_validation", "dates_to_position"],
  ["dates_to_position", "dates_validated"],
  ["dates_validated", "collection_open"],
  ["collection_open", "data_collected"],
  ["data_collected", "support_generating"],
  ["support_generating", "support_ready"],
  ["support_ready", "delivered"],
  ["delivered", "report_sent"],
] as const;

// ---------------------------------------------------------------------------
// 2. Retours arrière autorisés (7 total)
// ---------------------------------------------------------------------------

const BACKWARD_TRANSITIONS: ReadonlyArray<[SessionStatus, SessionStatus]> = [
  ["awaiting_client_validation", "created"],
  ["dates_to_position", "awaiting_client_validation"],
  ["dates_validated", "dates_to_position"],
  ["collection_open", "dates_validated"],
  ["data_collected", "collection_open"],
  ["support_generating", "data_collected"],
  ["support_ready", "support_generating"],
] as const;

// ---------------------------------------------------------------------------
// 3. Transitions interdites notables — échantillon (pas exhaustif)
// ---------------------------------------------------------------------------

const FORBIDDEN_TRANSITIONS: ReadonlyArray<[SessionStatus, SessionStatus]> = [
  // Sauts d'étapes depuis created
  ["created", "delivered"],
  ["created", "report_sent"],
  ["created", "collection_open"],
  // Retour arrière depuis état irréversible
  ["delivered", "support_ready"],
  ["delivered", "collection_open"],
  ["delivered", "created"],
  // Sortie d'état terminal report_sent
  ["report_sent", "delivered"],
  ["report_sent", "support_ready"],
  ["report_sent", "created"],
  // Retour arrière plus loin qu'une étape
  ["data_collected", "dates_validated"],
  ["support_ready", "data_collected"],
  ["support_generating", "collection_open"],
  // Auto-transition
  ["created", "created"],
  ["delivered", "delivered"],
] as const;

describe("session-status-transitions — matrice T-8", () => {
  it("chaque transition AVANT du rail principal est autorisée", () => {
    for (const [from, to] of FORWARD_TRANSITIONS) {
      expect(
        isTransitionAllowed(from, to),
        `Transition AVANT ${from} → ${to} doit être autorisée`
      ).toBe(true);
    }
  });

  it("chaque retour arrière autorisé est bien accepté", () => {
    for (const [from, to] of BACKWARD_TRANSITIONS) {
      expect(
        isTransitionAllowed(from, to),
        `Retour arrière ${from} → ${to} doit être autorisé`
      ).toBe(true);
    }
  });

  it("chaque transition interdite est refusée", () => {
    for (const [from, to] of FORBIDDEN_TRANSITIONS) {
      expect(
        isTransitionAllowed(from, to),
        `Transition INTERDITE ${from} → ${to} doit être refusée`
      ).toBe(false);
    }
  });

  it("cardinalité totale = 16 (9 AVANT + 7 RETOUR), toute transition hors matrice refusée", () => {
    const allowed = new Set<string>();
    for (const [from, targets] of Object.entries(ALLOWED_TRANSITIONS)) {
      for (const to of targets) {
        allowed.add(`${from}→${to}`);
      }
    }
    // 9 AVANT (rail principal, report_sent est terminal) + 7 RETOUR = 16
    // arêtes exactement.
    expect(allowed.size).toBe(16);

    // Boucle exhaustive 10×10 : tout ce qui n'est pas dans `allowed`
    // est refusé.
    const STATUSES: SessionStatus[] = [
      "created",
      "awaiting_client_validation",
      "dates_to_position",
      "dates_validated",
      "collection_open",
      "data_collected",
      "support_generating",
      "support_ready",
      "delivered",
      "report_sent",
    ];
    let forbiddenCount = 0;
    for (const from of STATUSES) {
      for (const to of STATUSES) {
        const key = `${from}→${to}`;
        if (allowed.has(key)) continue;
        expect(
          isTransitionAllowed(from, to),
          `${from} → ${to} n'est pas dans la matrice, doit être refusée`
        ).toBe(false);
        forbiddenCount++;
      }
    }
    // 100 combinaisons - 16 autorisées = 84 interdites.
    expect(forbiddenCount).toBe(84);
  });

  it("IRREVERSIBLE_STATUSES = { delivered, report_sent } et isIrreversibleTarget cohérent", () => {
    expect([...IRREVERSIBLE_STATUSES].sort()).toEqual(
      ["delivered", "report_sent"].sort()
    );
    expect(isIrreversibleTarget("delivered")).toBe(true);
    expect(isIrreversibleTarget("report_sent")).toBe(true);
    expect(isIrreversibleTarget("created")).toBe(false);
    expect(isIrreversibleTarget("support_ready")).toBe(false);
  });

  it("getNextForwardStatus renvoie le premier élément (rail principal)", () => {
    for (const [from, to] of FORWARD_TRANSITIONS) {
      expect(
        getNextForwardStatus(from),
        `getNextForwardStatus(${from}) doit renvoyer ${to}`
      ).toBe(to);
    }
    // report_sent = terminal → null
    expect(getNextForwardStatus("report_sent")).toBeNull();
  });

  it("getBackwardOptions renvoie les transitions RETOUR (jamais AVANT)", () => {
    // report_sent : rien
    expect(getBackwardOptions("report_sent")).toEqual([]);
    // created : rien (pas de retour possible depuis l'état initial)
    expect(getBackwardOptions("created")).toEqual([]);
    // delivered : rien (irréversible)
    expect(getBackwardOptions("delivered")).toEqual([]);
    // dates_validated : retour à dates_to_position
    expect(getBackwardOptions("dates_validated")).toEqual([
      "dates_to_position",
    ]);
    // awaiting_client_validation : retour à created
    expect(getBackwardOptions("awaiting_client_validation")).toEqual([
      "created",
    ]);
    // Aucun getBackwardOptions ne doit contenir la transition AVANT
    for (const [from, forwardTo] of FORWARD_TRANSITIONS) {
      const back = getBackwardOptions(from);
      expect(
        back.includes(forwardTo),
        `${from}: getBackwardOptions ne doit PAS inclure la transition AVANT ${forwardTo}`
      ).toBe(false);
    }
  });
});
