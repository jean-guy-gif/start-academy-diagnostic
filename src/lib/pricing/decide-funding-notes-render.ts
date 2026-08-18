/**
 * Décision de rendu — notes de financement par participant (dedupliquées
 * côté moteur `estimateTrainingFunding.perParticipantNotes`).
 *
 * Fonction pure, testable sans DOM. La règle est explicite :
 *   • liste vide (ou uniquement des entrées vides) → aucun rendu
 *     (ni conteneur, ni puce orpheline, ni titre) ;
 *   • au moins une entrée non-vide → rendu de la liste des entrées
 *     conservées (les vides sont retirées à la volée).
 *
 * Consommateur : bloc Tarification de la page proposition
 * (`proposal-view.tsx`). Le composant lit uniquement `shouldRender` et
 * `notes` — la logique de garde vit ici, pas en JSX inline.
 */

export interface FundingNotesRenderDecision {
  /**
   * `true` = au moins une note non-vide est disponible, rendre la liste.
   * `false` = aucune note significative, ne RIEN rendre (garde-fou anti
   * « liste vide » / « puce orpheline » — testé au niveau du contract
   * structural sur proposal-view).
   */
  shouldRender: boolean;
  /** Notes à afficher, dans l'ordre d'origine, sans doublon ni vide. */
  notes: string[];
}

export function decideFundingNotesRender(
  notes: readonly string[] | null | undefined
): FundingNotesRenderDecision {
  if (!notes || notes.length === 0) {
    return { shouldRender: false, notes: [] };
  }
  const cleaned = notes
    .map((n) => (typeof n === "string" ? n.trim() : ""))
    .filter((n) => n.length > 0);
  if (cleaned.length === 0) {
    return { shouldRender: false, notes: [] };
  }
  return { shouldRender: true, notes: cleaned };
}
