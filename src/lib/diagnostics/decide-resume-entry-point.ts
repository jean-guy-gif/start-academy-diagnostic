import type { DiagnosticChapter, DiagnosticQuestion } from "@/types";

/**
 * Décision de reprise — fonction pure, testable sans DOM.
 *
 * Prend l'ordre du questionnaire (post-consolidation 69 questions) et
 * la liste des réponses persistées, renvoie le point d'entrée : index
 * de la première question sans réponse valide, comptes global et par
 * chapitre.
 *
 * Une réponse « compte » comme donnée quand elle est présente ET non
 * vide ET non skippée — miroir de l'agrégation `buildCompleteness` du
 * moteur audit (`build-audit-content.ts`).
 *
 * Cas particuliers :
 *   • Aucune réponse : `nextQuestionIndex = 0`, tous chapitres vides.
 *   • Toutes les questions répondues : `nextQuestionIndex = null`
 *     (l'appelant redirige alors vers la page audit / recommandation).
 *   • « Trous » au milieu : le premier trou l'emporte (on ne saute
 *     PAS les trous — la reprise revient sur la première non-répondue
 *     dans l'ordre d'origine, pas la dernière tentée).
 */

export interface ResumeAnswerRecord {
  questionId: string;
  answer: string | null;
  isSkipped: boolean;
}

export interface ResumeChapterProgress {
  chapter: DiagnosticChapter;
  answered: number;
  total: number;
}

export interface ResumeEntryPointDecision {
  /**
   * Index (0-based) de la première question sans réponse valide dans
   * l'ordre du questionnaire. `null` = toutes les questions répondues.
   */
  nextQuestionIndex: number | null;
  savedCount: number;
  totalCount: number;
  /** Progression par chapitre, ordre croissant. */
  perChapter: ResumeChapterProgress[];
}

function isAnswered(a: ResumeAnswerRecord | undefined): boolean {
  if (!a) return false;
  if (a.isSkipped) return false;
  return (a.answer ?? "").trim().length > 0;
}

export function decideResumeEntryPoint(
  questions: readonly DiagnosticQuestion[],
  answers: readonly ResumeAnswerRecord[]
): ResumeEntryPointDecision {
  const byId = new Map<string, ResumeAnswerRecord>();
  for (const a of answers) byId.set(a.questionId, a);

  let nextQuestionIndex: number | null = null;
  let savedCount = 0;
  const chapterCounts = new Map<
    DiagnosticChapter,
    { answered: number; total: number }
  >();

  questions.forEach((q, idx) => {
    const bucket = chapterCounts.get(q.chapter) ?? { answered: 0, total: 0 };
    bucket.total += 1;
    if (isAnswered(byId.get(q.id))) {
      bucket.answered += 1;
      savedCount += 1;
    } else if (nextQuestionIndex === null) {
      nextQuestionIndex = idx;
    }
    chapterCounts.set(q.chapter, bucket);
  });

  const perChapter: ResumeChapterProgress[] = [];
  const orderedChapters = [...chapterCounts.keys()].sort((a, b) => a - b);
  for (const c of orderedChapters) {
    const b = chapterCounts.get(c)!;
    perChapter.push({ chapter: c, answered: b.answered, total: b.total });
  }

  return {
    nextQuestionIndex,
    savedCount,
    totalCount: questions.length,
    perChapter,
  };
}
