import type { AgeficePresentielFundingResult } from "@/lib/pricing/agefice-presentiel-funding";

export interface AgeficePresentielCoverageBadgeProps {
  result: AgeficePresentielFundingResult;
  /**
   * `null` = CA N-1 non renseigné → l'estimation est traitée comme
   * une enveloppe inconnue (alerte « droits à vérifier », pas de
   * badge).
   */
  previousYearProduction: number | null;
}

export type AgeficePresentielRenderKind = "badge" | "alert" | "none";

/**
 * Fonction pure exportée pour être testable sans renderer React.
 * Le composant ci-dessous lit cette décision et rend le JSX
 * correspondant.
 */
export function decideAgeficePresentielRender(
  props: AgeficePresentielCoverageBadgeProps
): AgeficePresentielRenderKind {
  const { result, previousYearProduction } = props;
  const rightsCheckNeeded =
    previousYearProduction === null ||
    result.alert !== null ||
    result.envelopeRemaining === null;

  const canShowFullCoverageBadge =
    !rightsCheckNeeded &&
    result.isFullyCovered &&
    result.resteACharge === 0 &&
    result.envelopeRemaining !== null;

  if (canShowFullCoverageBadge) return "badge";
  if (rightsCheckNeeded) return "alert";
  return "none";
}

/**
 * Rendu :
 *   • Badge « Prise en charge 100 % » ssi
 *       result.isFullyCovered === true
 *       ET result.envelopeRemaining !== null
 *       ET previousYearProduction !== null.
 *   • Sinon, si result.alert !== null OU previousYearProduction === null :
 *     alerte « droits à vérifier ».
 *   • Sinon rien.
 *
 * Garde-fou runtime : `result.envelopeRemaining !== null` OU
 * `result.resteACharge > 0` bloque le badge — miroir du contrat (d)
 * testé au niveau du module.
 */
export function AgeficePresentielCoverageBadge(
  props: AgeficePresentielCoverageBadgeProps
) {
  const kind = decideAgeficePresentielRender(props);
  return <AgeficePresentielCoverageBadgeView kind={kind} />;
}

/**
 * Variante « verdict pré-calculé » — utilisée quand l'agrégation
 * multi-participants a déjà été faite en amont (ex. par
 * `estimateTrainingFunding` qui expose un champ agrégé
 * `ageficePresentielCoverage: 'badge' | 'alert' | 'none' | null`).
 *
 * Consommateur type : la page proposition (proposal-view), qui reçoit
 * la décision d'affichage déjà tranchée par le moteur pricing — pas
 * question de la ré-implémenter en JSX inline (correctif 1 du lot
 * fiabilité). Le test structural
 * `proposal-view-uses-shared-badge.test.tsx` prouve que la page
 * importe bien ce composant partagé.
 *
 * `null` = décision indisponible (chemin fallback sans trainingHours)
 * → aucun rendu, comportement neutre.
 */
export function AgeficePresentielCoverageBadgeView({
  kind,
}: {
  kind: AgeficePresentielRenderKind | null;
}) {
  if (kind === "badge") {
    return (
      <span
        data-testid="agefice-full-coverage-badge"
        className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-900"
      >
        Prise en charge 100 %
      </span>
    );
  }

  if (kind === "alert") {
    return (
      <span
        data-testid="agefice-rights-check-alert"
        className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-900"
      >
        Droits à vérifier
      </span>
    );
  }

  return null;
}
