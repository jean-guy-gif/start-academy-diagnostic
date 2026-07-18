"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Édition des participants prévisionnels d'un diagnostic.
 *
 * Charge via `GET /api/diagnostics/[id]/participants` et sauvegarde
 * via `PUT`. Auth interne requise — la route renvoie 401 sinon, ce
 * que le composant affiche proprement.
 *
 * Aucune donnée individuelle n'est diffusée publiquement : ce
 * composant est rendu uniquement dans les pages internes
 * (recommandation, proposition).
 */

type ProfStatus =
  | ""
  | "salarie"
  | "agent_commercial_independant"
  | "autre";

interface ParticipantDraft {
  id: string | null;
  firstName: string;
  professionalStatus: ProfStatus;
  // CA N-1 : indé uniquement. Contrainte SQL
  // `diagnostic_participants_no_n1_for_salarie` (migration
  // 20260719120000) rejette toute écriture N-1 avec statut salarié —
  // l'UI purge ce champ au changement de statut vers salarié.
  previousYearProduction: string;
  notes: string;
  // Chantier C1 — heures de formation utilisées cette année civile
  // par ce collaborateur, les 2 statuts. Nouveau champ.
  formationsCurrentYearHours: string;
  // v1.0 — champs communs
  lastName: string;
  entryDate: string;
  // v1.0 — indé
  expertLevel: "" | "debutant" | "confirme" | "expert";
  caAnneeEnCours: string;
  // Chantier A funding-opco-ep §9.2 — consommation AGEFICE annuelle du
  // collaborateur indé.
  ageficeAmountConsumedCurrentYear: string;
  wantsEvolution: "" | "oui" | "non";
  wantsTraining: "" | "oui" | "non";
  priorityNeed: string;
  // v1.0 — salarié
  jobTitle: string;
  contractType: "" | "temps_plein" | "temps_partiel";
  conventionCollective: string;
  eligibleOpco: "" | "oui" | "non";
  // Chantier C1 — montant OPCO EP pris en charge pour ce salarié
  // cette année civile. Collecté seulement, PAS utilisé dans le
  // calcul (même dette que le champ entreprise chantier A ; refonte
  // enveloppe entreprise + retranchement unique prévue au chantier B).
  opcoEpAmountConsumedCurrentYear: string;
}

interface ApiParticipant {
  id: string;
  firstName: string | null;
  professionalStatus:
    | "salarie"
    | "agent_commercial_independant"
    | "autre"
    | null;
  previousYearProduction: number | null;
  notes: string | null;
  lastName?: string | null;
  entryDate?: string | null;
  // Chantier C1 — nouveaux champs (2 statuts pour les heures, salarié
  // seulement pour opco_ep_amount_consumed_current_year).
  formationsCurrentYearHours?: number | null;
  opcoEpAmountConsumedCurrentYear?: number | null;
  expertLevel?: "debutant" | "confirme" | "expert" | null;
  caAnneeEnCours?: number | null;
  ageficeAmountConsumedCurrentYear?: number | null;
  wantsEvolution?: boolean | null;
  wantsTraining?: boolean | null;
  priorityNeed?: string | null;
  jobTitle?: string | null;
  contractType?: "temps_plein" | "temps_partiel" | null;
  conventionCollective?: string | null;
  eligibleOpco?: boolean | null;
}

const DEFAULT_CONVENTION = "Immobilier — IDCC 1527";
const boolToRadio = (v: boolean | null | undefined): "" | "oui" | "non" =>
  v === true ? "oui" : v === false ? "non" : "";
const radioToBool = (v: "" | "oui" | "non"): boolean | null =>
  v === "oui" ? true : v === "non" ? false : null;

const STATUS_OPTIONS: Array<{ value: ProfStatus; label: string }> = [
  { value: "", label: "Sélectionner…" },
  { value: "salarie", label: "Salarié" },
  {
    value: "agent_commercial_independant",
    label: "Agent commercial indépendant",
  },
  { value: "autre", label: "Autre" },
];

function emptyDraft(): ParticipantDraft {
  return {
    id: null,
    firstName: "",
    professionalStatus: "",
    previousYearProduction: "",
    notes: "",
    formationsCurrentYearHours: "",
    lastName: "",
    entryDate: "",
    expertLevel: "",
    caAnneeEnCours: "",
    ageficeAmountConsumedCurrentYear: "",
    wantsEvolution: "",
    wantsTraining: "",
    priorityNeed: "",
    jobTitle: "",
    contractType: "",
    conventionCollective: "",
    eligibleOpco: "",
    opcoEpAmountConsumedCurrentYear: "",
  };
}

function apiToDraft(p: ApiParticipant): ParticipantDraft {
  return {
    id: p.id,
    firstName: p.firstName ?? "",
    professionalStatus: (p.professionalStatus ?? "") as ProfStatus,
    previousYearProduction:
      p.previousYearProduction !== null ? String(p.previousYearProduction) : "",
    notes: p.notes ?? "",
    lastName: p.lastName ?? "",
    entryDate: p.entryDate ?? "",
    formationsCurrentYearHours:
      p.formationsCurrentYearHours !== null &&
      p.formationsCurrentYearHours !== undefined
        ? String(p.formationsCurrentYearHours)
        : "",
    opcoEpAmountConsumedCurrentYear:
      p.opcoEpAmountConsumedCurrentYear !== null &&
      p.opcoEpAmountConsumedCurrentYear !== undefined
        ? String(p.opcoEpAmountConsumedCurrentYear)
        : "",
    expertLevel: (p.expertLevel ?? "") as ParticipantDraft["expertLevel"],
    caAnneeEnCours:
      p.caAnneeEnCours !== null && p.caAnneeEnCours !== undefined
        ? String(p.caAnneeEnCours)
        : "",
    ageficeAmountConsumedCurrentYear:
      p.ageficeAmountConsumedCurrentYear !== null &&
      p.ageficeAmountConsumedCurrentYear !== undefined
        ? String(p.ageficeAmountConsumedCurrentYear)
        : "",
    wantsEvolution: boolToRadio(p.wantsEvolution),
    wantsTraining: boolToRadio(p.wantsTraining),
    priorityNeed: p.priorityNeed ?? "",
    jobTitle: p.jobTitle ?? "",
    contractType: (p.contractType ?? "") as ParticipantDraft["contractType"],
    conventionCollective: p.conventionCollective ?? "",
    eligibleOpco: boolToRadio(p.eligibleOpco),
  };
}

interface Props {
  diagnosticId: string;
  /** Affichage compact ou complet. */
  compact?: boolean;
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export function DiagnosticParticipantsEditor({ diagnosticId, compact }: Props) {
  const [participants, setParticipants] = useState<ParticipantDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/diagnostics/${encodeURIComponent(diagnosticId)}/participants`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setLoadError(json.error ?? `Chargement impossible (HTTP ${res.status}).`);
        setParticipants([]);
        return;
      }
      const json = (await res.json()) as { participants: ApiParticipant[] };
      setParticipants((json.participants ?? []).map(apiToDraft));
    } catch {
      setLoadError("Erreur réseau au chargement des participants.");
    } finally {
      setLoading(false);
    }
  }, [diagnosticId]);

  useEffect(() => {
    // Fetch on-mount des participants. Le setState synchrone (setLoading
    // true) est intentionnel : l'UI doit basculer immédiatement en
    // « chargement » à l'apparition du composant, avant l'attente réseau.
    // Le rule react-hooks/set-state-in-effect ne prévoit pas d'escape
    // hatch idiomatique pour ce pattern data-fetching-on-mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  function updateRow(idx: number, patch: Partial<ParticipantDraft>) {
    setParticipants((prev) =>
      prev.map((p, i) => {
        if (i !== idx) return p;
        const next = { ...p, ...patch };
        // Chantier C1 — bascule statut vers salarié : purge des champs
        // qui n'ont plus de sens (CA N-1 rejeté par le CHECK constraint
        // SQL, CA en cours + AGEFICE consommé sont indé-only). Sans
        // cette purge, une saisie indé pré-existante partirait au
        // serveur et se ferait rejeter — ou pire, polluerait la fiche.
        if (patch.professionalStatus === "salarie") {
          next.previousYearProduction = "";
          next.caAnneeEnCours = "";
          next.ageficeAmountConsumedCurrentYear = "";
        }
        // Bascule vers indé : purge symétrique du champ OPCO EP
        // salarié (nouveau champ chantier C1 salarié-only).
        if (patch.professionalStatus === "agent_commercial_independant") {
          next.opcoEpAmountConsumedCurrentYear = "";
        }
        // v1.0 — auto-pré-remplit la convention collective par défaut la
        // 1re fois que le statut bascule sur « salarié », sans écraser
        // une saisie manuelle existante.
        if (
          patch.professionalStatus === "salarie" &&
          !next.conventionCollective.trim()
        ) {
          next.conventionCollective = DEFAULT_CONVENTION;
        }
        return next;
      })
    );
    if (saveState.kind === "success") setSaveState({ kind: "idle" });
  }

  function addRow() {
    setParticipants((prev) => [...prev, emptyDraft()]);
    if (saveState.kind === "success") setSaveState({ kind: "idle" });
  }

  function removeRow(idx: number) {
    if (
      typeof window !== "undefined" &&
      !window.confirm("Retirer ce participant de la liste prévisionnelle ?")
    ) {
      return;
    }
    setParticipants((prev) => prev.filter((_, i) => i !== idx));
    if (saveState.kind === "success") setSaveState({ kind: "idle" });
  }

  async function save() {
    setSaveState({ kind: "saving" });
    try {
      const numOrNull = (raw: string): number | null => {
        const trimmed = raw.trim();
        if (trimmed === "") return null;
        const n = Number(trimmed);
        return Number.isFinite(n) ? n : null;
      };
      // Chantier C1 — les 3 champs `formations24m*` NE SONT PLUS
      // envoyés. Les valeurs déjà en base restent intactes (arrêt
      // d'écriture uniquement, cleanup / drop des colonnes prévu en
      // PR séparée). La route Zod les rejette côté serveur.
      const payload = {
        participants: participants.map((p) => ({
          firstName: p.firstName.trim() || null,
          professionalStatus: p.professionalStatus || null,
          previousYearProduction: numOrNull(p.previousYearProduction),
          notes: p.notes.trim() || null,
          lastName: p.lastName.trim() || null,
          entryDate: p.entryDate.trim() || null,
          formationsCurrentYearHours: numOrNull(p.formationsCurrentYearHours),
          expertLevel: p.expertLevel || null,
          caAnneeEnCours: numOrNull(p.caAnneeEnCours),
          ageficeAmountConsumedCurrentYear: numOrNull(
            p.ageficeAmountConsumedCurrentYear
          ),
          wantsEvolution: radioToBool(p.wantsEvolution),
          wantsTraining: radioToBool(p.wantsTraining),
          priorityNeed: p.priorityNeed.trim() || null,
          jobTitle: p.jobTitle.trim() || null,
          contractType: p.contractType || null,
          conventionCollective: p.conventionCollective.trim() || null,
          eligibleOpco: radioToBool(p.eligibleOpco),
          opcoEpAmountConsumedCurrentYear: numOrNull(
            p.opcoEpAmountConsumedCurrentYear
          ),
        })),
        costPerParticipant: null,
      };
      const res = await fetch(
        `/api/diagnostics/${encodeURIComponent(diagnosticId)}/participants`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      if (!res.ok) {
        const detail = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setSaveState({
          kind: "error",
          message:
            detail.error ?? `Sauvegarde refusée (HTTP ${res.status}).`,
        });
        return;
      }
      setSaveState({ kind: "success" });
    } catch {
      setSaveState({
        kind: "error",
        message: "Erreur réseau. Réessayez.",
      });
    }
  }

  return (
    <Card className="border-border/60 bg-white">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="font-heading text-xl text-[#00527a]">
              Participants & financement potentiel
            </CardTitle>
            <CardDescription>
              {compact
                ? "Édition rapide — les modifications seront prises en compte à la prochaine génération de proposition."
                : "Modifier les participants prévisionnels saisis lors du diagnostic. Les estimations de prise en charge seront recalculées au prochain lancement de la proposition."}
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void load()}
            disabled={loading}
            className="h-8 px-3 text-xs"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            />
            Actualiser
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadError ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {loadError}
          </p>
        ) : null}

        {loading && participants.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </p>
        ) : null}

        {!loading && participants.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
            Aucun participant prévisionnel saisi. Ajoutez-en pour
            permettre l&apos;estimation de la prise en charge.
          </p>
        ) : null}

        {participants.length > 0 ? (
          <ul className="space-y-3">
            {participants.map((p, idx) => (
              <li
                key={`participant-${idx}`}
                className="rounded-md border border-border/60 bg-muted/10 p-3"
              >
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="space-y-1">
                    <Label
                      htmlFor={`edit-firstName-${idx}`}
                      className="text-xs text-muted-foreground"
                    >
                      Prénom
                    </Label>
                    <Input
                      id={`edit-firstName-${idx}`}
                      value={p.firstName}
                      onChange={(e) =>
                        updateRow(idx, { firstName: e.target.value })
                      }
                      placeholder={`Participant ${idx + 1}`}
                      className="h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label
                      htmlFor={`edit-status-${idx}`}
                      className="text-xs text-muted-foreground"
                    >
                      Statut professionnel
                    </Label>
                    <select
                      id={`edit-status-${idx}`}
                      value={p.professionalStatus}
                      onChange={(e) =>
                        updateRow(idx, {
                          professionalStatus: e.target.value as ProfStatus,
                        })
                      }
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {/*
                    Chantier C1 — cellule N-1 : champ actif pour un indé
                    (CA N-1 obligatoire au calcul AGEFICE, seuil 7 000 €),
                    tiret grisé pour un salarié / statut vide. La grille
                    reste 4 colonnes STABLE (aucun saut de layout).
                  */}
                  {p.professionalStatus === "agent_commercial_independant" ? (
                    <div className="space-y-1">
                      <Label
                        htmlFor={`edit-production-${idx}`}
                        className="text-xs text-muted-foreground"
                      >
                        Production N-1 (€)
                      </Label>
                      <Input
                        id={`edit-production-${idx}`}
                        type="text"
                        inputMode="numeric"
                        value={p.previousYearProduction}
                        onChange={(e) =>
                          updateRow(idx, {
                            previousYearProduction: e.target.value,
                          })
                        }
                        placeholder="Ex : 12000"
                        className="h-9"
                      />
                    </div>
                  ) : (
                    <div
                      className="space-y-1"
                      aria-label="Production N-1 (indé uniquement)"
                    >
                      <span className="block text-xs text-muted-foreground">
                        Production N-1 (€)
                      </span>
                      <div className="flex h-9 items-center px-1 text-sm text-muted-foreground/60">
                        —
                      </div>
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label
                      htmlFor={`edit-notes-${idx}`}
                      className="text-xs text-muted-foreground"
                    >
                      Commentaire
                    </Label>
                    <Input
                      id={`edit-notes-${idx}`}
                      value={p.notes}
                      onChange={(e) =>
                        updateRow(idx, { notes: e.target.value })
                      }
                      placeholder="Optionnel"
                      className="h-9"
                    />
                  </div>
                </div>

                {/*
                  v1.0 — champs étendus. Tout est optionnel : saisie
                  partielle autorisée, aucun blocage. Les fiches
                  indé/salarié se déplient selon `professionalStatus`.
                */}
                <div className="mt-3 space-y-3 border-t border-dashed border-border/60 pt-3">
                  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Informations complémentaires (facultatif)
                  </p>
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1">
                      <Label
                        htmlFor={`edit-lastName-${idx}`}
                        className="text-xs text-muted-foreground"
                      >
                        Nom
                      </Label>
                      <Input
                        id={`edit-lastName-${idx}`}
                        value={p.lastName}
                        onChange={(e) =>
                          updateRow(idx, { lastName: e.target.value })
                        }
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label
                        htmlFor={`edit-entryDate-${idx}`}
                        className="text-xs text-muted-foreground"
                      >
                        Date d&apos;entrée
                      </Label>
                      <Input
                        id={`edit-entryDate-${idx}`}
                        type="date"
                        value={p.entryDate}
                        onChange={(e) =>
                          updateRow(idx, { entryDate: e.target.value })
                        }
                        className="h-9"
                      />
                    </div>
                    {/*
                      Chantier C1 — heures de formation utilisées cette
                      année civile en cours. Nouveau champ, les 2
                      statuts (indé et salarié). Année dynamique via
                      new Date().getFullYear() côté client.
                    */}
                    <div className="space-y-1">
                      <Label
                        htmlFor={`edit-formationsCurrentYearHours-${idx}`}
                        className="text-xs text-muted-foreground"
                      >
                        Heures formation utilisées depuis janvier{" "}
                        {new Date().getFullYear()}
                      </Label>
                      <Input
                        id={`edit-formationsCurrentYearHours-${idx}`}
                        type="text"
                        inputMode="numeric"
                        value={p.formationsCurrentYearHours}
                        onChange={(e) =>
                          updateRow(idx, {
                            formationsCurrentYearHours: e.target.value,
                          })
                        }
                        placeholder="Laisser vide si inconnu"
                        className="h-9"
                      />
                    </div>
                  </div>

                  {p.professionalStatus === "agent_commercial_independant" && (
                    <div className="rounded-md border border-border/60 bg-[#eaf5ff]/30 p-3">
                      <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-[#00527a]">
                        Fiche indépendant
                      </p>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-1">
                          <Label
                            htmlFor={`edit-expertLevel-${idx}`}
                            className="text-xs text-muted-foreground"
                          >
                            Niveau d&apos;expertise
                          </Label>
                          <select
                            id={`edit-expertLevel-${idx}`}
                            value={p.expertLevel}
                            onChange={(e) =>
                              updateRow(idx, {
                                expertLevel: e.target
                                  .value as ParticipantDraft["expertLevel"],
                              })
                            }
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                          >
                            <option value="">—</option>
                            <option value="debutant">Débutant</option>
                            <option value="confirme">Confirmé</option>
                            <option value="expert">Expert</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label
                            htmlFor={`edit-caEnCours-${idx}`}
                            className="text-xs text-muted-foreground"
                          >
                            CA année en cours — projection (€)
                          </Label>
                          <Input
                            id={`edit-caEnCours-${idx}`}
                            type="text"
                            inputMode="numeric"
                            value={p.caAnneeEnCours}
                            onChange={(e) =>
                              updateRow(idx, {
                                caAnneeEnCours: e.target.value,
                              })
                            }
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label
                            htmlFor={`edit-wantsEvo-${idx}`}
                            className="text-xs text-muted-foreground"
                          >
                            Souhait d&apos;évolution
                          </Label>
                          <select
                            id={`edit-wantsEvo-${idx}`}
                            value={p.wantsEvolution}
                            onChange={(e) =>
                              updateRow(idx, {
                                wantsEvolution: e.target
                                  .value as ParticipantDraft["wantsEvolution"],
                              })
                            }
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                          >
                            <option value="">—</option>
                            <option value="oui">Oui</option>
                            <option value="non">Non</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label
                            htmlFor={`edit-wantsTrain-${idx}`}
                            className="text-xs text-muted-foreground"
                          >
                            Souhait de formation
                          </Label>
                          <select
                            id={`edit-wantsTrain-${idx}`}
                            value={p.wantsTraining}
                            onChange={(e) =>
                              updateRow(idx, {
                                wantsTraining: e.target
                                  .value as ParticipantDraft["wantsTraining"],
                              })
                            }
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                          >
                            <option value="">—</option>
                            <option value="oui">Oui</option>
                            <option value="non">Non</option>
                          </select>
                        </div>
                        <div className="space-y-1 md:col-span-2">
                          <Label
                            htmlFor={`edit-priority-${idx}`}
                            className="text-xs text-muted-foreground"
                          >
                            Besoin prioritaire (texte libre)
                          </Label>
                          <Input
                            id={`edit-priority-${idx}`}
                            value={p.priorityNeed}
                            onChange={(e) =>
                              updateRow(idx, { priorityNeed: e.target.value })
                            }
                            placeholder="Ex : structurer la prospection…"
                            className="h-9"
                          />
                        </div>
                        {/*
                          Chantier A funding-opco-ep §9.2 — consommation
                          AGEFICE de l'année civile en cours. Année
                          dynamique : new Date().getFullYear() (composant
                          client). Distinct de « formations 24 mois »
                          ci-dessus qui reste utilisé pour la maturité.
                        */}
                        <div className="space-y-1 md:col-span-3">
                          <Label
                            htmlFor={`edit-ageficeConsumed-${idx}`}
                            className="text-xs text-muted-foreground"
                          >
                            Montant AGEFICE déjà utilisé par ce
                            collaborateur depuis janvier{" "}
                            {new Date().getFullYear()} (€)
                          </Label>
                          <Input
                            id={`edit-ageficeConsumed-${idx}`}
                            type="text"
                            inputMode="numeric"
                            value={p.ageficeAmountConsumedCurrentYear}
                            onChange={(e) =>
                              updateRow(idx, {
                                ageficeAmountConsumedCurrentYear:
                                  e.target.value,
                              })
                            }
                            placeholder="Laisser vide si inconnu"
                            className="h-9"
                          />
                          <p className="text-[11px] leading-snug text-muted-foreground">
                            Différent des formations passées ci-dessus —
                            ici c&apos;est le budget AGEFICE déjà
                            consommé cette année.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {p.professionalStatus === "salarie" && (
                    <div className="rounded-md border border-border/60 bg-[#eaf5ff]/30 p-3">
                      <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-[#00527a]">
                        Fiche salarié
                      </p>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-1">
                          <Label
                            htmlFor={`edit-jobTitle-${idx}`}
                            className="text-xs text-muted-foreground"
                          >
                            Intitulé de poste
                          </Label>
                          <Input
                            id={`edit-jobTitle-${idx}`}
                            value={p.jobTitle}
                            onChange={(e) =>
                              updateRow(idx, { jobTitle: e.target.value })
                            }
                            className="h-9"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label
                            htmlFor={`edit-contract-${idx}`}
                            className="text-xs text-muted-foreground"
                          >
                            Contrat
                          </Label>
                          <select
                            id={`edit-contract-${idx}`}
                            value={p.contractType}
                            onChange={(e) =>
                              updateRow(idx, {
                                contractType: e.target
                                  .value as ParticipantDraft["contractType"],
                              })
                            }
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                          >
                            <option value="">—</option>
                            <option value="temps_plein">Temps plein</option>
                            <option value="temps_partiel">Temps partiel</option>
                          </select>
                        </div>
                        <div className="space-y-1">
                          <Label
                            htmlFor={`edit-opco-${idx}`}
                            className="text-xs text-muted-foreground"
                          >
                            Éligible OPCO
                          </Label>
                          <select
                            id={`edit-opco-${idx}`}
                            value={p.eligibleOpco}
                            onChange={(e) =>
                              updateRow(idx, {
                                eligibleOpco: e.target
                                  .value as ParticipantDraft["eligibleOpco"],
                              })
                            }
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
                          >
                            <option value="">—</option>
                            <option value="oui">Oui</option>
                            <option value="non">Non</option>
                          </select>
                        </div>
                        <div className="space-y-1 md:col-span-3">
                          <Label
                            htmlFor={`edit-convention-${idx}`}
                            className="text-xs text-muted-foreground"
                          >
                            Convention collective
                          </Label>
                          <Input
                            id={`edit-convention-${idx}`}
                            value={p.conventionCollective}
                            onChange={(e) =>
                              updateRow(idx, {
                                conventionCollective: e.target.value,
                              })
                            }
                            placeholder={DEFAULT_CONVENTION}
                            className="h-9"
                          />
                        </div>
                        {/*
                          Chantier C1 — montant OPCO EP pris en charge
                          pour ce salarié cette année civile. Collecté
                          seulement, PAS utilisé dans le calcul (même
                          dette que le champ entreprise du chantier A ;
                          refonte enveloppe entreprise + retranchement
                          unique prévue au chantier B).
                        */}
                        <div className="space-y-1 md:col-span-3">
                          <Label
                            htmlFor={`edit-opcoEpConsumed-${idx}`}
                            className="text-xs text-muted-foreground"
                          >
                            Montant OPCO EP pris en charge pour ce
                            collaborateur en {new Date().getFullYear()}{" "}
                            (€)
                          </Label>
                          <Input
                            id={`edit-opcoEpConsumed-${idx}`}
                            type="text"
                            inputMode="numeric"
                            value={p.opcoEpAmountConsumedCurrentYear}
                            onChange={(e) =>
                              updateRow(idx, {
                                opcoEpAmountConsumedCurrentYear:
                                  e.target.value,
                              })
                            }
                            placeholder="Laisser vide si inconnu"
                            className="h-9"
                          />
                          <p className="text-[11px] leading-snug text-muted-foreground">
                            Formations de ce salarié déjà financées par
                            l&apos;OPCO cette année. Laisser vide si
                            inconnu.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="mt-2 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeRow(idx)}
                    className="h-8 px-3 text-xs text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Retirer
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addRow}
            className="h-9 px-3 text-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter un participant
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void save()}
            disabled={saveState.kind === "saving"}
            className="h-9 px-3 bg-[#00527a] text-white hover:bg-[#00527a]/90"
          >
            {saveState.kind === "saving" ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>

        {saveState.kind === "success" ? (
          <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            <p className="font-medium">
              Participants prévisionnels enregistrés.
            </p>
            <p className="mt-1">
              Les modifications seront prises en compte à la prochaine
              génération de proposition.
            </p>
          </div>
        ) : null}
        {saveState.kind === "error" ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {saveState.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
