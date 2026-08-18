import { describe, expect, it } from "vitest";

import type { DiagnosticQuestion } from "@/types";

import {
  decideResumeEntryPoint,
  type ResumeAnswerRecord,
} from "./decide-resume-entry-point";

function q(
  id: string,
  chapter: 3 | 4 | 5,
  extras: Partial<DiagnosticQuestion> = {}
): DiagnosticQuestion {
  return {
    id,
    chapter,
    category: "prospecting",
    profile: "all",
    question: `Q ${id}`,
    type: "yesno",
    required: false,
    ...extras,
  };
}

function a(
  questionId: string,
  answer: string | null,
  isSkipped = false
): ResumeAnswerRecord {
  return { questionId, answer, isSkipped };
}

describe("decideResumeEntryPoint — décision du point de reprise", () => {
  const QUESTIONS = [q("q1", 3), q("q2", 3), q("q3", 4), q("q4", 5)];

  it("aucune réponse → nextQuestionIndex=0, savedCount=0, tous chapitres à 0", () => {
    const d = decideResumeEntryPoint(QUESTIONS, []);
    expect(d.nextQuestionIndex).toBe(0);
    expect(d.savedCount).toBe(0);
    expect(d.totalCount).toBe(4);
    expect(d.perChapter).toEqual([
      { chapter: 3, answered: 0, total: 2 },
      { chapter: 4, answered: 0, total: 1 },
      { chapter: 5, answered: 0, total: 1 },
    ]);
  });

  it("réponses séquentielles → nextQuestionIndex pointe sur la première non-répondue", () => {
    const d = decideResumeEntryPoint(QUESTIONS, [a("q1", "oui")]);
    expect(d.nextQuestionIndex).toBe(1);
    expect(d.savedCount).toBe(1);
  });

  it("« trou » au milieu → premier trou l'emporte, pas la dernière tentée", () => {
    const d = decideResumeEntryPoint(QUESTIONS, [
      a("q1", "oui"),
      // q2 = trou
      a("q3", "non"),
      a("q4", "oui"),
    ]);
    // Le point d'entrée doit revenir sur q2 (index 1), pas q4.
    expect(d.nextQuestionIndex).toBe(1);
    expect(d.savedCount).toBe(3);
  });

  it("réponse skippée → considérée comme non-répondue (trou)", () => {
    const d = decideResumeEntryPoint(QUESTIONS, [
      a("q1", "oui"),
      a("q2", null, true), // skippée
      a("q3", "oui"),
    ]);
    expect(d.nextQuestionIndex).toBe(1);
    expect(d.savedCount).toBe(2);
  });

  it("réponse vide / blanche → non-répondue", () => {
    const d = decideResumeEntryPoint(QUESTIONS, [
      a("q1", "oui"),
      a("q2", "   "),
      a("q3", "oui"),
    ]);
    expect(d.nextQuestionIndex).toBe(1);
    expect(d.savedCount).toBe(2);
  });

  it("toutes les questions répondues → nextQuestionIndex=null, chapitres complets", () => {
    const d = decideResumeEntryPoint(QUESTIONS, [
      a("q1", "oui"),
      a("q2", "non"),
      a("q3", "oui"),
      a("q4", "non"),
    ]);
    expect(d.nextQuestionIndex).toBeNull();
    expect(d.savedCount).toBe(4);
    expect(d.perChapter).toEqual([
      { chapter: 3, answered: 2, total: 2 },
      { chapter: 4, answered: 1, total: 1 },
      { chapter: 5, answered: 1, total: 1 },
    ]);
  });

  it("réponse pour une questionId inconnue → ignorée (pas dans le questionnaire)", () => {
    const d = decideResumeEntryPoint(QUESTIONS, [
      a("orphan-id", "oui"),
    ]);
    expect(d.nextQuestionIndex).toBe(0);
    expect(d.savedCount).toBe(0);
  });
});
