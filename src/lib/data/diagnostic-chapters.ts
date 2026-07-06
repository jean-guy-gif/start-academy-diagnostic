import type { DiagnosticChapter } from "@/types";

/**
 * Référentiel v1.0 — métadonnées d'affichage par chapitre.
 *
 * Source : `docs/Diagnostic question referential.md`.
 *
 * Ces métadonnées vivent en dur côté code (option A validée dans
 * le plan) — pas de table `diagnostic_chapters` en base. La règle
 * : toute modification ici doit être répercutée dans le document
 * référentiel, et inversement.
 */

export interface ChapterMeta {
  chapter: DiagnosticChapter;
  title: string;
  objective: string;
  approxMinutes: number | null;
  /**
   * Synthèse intermédiaire à afficher APRÈS ce chapitre. Deux cas
   * dans le référentiel v1.0 : après Ch. 2 (« potentiel de
   * financement ») et après Ch. 8 (« pipeline de transformation »).
   */
  followedBySynthesis?: "funding" | "pipeline";
}

export const diagnosticChapters: readonly ChapterMeta[] = [
  {
    chapter: 1,
    title: "Identité & contexte",
    objective:
      "Cadrer l'entreprise et vérifier que le diagnostic est pertinent (transaction ancien).",
    approxMinutes: 3,
  },
  {
    chapter: 2,
    title: "Équipe & financement",
    objective:
      "Cartographier l'équipe et produire immédiatement la stratégie de financement — c'est le chapitre qui montre la valeur en premier.",
    approxMinutes: null,
    followedBySynthesis: "funding",
  },
  {
    chapter: 3,
    title: "Prospection & entrées vendeurs",
    objective:
      "Mesurer la capacité de l'agence à générer des contacts vendeurs.",
    approxMinutes: null,
  },
  {
    chapter: 4,
    title: "RDV vendeur, découverte & estimation",
    objective:
      "Mesurer la qualité de l'entrée en relation vendeur — là où se joue le mandat.",
    approxMinutes: null,
  },
  {
    chapter: 5,
    title: "Mandats & exclusivité",
    objective: "Mesurer la qualité et la valeur du stock.",
    approxMinutes: null,
  },
  {
    chapter: 6,
    title: "Commercialisation & suivi vendeur",
    objective:
      "Mesurer le pilotage du stock — le chapitre qui révèle le stock mort.",
    approxMinutes: null,
  },
  {
    chapter: 7,
    title: "Acquéreurs",
    objective: "Mesurer la génération et la qualification acquéreurs.",
    approxMinutes: null,
  },
  {
    chapter: 8,
    title: "Visites, offres & transformation",
    objective: "Mesurer la transformation — où la chaîne fuit.",
    approxMinutes: null,
    followedBySynthesis: "pipeline",
  },
  {
    chapter: 9,
    title: "Base de données & e-réputation",
    objective: "Mesurer les actifs immatériels de l'agence.",
    approxMinutes: null,
  },
  {
    chapter: 10,
    title: "Outils & IA",
    objective: "Cartographier l'équipement et la maturité digitale.",
    approxMinutes: null,
  },
  {
    chapter: 11,
    title: "Management, pilotage & vision",
    objective:
      "Comprendre comment le dirigeant pilote — et calibrer le ton de la recommandation.",
    approxMinutes: null,
  },
];

export function getChapterMeta(chapter: DiagnosticChapter): ChapterMeta {
  const meta = diagnosticChapters.find((c) => c.chapter === chapter);
  if (!meta) {
    // Ne devrait jamais arriver — les 11 valeurs sont figées dans le
    // type `DiagnosticChapter`. Fallback prudent.
    return {
      chapter,
      title: `Chapitre ${chapter}`,
      objective: "",
      approxMinutes: null,
    };
  }
  return meta;
}
