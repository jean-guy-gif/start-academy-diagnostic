"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Cloud,
  FileText,
  HardDrive,
  Loader2,
  SkipForward,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { isAuditAvailable } from "@/lib/audit/decide-audit-render";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  createClient,
  createDiagnostic,
  getDiagnosticSummary,
  saveDiagnosticAnswer,
  updateDiagnosticStatus,
  type DiagnosticMode,
  type DiagnosticSummary,
  type ServiceMode,
} from "@/lib/diagnostics/diagnostic-service";
import { diagnosticQuestions } from "@/lib/data/diagnostic-questions";
import { getChapterMeta } from "@/lib/data/diagnostic-chapters";
import {
  computeRatiosAndAlerts,
  type DiagnosticAlert,
} from "@/lib/diagnostics/ratios-service";
import { computeConsumptionRate } from "@/lib/pricing/training-funding";
import type { DiagnosticQuestion, ProfileTarget } from "@/types";

type Step =
  | "context"
  | "questions"
  | "synthesis-funding"
  | "synthesis-pipeline"
  | "summary";

interface ContextForm {
  companyName: string;
  director: string;
  email: string;
  phone: string;
  expectedParticipants: string;
  profilesInScope: ProfileTarget[];
  declaredGoal: string;
  mode: DiagnosticMode;
}

type ParticipantStatusValue =
  | ""
  | "salarie"
  | "agent_commercial_independant"
  | "autre";

interface DiagnosticParticipantDraft {
  firstName: string;
  professionalStatus: ParticipantStatusValue;
  previousYearProduction: string;
  notes: string;
}

const EMPTY_PARTICIPANT_DRAFT: DiagnosticParticipantDraft = {
  firstName: "",
  professionalStatus: "",
  previousYearProduction: "",
  notes: "",
};

const STATUS_OPTIONS: Array<{ value: ParticipantStatusValue; label: string }> =
  [
    { value: "", label: "Sélectionner…" },
    { value: "salarie", label: "Salarié" },
    {
      value: "agent_commercial_independant",
      label: "Agent commercial indépendant",
    },
    { value: "autre", label: "Autre" },
  ];

function resizeParticipants(
  prev: DiagnosticParticipantDraft[],
  count: number
): DiagnosticParticipantDraft[] {
  if (count <= 0) return [];
  if (prev.length === count) return prev;
  if (count > prev.length) {
    const next = [...prev];
    while (next.length < count) next.push({ ...EMPTY_PARTICIPANT_DRAFT });
    return next;
  }
  return prev.slice(0, count);
}

const PROFILE_OPTIONS: { value: ProfileTarget; label: string }[] = [
  { value: "conseiller", label: "Conseiller" },
  { value: "manager", label: "Manager" },
  { value: "assistant", label: "Assistant" },
  { value: "direction", label: "Direction" },
];

const MODE_OPTIONS: { value: DiagnosticMode; label: string; description: string }[] = [
  {
    value: "guided",
    label: "Questions guidées",
    description: "Une question à la fois pendant le rendez-vous.",
  },
  {
    value: "transcript",
    label: "Transcription seule",
    description: "Coller une transcription, à analyser plus tard.",
  },
  {
    value: "hybrid",
    label: "Hybride",
    description: "Questions guidées + transcription en complément.",
  },
];

const INITIAL_FORM: ContextForm = {
  companyName: "",
  director: "",
  email: "",
  phone: "",
  expectedParticipants: "",
  profilesInScope: ["conseiller"],
  declaredGoal: "",
  mode: "guided",
};

interface AnswerDraft {
  answer: string;
  note: string;
  isWeakSignal: boolean;
}

const EMPTY_DRAFT: AnswerDraft = { answer: "", note: "", isWeakSignal: false };

export function NewDiagnosticFlow() {
  const [step, setStep] = useState<Step>("context");
  const [form, setForm] = useState<ContextForm>(INITIAL_FORM);

  const [clientId, setClientId] = useState<string | null>(null);
  const [diagnosticId, setDiagnosticId] = useState<string | null>(null);

  const [mode, setMode] = useState<ServiceMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [questionIndex, setQuestionIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, AnswerDraft>>({});
  const [savedCount, setSavedCount] = useState(0);

  // v1.0b — chaque synthèse intermédiaire n'est présentée qu'une fois,
  // à la sortie de son chapitre. `Passer` ou `Continuer` la marquent
  // comme vue pour ne pas la ré-afficher si le commercial revient en
  // arrière puis avance à nouveau.
  const [shownFundingSynthesis, setShownFundingSynthesis] = useState(false);
  const [shownPipelineSynthesis, setShownPipelineSynthesis] = useState(false);

  // Chantier A funding-opco-ep §9.1 — saisie dirigeant chapitre 2
  // (montant OPCO EP déjà consommé par l'entreprise cette année civile).
  // String pour supporter le champ vide ; conversion au moment du PATCH.
  const [opcoEpConsumedInput, setOpcoEpConsumedInput] = useState("");

  const [summary, setSummary] = useState<DiagnosticSummary | null>(null);
  const [participants, setParticipants] = useState<DiagnosticParticipantDraft[]>(
    []
  );

  // Resynchronise les lignes participants quand le commercial saisit /
  // modifie le nombre attendu. Demande confirmation avant de supprimer
  // des lignes déjà remplies.
  useEffect(() => {
    const target = Number(form.expectedParticipants);
    if (!Number.isFinite(target) || target <= 0) {
      if (participants.length === 0) return;
      // Resize dérivé du champ `expectedParticipants` : setState
      // synchrone intentionnel — l'UI doit refléter immédiatement le
      // changement de nombre de lignes participants.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setParticipants([]);
      return;
    }
    if (target === participants.length) return;
    if (target < participants.length) {
      const dropped = participants.slice(target);
      const hasContent = dropped.some(
        (p) =>
          p.firstName.trim() ||
          p.professionalStatus ||
          p.previousYearProduction.trim() ||
          p.notes.trim()
      );
      if (
        hasContent &&
        typeof window !== "undefined" &&
        !window.confirm(
          `Réduire à ${target} participants supprimera ${participants.length - target} ligne(s) déjà remplie(s). Continuer ?`
        )
      ) {
        // L'utilisateur annule — on remet le nombre attendu à la valeur précédente.
        setForm((prev) => ({
          ...prev,
          expectedParticipants: String(participants.length),
        }));
        return;
      }
    }
    setParticipants((prev) => resizeParticipants(prev, target));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.expectedParticipants]);

  function updateParticipant<K extends keyof DiagnosticParticipantDraft>(
    idx: number,
    key: K,
    value: DiagnosticParticipantDraft[K]
  ) {
    setParticipants((prev) =>
      prev.map((p, i) => {
        if (i !== idx) return p;
        const next: DiagnosticParticipantDraft = { ...p, [key]: value };
        // Chantier C1 — bascule statut vers salarié : purge du CA N-1
        // (interdit côté SQL par `diagnostic_participants_no_n1_for_
        // salarie` migration 20260719120000). Sans cette purge, une
        // saisie faite au moment où le statut était indé/vide serait
        // envoyée au serveur et rejetée par la contrainte.
        if (key === "professionalStatus" && value === "salarie") {
          next.previousYearProduction = "";
        }
        return next;
      })
    );
  }

  type ParticipantsPersistStatus =
    | { kind: "idle" }
    | { kind: "persisting" }
    | { kind: "success" }
    | { kind: "error"; message: string };

  const [participantsPersistStatus, setParticipantsPersistStatus] =
    useState<ParticipantsPersistStatus>({ kind: "idle" });

  async function persistParticipants(diagnosticIdToUse: string) {
    if (participants.length === 0) {
      setParticipantsPersistStatus({ kind: "idle" });
      return;
    }
    setParticipantsPersistStatus({ kind: "persisting" });
    try {
      const payload = {
        participants: participants.map((p) => ({
          firstName: p.firstName.trim() || null,
          professionalStatus: p.professionalStatus || null,
          previousYearProduction:
            p.previousYearProduction.trim() !== ""
              ? Number(p.previousYearProduction)
              : null,
          notes: p.notes.trim() || null,
        })),
        // Pas encore de durée totale connue à ce stade — le serveur
        // recalculera l'éligibilité quand la recommandation existera.
        costPerParticipant: null,
      };
      const res = await fetch(
        `/api/diagnostics/${encodeURIComponent(diagnosticIdToUse)}/participants`,
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
        setParticipantsPersistStatus({
          kind: "error",
          message:
            detail.error ??
            `Les participants prévisionnels n'ont pas été enregistrés (HTTP ${res.status}). Vérifiez votre connexion puis réessayez.`,
        });
        return;
      }
      setParticipantsPersistStatus({ kind: "success" });
    } catch {
      setParticipantsPersistStatus({
        kind: "error",
        message:
          "Les participants prévisionnels n'ont pas été enregistrés. Vérifiez votre connexion puis réessayez.",
      });
    }
  }

  async function retryPersistParticipants() {
    if (!diagnosticId) return;
    await persistParticipants(diagnosticId);
  }

  const questions = useMemo(() => {
    const selected = new Set(form.profilesInScope);
    return diagnosticQuestions.filter(
      (q) => q.profile === "all" || selected.has(q.profile as ProfileTarget)
    );
  }, [form.profilesInScope]);

  const currentQuestion = questions[questionIndex];
  const currentDraft = currentQuestion
    ? drafts[currentQuestion.id] ?? EMPTY_DRAFT
    : EMPTY_DRAFT;

  // Position du chapitre courant dans la séquence guidée : les
  // questions couvrent Ch.3 → Ch.11, mais l'affichage montre
  // « étape 1 sur 9 », « étape 2 sur 9 »… `orderedChapters` liste
  // les chapitres réellement présents dans le filtre profil, dans
  // l'ordre où ils apparaissent — la longueur n'est pas figée à 9
  // si le filtre profil retire un chapitre.
  const orderedChapters = useMemo(() => {
    const seen: number[] = [];
    for (const q of questions) {
      if (q.chapter !== undefined && !seen.includes(q.chapter)) {
        seen.push(q.chapter);
      }
    }
    return seen;
  }, [questions]);
  const totalChapterSteps = orderedChapters.length;
  const chapterStepPosition = currentQuestion?.chapter
    ? orderedChapters.indexOf(currentQuestion.chapter) + 1
    : 0;
  const progress =
    questions.length === 0 ? 0 : Math.round((savedCount / questions.length) * 100);

  // Correction (5) validée : pré-remplissage inter-chapitres — deux
  // cas concrets uniquement (outil de pige Ch.3 → Ch.10, outil
  // d'estimation Ch.4 → Ch.10). Pas de moteur générique.
  //
  // Règle : si la question courante a un `prefillFrom`, qu'elle n'a
  // pas encore de draft distinct de vide, ET qu'une réponse existe
  // pour la question source, on copie la valeur. L'utilisateur peut
  // ensuite écraser sans friction.
  useEffect(() => {
    if (!currentQuestion) return;
    const source = currentQuestion.prefillFrom;
    if (!source) return;
    const existing = drafts[currentQuestion.id];
    if (existing && existing.answer.trim().length > 0) return;
    const sourceDraft = drafts[source.questionId];
    const sourceValue = sourceDraft?.answer?.trim() ?? "";
    if (sourceValue.length === 0) return;
    // Pré-remplissage inter-chapitres (Étape 5 correction 5). Le
    // setState synchrone est intentionnel : quand la question courante
    // change, on doit propager la valeur source AVANT le rendu suivant
    // pour que l'utilisateur voie déjà le champ pré-rempli.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDrafts((prev) => ({
      ...prev,
      [currentQuestion.id]: {
        answer: sourceValue,
        note: existing?.note ?? "",
        isWeakSignal: existing?.isWeakSignal ?? false,
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentQuestion?.id]);

  function updateForm<K extends keyof ContextForm>(key: K, value: ContextForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleProfile(profile: ProfileTarget) {
    setForm((prev) => {
      const has = prev.profilesInScope.includes(profile);
      const next = has
        ? prev.profilesInScope.filter((p) => p !== profile)
        : [...prev.profilesInScope, profile];
      return { ...prev, profilesInScope: next };
    });
  }

  function setDraft(questionId: string, patch: Partial<AnswerDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [questionId]: { ...(prev[questionId] ?? EMPTY_DRAFT), ...patch },
    }));
  }

  async function handleStartDiagnostic(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);

    const clientResult = await createClient({
      companyName: form.companyName.trim(),
      director: form.director.trim() || null,
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      collaboratorsCount:
        form.expectedParticipants !== "" ? Number(form.expectedParticipants) : null,
      teamTypology: form.profilesInScope,
    });
    if (!clientResult.data) {
      // Aucun fallback dispo (preprod/prod sans API) : on remonte
      // l'erreur explicite et on n'avance pas dans le flow.
      setError(
        clientResult.error ??
          "Création du client impossible : API indisponible."
      );
      setMode(clientResult.mode);
      setSubmitting(false);
      return;
    }

    const diagnosticResult = await createDiagnostic({
      clientId: clientResult.data.id,
      mode: form.mode,
      declaredGoal: form.declaredGoal.trim() || null,
      profilesInScope: form.profilesInScope,
      expectedParticipants:
        form.expectedParticipants !== "" ? Number(form.expectedParticipants) : null,
      notes: null,
    });
    if (!diagnosticResult.data) {
      setError(
        diagnosticResult.error ??
          "Création du diagnostic impossible : API indisponible."
      );
      setMode(diagnosticResult.mode);
      setSubmitting(false);
      return;
    }

    setClientId(clientResult.data.id);
    setDiagnosticId(diagnosticResult.data.id);

    const combinedMode: ServiceMode =
      clientResult.mode === "supabase" && diagnosticResult.mode === "supabase"
        ? "supabase"
        : "local";
    setMode(combinedMode);
    setError(diagnosticResult.error ?? clientResult.error ?? null);

    // Persiste les participants prévisionnels saisis pendant l'étape
    // contexte. Best-effort : si l'API échoue (mode local / Supabase
    // down), on continue le diagnostic — la liste pourra être complétée
    // plus tard depuis la fiche session.
    if (combinedMode === "supabase" && participants.length > 0) {
      await persistParticipants(diagnosticResult.data.id);
    }

    setSubmitting(false);
    setStep("questions");
  }

  async function persistAnswer(options: { skipped: boolean }) {
    if (!currentQuestion || !diagnosticId || submitting) return;
    setSubmitting(true);
    const result = await saveDiagnosticAnswer({
      diagnosticId,
      questionId: currentQuestion.id,
      questionText: currentQuestion.question,
      category: currentQuestion.category,
      answer: options.skipped ? null : currentDraft.answer.trim() || null,
      note: currentDraft.note.trim() || null,
      isWeakSignal: currentDraft.isWeakSignal,
      isSkipped: options.skipped,
    });
    setMode((prev) => (prev === "local" ? "local" : result.mode));
    if (result.error) setError(result.error);
    setSavedCount((c) => c + 1);
    setSubmitting(false);

    const isLast = questionIndex + 1 >= questions.length;
    const currentChapter = currentQuestion.chapter;
    const nextChapter = isLast ? null : questions[questionIndex + 1].chapter;
    // v1.0b — synthèses non bloquantes injectées à la sortie de Ch.2
    // et Ch.8. On avance d'abord le curseur pour que « Continuer »
    // depuis la synthèse pointe déjà sur la 1re question du chapitre
    // suivant sans re-manipulation d'état.
    if (!isLast) setQuestionIndex((i) => i + 1);

    const crossingFunding =
      currentChapter === 2 &&
      (isLast || (nextChapter !== undefined && nextChapter !== null && nextChapter > 2)) &&
      !shownFundingSynthesis;
    const crossingPipeline =
      currentChapter === 8 &&
      (isLast || (nextChapter !== undefined && nextChapter !== null && nextChapter > 8)) &&
      !shownPipelineSynthesis;

    if (crossingFunding) {
      setStep("synthesis-funding");
      return;
    }
    if (crossingPipeline) {
      setStep("synthesis-pipeline");
      return;
    }
    if (isLast) {
      await finishDiagnostic();
    }
  }

  // v1.0b — sortie d'une synthèse intermédiaire. `Passer` ou
  // `Continuer` ont le même effet fonctionnel : marquer la synthèse
  // comme vue et reprendre le flow (soit questions suivantes, soit
  // finalisation si on était au bout du questionnaire).
  async function continueFromSynthesis(kind: "funding" | "pipeline") {
    if (kind === "funding") {
      setShownFundingSynthesis(true);
      // Chantier A funding-opco-ep §9.1 — persiste la consommation
      // OPCO EP entreprise saisie par le dirigeant dans la synthèse
      // ch.2. Best-effort : un échec réseau n'empêche pas d'avancer
      // (la valeur est facultative — NULL déclenche « estimation à
      // valider » côté funding, pas de blocage).
      if (diagnosticId) {
        const trimmed = opcoEpConsumedInput.trim();
        const parsed = trimmed === "" ? null : Number(trimmed);
        const payloadValue =
          parsed !== null && Number.isFinite(parsed) && parsed >= 0
            ? parsed
            : null;
        try {
          await fetch(
            `/api/diagnostics/${encodeURIComponent(diagnosticId)}/funding-consumption`,
            {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                opcoEpAmountConsumedCurrentYear: payloadValue,
              }),
            }
          );
        } catch {
          /* best-effort — le champ reste NULL côté DB si l'appel échoue */
        }
      }
    } else setShownPipelineSynthesis(true);
    if (questionIndex >= questions.length) {
      await finishDiagnostic();
    } else {
      setStep("questions");
    }
  }

  async function finishDiagnostic() {
    if (!diagnosticId) return;
    setSubmitting(true);
    const statusResult = await updateDiagnosticStatus(diagnosticId, "to_review");
    const summaryResult = await getDiagnosticSummary(diagnosticId);
    if (statusResult.error) setError(statusResult.error);
    if (summaryResult.error) setError(summaryResult.error);
    setMode((prev) =>
      prev === "local"
        ? "local"
        : statusResult.mode === "supabase" && summaryResult.mode === "supabase"
          ? "supabase"
          : "local"
    );
    setSummary(summaryResult.data);
    setSubmitting(false);
    setStep("summary");
  }

  // --------------------------------------------------------------------
  // Rendu
  // --------------------------------------------------------------------

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/diagnostics"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-[#00527a]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour aux diagnostics
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold text-[#00527a]">
              Nouveau diagnostic
            </h1>
            <p className="text-muted-foreground">
              {step === "context" && "Renseignez le contexte client puis choisissez le mode."}
              {step === "questions" && "Répondez aux questions, prenez des notes, marquez les signaux faibles."}
              {step === "synthesis-funding" &&
                "Synthèse intermédiaire — financement mobilisable et taux de consommation (estimation)."}
              {step === "synthesis-pipeline" &&
                "Synthèse intermédiaire — pipeline commercial vs benchmarks référentiel v1.0."}
              {step === "summary" && "Synthèse du diagnostic. L'analyse IA viendra dans une prochaine étape."}
            </p>
          </div>
          {mode && <ModeBadge mode={mode} />}
        </div>
        <StepBreadcrumb step={step} />
      </div>

      {/* Correctif 5 lot fiabilité : le bandeau d'erreur s'affiche AUSSI
          sur l'étape contexte. Un échec de « Commencer le diagnostic »
          (createClient / createDiagnostic) doit être visible au même
          endroit, sinon le bouton reste apparemment inactif sans qu'on
          sache pourquoi (échec silencieux). */}
      {error && <FallbackBanner error={error} />}

      {step !== "context" && participantsPersistStatus.kind === "error" && (
        <div
          role="alert"
          className="flex flex-col gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="font-medium">{participantsPersistStatus.message}</p>
          <button
            type="button"
            onClick={() => void retryPersistParticipants()}
            className="inline-flex h-8 items-center rounded-md border border-destructive/40 bg-white px-3 text-xs font-medium text-destructive hover:bg-destructive/5"
          >
            Réessayer
          </button>
        </div>
      )}

      {step !== "context" && participantsPersistStatus.kind === "success" && (
        <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          Participants prévisionnels enregistrés.
        </p>
      )}

      {step === "context" && (
        <ContextStep
          form={form}
          submitting={submitting}
          participants={participants}
          onChange={updateForm}
          onToggleProfile={toggleProfile}
          onUpdateParticipant={updateParticipant}
          onSubmit={handleStartDiagnostic}
        />
      )}

      {step === "questions" && currentQuestion && (
        <QuestionsStep
          question={currentQuestion}
          index={questionIndex}
          total={questions.length}
          progress={progress}
          draft={currentDraft}
          submitting={submitting}
          onDraftChange={(patch) => setDraft(currentQuestion.id, patch)}
          onNext={() => persistAnswer({ skipped: false })}
          onSkip={() => persistAnswer({ skipped: true })}
          stepPosition={chapterStepPosition}
          totalSteps={totalChapterSteps}
        />
      )}

      {step === "questions" && !currentQuestion && (
        <Card className="border-border/60 bg-white">
          <CardContent className="py-10 text-center text-muted-foreground">
            Aucune question disponible pour les profils sélectionnés.
          </CardContent>
        </Card>
      )}

      {step === "synthesis-funding" && (
        <SynthesisFundingStep
          drafts={drafts}
          participants={participants}
          collaboratorsCount={
            form.expectedParticipants !== ""
              ? Number(form.expectedParticipants)
              : null
          }
          submitting={submitting}
          onContinue={() => continueFromSynthesis("funding")}
          onSkip={() => continueFromSynthesis("funding")}
          opcoEpConsumedInput={opcoEpConsumedInput}
          onOpcoEpConsumedInputChange={setOpcoEpConsumedInput}
        />
      )}

      {step === "synthesis-pipeline" && (
        <SynthesisPipelineStep
          drafts={drafts}
          participants={participants}
          collaboratorsCount={
            form.expectedParticipants !== ""
              ? Number(form.expectedParticipants)
              : null
          }
          submitting={submitting}
          onContinue={() => continueFromSynthesis("pipeline")}
          onSkip={() => continueFromSynthesis("pipeline")}
        />
      )}

      {step === "summary" && (
        <SummaryStep
          form={form}
          summary={summary}
          diagnosticId={diagnosticId}
          clientId={clientId}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ModeBadge({ mode }: { mode: ServiceMode }) {
  const isSupabase = mode === "supabase";
  return (
    <Badge
      variant="outline"
      className={cn(
        "flex items-center gap-1",
        isSupabase
          ? "border-[#3ea9ff]/40 bg-[#eaf5ff] text-[#00527a]"
          : "border-amber-300 bg-amber-50 text-amber-800"
      )}
    >
      {isSupabase ? <Cloud className="h-3 w-3" /> : <HardDrive className="h-3 w-3" />}
      Source : {isSupabase ? "Supabase" : "catalogue local"}
    </Badge>
  );
}

function FallbackBanner({ error }: { error: string }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-700" />
      <div>
        <p className="font-medium">Fallback local</p>
        <p className="text-amber-800/80">{error}</p>
      </div>
    </div>
  );
}

function StepBreadcrumb({ step }: { step: Step }) {
  const items: { id: Step; label: string }[] = [
    { id: "context", label: "1. Contexte" },
    { id: "questions", label: "2. Questions" },
    { id: "summary", label: "3. Synthèse" },
  ];
  // Les 2 synthèses intermédiaires s'affichent visuellement comme la
  // phase Questions (elles sont insérées à l'intérieur du parcours).
  const displayStep: Step =
    step === "synthesis-funding" || step === "synthesis-pipeline"
      ? "questions"
      : step;
  const activeIndex = items.findIndex((i) => i.id === displayStep);
  return (
    <div className="flex items-center gap-2 text-xs">
      {items.map((item, idx) => (
        <span key={item.id} className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-3 py-1 font-medium",
              idx === activeIndex
                ? "bg-[#00527a] text-white"
                : idx < activeIndex
                  ? "bg-[#eaf5ff] text-[#00527a]"
                  : "bg-muted text-muted-foreground"
            )}
          >
            {item.label}
          </span>
          {idx < items.length - 1 && (
            <span className="text-muted-foreground/40">›</span>
          )}
        </span>
      ))}
    </div>
  );
}

interface ContextStepProps {
  form: ContextForm;
  submitting: boolean;
  participants: DiagnosticParticipantDraft[];
  onChange: <K extends keyof ContextForm>(key: K, value: ContextForm[K]) => void;
  onToggleProfile: (profile: ProfileTarget) => void;
  onUpdateParticipant: <K extends keyof DiagnosticParticipantDraft>(
    idx: number,
    key: K,
    value: DiagnosticParticipantDraft[K]
  ) => void;
  onSubmit: (event: React.FormEvent) => void;
}

function ContextStep({
  form,
  submitting,
  participants,
  onChange,
  onToggleProfile,
  onUpdateParticipant,
  onSubmit,
}: ContextStepProps) {
  const canSubmit =
    form.companyName.trim().length > 1 && form.profilesInScope.length > 0;
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card className="border-border/60 bg-white">
        <CardHeader>
          <CardTitle className="font-heading text-xl text-[#00527a]">
            Contexte client
          </CardTitle>
          <CardDescription>
            Informations issues du rendez-vous dirigeant.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FormField label="Nom de l'entreprise" htmlFor="company-name" required>
            <Input
              id="company-name"
              value={form.companyName}
              onChange={(e) => onChange("companyName", e.target.value)}
              required
            />
          </FormField>
          <FormField label="Nom du dirigeant" htmlFor="director">
            <Input
              id="director"
              value={form.director}
              onChange={(e) => onChange("director", e.target.value)}
            />
          </FormField>
          <FormField label="Email dirigeant" htmlFor="email">
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => onChange("email", e.target.value)}
            />
          </FormField>
          <FormField label="Téléphone" htmlFor="phone">
            <Input
              id="phone"
              value={form.phone}
              onChange={(e) => onChange("phone", e.target.value)}
            />
          </FormField>
          <FormField label="Nombre de participants" htmlFor="participants">
            <Input
              id="participants"
              type="number"
              min={1}
              value={form.expectedParticipants}
              onChange={(e) => onChange("expectedParticipants", e.target.value)}
            />
          </FormField>
          <div className="sm:col-span-2">
            <Label className="text-sm">Profils concernés</Label>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              {PROFILE_OPTIONS.map((opt) => {
                const checked = form.profilesInScope.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                      checked
                        ? "border-[#3ea9ff] bg-[#eaf5ff] text-[#00527a]"
                        : "border-border hover:bg-muted/30"
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => onToggleProfile(opt.value)}
                    />
                    {opt.label}
                  </label>
                );
              })}
            </div>
          </div>
          <FormField
            label="Objectif déclaré"
            htmlFor="goal"
            hint="Ce que le dirigeant attend de la formation."
            className="sm:col-span-2"
          >
            <Textarea
              id="goal"
              rows={3}
              value={form.declaredGoal}
              onChange={(e) => onChange("declaredGoal", e.target.value)}
            />
          </FormField>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-white">
        <CardHeader>
          <CardTitle className="font-heading text-xl text-[#00527a]">
            Mode de diagnostic
          </CardTitle>
          <CardDescription>
            Choisissez comment qualifier le besoin.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={form.mode}
            onValueChange={(value) => onChange("mode", value as DiagnosticMode)}
            className="grid gap-3 md:grid-cols-3"
          >
            {MODE_OPTIONS.map((opt) => {
              const selected = form.mode === opt.value;
              return (
                <label
                  key={opt.value}
                  className={cn(
                    "flex cursor-pointer flex-col gap-2 rounded-md border p-4 transition-colors",
                    selected
                      ? "border-[#3ea9ff] bg-[#eaf5ff]/60"
                      : "border-border hover:bg-muted/30"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value={opt.value} />
                    <span className="font-medium text-[#00527a]">{opt.label}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {opt.description}
                  </span>
                </label>
              );
            })}
          </RadioGroup>
        </CardContent>
      </Card>

      {participants.length > 0 && (
        <Card className="border-border/60 bg-white">
          <CardHeader>
            <CardTitle className="font-heading text-xl text-[#00527a]">
              Participants prévisionnels ({participants.length})
            </CardTitle>
            <CardDescription>
              Ces informations servent à estimer le coût réel et les
              prises en charge potentielles. Elles restent à confirmer
              selon le dossier administratif.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {participants.map((p, idx) => (
              <div
                key={`participant-${idx}`}
                className="grid gap-3 rounded-md border border-border/60 bg-muted/10 p-3 md:grid-cols-4"
              >
                <div className="space-y-1">
                  <Label
                    htmlFor={`participant-${idx}-firstName`}
                    className="text-xs text-muted-foreground"
                  >
                    Prénom (optionnel)
                  </Label>
                  <Input
                    id={`participant-${idx}-firstName`}
                    value={p.firstName}
                    onChange={(e) =>
                      onUpdateParticipant(idx, "firstName", e.target.value)
                    }
                    placeholder={`Participant ${idx + 1}`}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label
                    htmlFor={`participant-${idx}-status`}
                    className="text-xs text-muted-foreground"
                  >
                    Statut professionnel
                  </Label>
                  <select
                    id={`participant-${idx}-status`}
                    value={p.professionalStatus}
                    onChange={(e) =>
                      onUpdateParticipant(
                        idx,
                        "professionalStatus",
                        e.target.value as ParticipantStatusValue
                      )
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
                  Chantier C1 — cellule N-1 conditionnelle statut=indé.
                  Pour un salarié ou un statut vide : tiret grisé, la
                  grille 4 colonnes reste STABLE (aucun saut de layout
                  au changement de statut).
                */}
                {p.professionalStatus === "agent_commercial_independant" ? (
                  <div className="space-y-1">
                    <Label
                      htmlFor={`participant-${idx}-production`}
                      className="text-xs text-muted-foreground"
                    >
                      Production déclarée N-1 (€)
                    </Label>
                    <Input
                      id={`participant-${idx}-production`}
                      type="text"
                      inputMode="numeric"
                      value={p.previousYearProduction}
                      onChange={(e) =>
                        onUpdateParticipant(
                          idx,
                          "previousYearProduction",
                          e.target.value
                        )
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
                    htmlFor={`participant-${idx}-notes`}
                    className="text-xs text-muted-foreground"
                  >
                    Commentaire (optionnel)
                  </Label>
                  <Input
                    id={`participant-${idx}-notes`}
                    value={p.notes}
                    onChange={(e) =>
                      onUpdateParticipant(idx, "notes", e.target.value)
                    }
                    placeholder="Ex : nouveau, en équipe…"
                    className="h-9"
                  />
                </div>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">
              Le tarif Start Academy applique 1&nbsp;h&nbsp;=&nbsp;42&nbsp;€
              par participant. L&apos;estimation de prise en charge potentielle
              s&apos;applique aux agents commerciaux indépendants avec une
              production N-1 supérieure à 7&nbsp;000&nbsp;€, plafonnée à
              3&nbsp;000&nbsp;€ par participant et au coût réel.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className={cn(
            buttonVariants({ size: "lg" }),
            "bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90 h-11 px-5",
            (!canSubmit || submitting) && "opacity-60 cursor-not-allowed"
          )}
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Commencer le diagnostic
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

interface QuestionsStepProps {
  question: DiagnosticQuestion;
  index: number;
  total: number;
  progress: number;
  draft: AnswerDraft;
  submitting: boolean;
  onDraftChange: (patch: Partial<AnswerDraft>) => void;
  onNext: () => void;
  onSkip: () => void;
  /**
   * Position du chapitre courant dans le parcours guidé (1-indexed) et
   * nombre total de chapitres du parcours. Différent du numéro interne
   * `question.chapter` (les questions couvrent Ch.3 → Ch.11, mais le
   * parcours affiche « étape 1 sur 9 », « étape 2 sur 9 », …).
   */
  stepPosition: number;
  totalSteps: number;
}

const CATEGORY_LABEL: Record<string, string> = {
  tool_maturity: "Maturité outils",
  commercial_performance: "Performance commerciale",
  business_skill: "Compétence métier",
  execution: "Capacité d'exécution",
  identity: "Identité",
  team: "Équipe",
  funding: "Financement",
  prospecting: "Prospection",
  seller_meeting: "RDV vendeur",
  mandates: "Mandats",
  commercial_followup: "Suivi commercial",
  buyers: "Acheteurs",
  visits_offers: "Visites & offres",
  db_reputation: "Base clients & réputation",
  tools_ai: "Outils & IA",
  management: "Management",
};

function QuestionsStep({
  question,
  index,
  total,
  progress,
  draft,
  submitting,
  onDraftChange,
  onNext,
  onSkip,
  stepPosition,
  totalSteps,
}: QuestionsStepProps) {
  const questionId = question.id;
  const questionText = question.question;
  const category = question.category;
  const isOptional = question.required === false;
  const chapterMeta = question.chapter ? getChapterMeta(question.chapter) : null;
  const chapterLabel = chapterMeta
    ? `${chapterMeta.title} · étape ${stepPosition} sur ${totalSteps}`
    : null;
  return (
    <Card className="border-border/60 bg-white">
      <CardHeader className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="bg-[#eaf5ff] text-[#00527a]">
              {CATEGORY_LABEL[category] ?? category}
            </Badge>
            {chapterLabel && (
              <Badge
                variant="outline"
                className="border-border/60 text-muted-foreground"
              >
                {chapterLabel}
                {question.subsection ? ` · ${question.subsection}` : ""}
              </Badge>
            )}
            {isOptional && (
              <Badge
                variant="outline"
                className="border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground"
              >
                Facultatif
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            Question {index + 1} / {total}
          </span>
        </div>
        <Progress value={progress} className="h-2" />
        <CardTitle
          className="font-heading text-2xl text-[#00527a]"
          key={questionId}
        >
          {questionText}
        </CardTitle>
        {question.hint && (
          <p className="text-xs text-muted-foreground">{question.hint}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        <QuestionInput
          question={question}
          value={draft.answer}
          onChange={(next) => onDraftChange({ answer: next })}
        />
        <FormField
          label="Note interne"
          htmlFor="note"
          hint="Visible uniquement par le commercial."
        >
          <Textarea
            id="note"
            rows={2}
            value={draft.note}
            onChange={(e) => onDraftChange({ note: e.target.value })}
            placeholder="Observations, signaux à creuser…"
          />
        </FormField>

        <button
          type="button"
          onClick={() => onDraftChange({ isWeakSignal: !draft.isWeakSignal })}
          className={cn(
            buttonVariants({ variant: "outline", size: "sm" }),
            "h-9 px-3 transition-colors",
            draft.isWeakSignal
              ? "border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100"
              : "border-border text-muted-foreground hover:bg-muted/40"
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          {draft.isWeakSignal ? "Signal faible marqué" : "Marquer signal faible"}
        </button>

        <div className="flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={onSkip}
            disabled={submitting}
            className={cn(
              buttonVariants({ variant: "ghost", size: "default" }),
              "h-10 px-4 text-muted-foreground hover:bg-muted/40",
              submitting && "opacity-60 cursor-not-allowed"
            )}
          >
            <SkipForward className="h-4 w-4" />
            Passer cette question
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={submitting}
            className={cn(
              buttonVariants({ size: "default" }),
              "h-10 px-5 bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90",
              submitting && "opacity-60 cursor-not-allowed"
            )}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {index + 1 === total ? "Terminer" : "Question suivante"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

// --------------------------------------------------------------------
// QuestionInput — renderer polymorphe par `type` de question (v1.0).
// Fallback = Textarea (comme MVP1). Le contrat côté état reste : la
// réponse est TOUJOURS stockée en `string` dans `draft.answer` (le
// service diagnostic transporte des strings). Pour les types
// numériques / booléens / multichoice, on sérialise en string au
// changement (join "," pour multichoice, "oui"/"non"/"ne_sait_pas"
// pour yesno, valeur brute pour date/url/int/money/percent).
// --------------------------------------------------------------------
interface QuestionInputProps {
  question: DiagnosticQuestion;
  value: string;
  onChange: (next: string) => void;
}

function QuestionInput({ question, value, onChange }: QuestionInputProps) {
  const type = question.type ?? "text";

  // Libellé humain d'une valeur technique (choice / multichoice). Fallback
  // silencieux sur la valeur brute quand aucun mapping n'est fourni.
  const optionLabel = (raw: string) =>
    question.optionLabels?.[raw] ?? raw;

  if (type === "choice") {
    const choices = question.choices ?? [];
    return (
      <FormField label="Réponse" htmlFor={`ans-${question.id}`}>
        <RadioGroup
          value={value}
          onValueChange={onChange}
          className="grid gap-2"
        >
          {choices.map((c) => (
            <label
              key={c}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md border border-border/60 p-2 text-sm",
                value === c && "border-[#3ea9ff] bg-[#eaf5ff]/60"
              )}
            >
              <RadioGroupItem value={c} />
              <span>{optionLabel(c)}</span>
            </label>
          ))}
        </RadioGroup>
      </FormField>
    );
  }

  if (type === "yesno") {
    // answerLabels remplace « Oui / Non » à l'écran quand présent
    // (« Ne sait pas » toujours inchangé — cf. spec produit).
    const yesLabel = question.answerLabels?.yes ?? "Oui";
    const noLabel = question.answerLabels?.no ?? "Non";
    const options: Array<{ value: string; label: string }> = [
      { value: "oui", label: yesLabel },
      { value: "non", label: noLabel },
      { value: "ne_sait_pas", label: "Ne sait pas" },
    ];
    return (
      <FormField label="Réponse" htmlFor={`ans-${question.id}`}>
        <RadioGroup
          value={value}
          onValueChange={onChange}
          className="flex flex-wrap gap-2"
        >
          {options.map((opt) => (
            <label
              key={opt.value}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm",
                value === opt.value && "border-[#3ea9ff] bg-[#eaf5ff]/60"
              )}
            >
              <RadioGroupItem value={opt.value} />
              <span>{opt.label}</span>
            </label>
          ))}
        </RadioGroup>
      </FormField>
    );
  }

  if (type === "multichoice") {
    const choices = question.choices ?? [];
    const selected = new Set(
      value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    );
    const toggle = (c: string) => {
      const next = new Set(selected);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      onChange(Array.from(next).join(", "));
    };
    return (
      <FormField label="Réponse — plusieurs choix possibles" htmlFor={`ans-${question.id}`}>
        <div className="grid gap-2">
          {choices.map((c) => (
            <label
              key={c}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-md border border-border/60 p-2 text-sm",
                selected.has(c) && "border-[#3ea9ff] bg-[#eaf5ff]/60"
              )}
            >
              <Checkbox
                checked={selected.has(c)}
                onCheckedChange={() => toggle(c)}
              />
              <span>{optionLabel(c)}</span>
            </label>
          ))}
        </div>
      </FormField>
    );
  }

  if (type === "int" || type === "money" || type === "percent") {
    const unit = type === "money" ? "€" : type === "percent" ? "%" : null;
    return (
      <FormField label="Réponse" htmlFor={`ans-${question.id}`}>
        <div className="flex items-center gap-2">
          <Input
            id={`ans-${question.id}`}
            type="number"
            inputMode="numeric"
            min={0}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={type === "money" ? "Ex : 12000" : type === "percent" ? "Ex : 25" : "Ex : 42"}
            className="h-10"
          />
          {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
        </div>
      </FormField>
    );
  }

  if (type === "date") {
    return (
      <FormField label="Réponse" htmlFor={`ans-${question.id}`}>
        <Input
          id={`ans-${question.id}`}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-10"
        />
      </FormField>
    );
  }

  if (type === "url") {
    return (
      <FormField label="Réponse" htmlFor={`ans-${question.id}`}>
        <Input
          id={`ans-${question.id}`}
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="https://exemple.fr"
          className="h-10"
        />
      </FormField>
    );
  }

  // Défaut : text (fallback MVP1)
  return (
    <FormField label="Réponse" htmlFor={`ans-${question.id}`}>
      <Textarea
        id={`ans-${question.id}`}
        rows={4}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Saisir ce que dit le client…"
      />
    </FormField>
  );
}

// --------------------------------------------------------------------
// Synthèses intermédiaires — calcul CLIENT via `computeRatiosAndAlerts`
// (module pur importable côté client). Les valeurs affichées sont
// dérivées uniquement des réponses accumulées + participants +
// effectifs prévisionnels. Non bloquant : les deux boutons finalisent
// la synthèse (`Continuer` = intention explicite, `Passer` = même
// effet, libellé différent pour respecter le principe « saisie
// partielle autorisée »).
// --------------------------------------------------------------------
interface SynthesisStepProps {
  drafts: Record<string, AnswerDraft>;
  participants: DiagnosticParticipantDraft[];
  collaboratorsCount: number | null;
  submitting: boolean;
  onContinue: () => void;
  onSkip: () => void;
  // Chantier A funding-opco-ep §9.1 — champ dirigeant OPCO EP entreprise
  // (uniquement branché sur la synthèse funding ch.2, ignoré ailleurs).
  opcoEpConsumedInput?: string;
  onOpcoEpConsumedInputChange?: (value: string) => void;
}

function draftsToAnswers(drafts: Record<string, AnswerDraft>) {
  return Object.entries(drafts).map(([questionId, d]) => ({
    questionId,
    answer: d.answer ?? null,
    isSkipped: false,
  }));
}

function draftsToRatiosDiagnostic(drafts: Record<string, AnswerDraft>) {
  // Mappe les questions v1.0 pertinentes au moteur ratios. Toute
  // valeur absente reste `null` — le moteur gère les manquants et
  // émet des alertes `missing_required_data` en conséquence.
  const num = (id: string): number | null => {
    const raw = drafts[id]?.answer?.trim();
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };
  return {
    ventesNMoins1: num("ventes-n-moins-1"),
    caGlobalNMoins1: num("ca-global-n-moins-1"),
    nbSalaries: num("effectifs-nb-salaries"),
    nbAgentsIndep: num("effectifs-nb-agents-indep"),
    activiteRepartition: null,
  };
}

function draftsToRatiosParticipants(
  participants: DiagnosticParticipantDraft[]
) {
  return participants.map((p) => ({
    professionalStatus:
      p.professionalStatus === ""
        ? null
        : (p.professionalStatus as
            | "salarie"
            | "agent_commercial_independant"
            | "autre"),
    previousYearProduction: p.previousYearProduction
      ? Number(p.previousYearProduction) || null
      : null,
    eligibleOpco: null,
    formations24mAmount: null,
  }));
}

function SynthesisPanel({
  title,
  eyebrow,
  submitting,
  onContinue,
  onSkip,
  children,
}: {
  title: string;
  eyebrow: string;
  submitting: boolean;
  onContinue: () => void;
  onSkip: () => void;
  children: React.ReactNode;
}) {
  return (
    <Card className="border-border/60 bg-white">
      <CardHeader className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
            {eyebrow}
          </p>
          <Badge
            variant="outline"
            className="border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground"
          >
            Non bloquant
          </Badge>
        </div>
        <CardTitle className="font-heading text-2xl text-[#00527a]">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {children}
        <div className="flex flex-col gap-3 border-t border-border/60 pt-5 sm:flex-row sm:justify-between">
          <button
            type="button"
            onClick={onSkip}
            disabled={submitting}
            className={cn(
              buttonVariants({ variant: "ghost", size: "default" }),
              "h-10 px-4 text-muted-foreground hover:bg-muted/40",
              submitting && "opacity-60 cursor-not-allowed"
            )}
          >
            <SkipForward className="h-4 w-4" />
            Passer
          </button>
          <button
            type="button"
            onClick={onContinue}
            disabled={submitting}
            className={cn(
              buttonVariants({ size: "default" }),
              "h-10 px-5 bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90",
              submitting && "opacity-60 cursor-not-allowed"
            )}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Continuer
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function AlertLine({ alert }: { alert: DiagnosticAlert }) {
  const tone =
    alert.severity === "warning"
      ? "border-amber-300 bg-amber-50 text-amber-900"
      : alert.severity === "error"
        ? "border-red-300 bg-red-50 text-red-900"
        : "border-sky-200 bg-sky-50 text-sky-900";
  return (
    <li className={cn("rounded-md border p-3 text-sm", tone)}>
      <div className="font-medium">{alert.label}</div>
      {(alert.observed !== null || alert.threshold !== null) && (
        <div className="mt-1 text-xs text-muted-foreground">
          {alert.observed !== null && <>Observé : {alert.observed}</>}
          {alert.observed !== null && alert.threshold !== null && <> · </>}
          {alert.threshold !== null && <>Seuil : {alert.threshold}</>}
        </div>
      )}
    </li>
  );
}

function SynthesisFundingStep({
  drafts,
  participants,
  collaboratorsCount,
  submitting,
  onContinue,
  onSkip,
  opcoEpConsumedInput,
  onOpcoEpConsumedInputChange,
}: SynthesisStepProps) {
  const computed = useMemo(() => {
    return computeRatiosAndAlerts({
      client: { collaboratorsCount },
      diagnostic: draftsToRatiosDiagnostic(drafts),
      answers: draftsToAnswers(drafts),
      participants: draftsToRatiosParticipants(participants),
    });
  }, [drafts, participants, collaboratorsCount]);

  // Chapitre courant (financement) : on ne montre que les alertes qui
  // s'y rapportent, plus les manques required de Ch.2.
  const fundingAlerts = computed.alerts.alerts.filter(
    (a) => a.chapter === 2 || a.code.startsWith("consumption")
  );

  // Taux de consommation — cf. correction (6) : toujours « environ X % ».
  // Le montant réel consommé sur 24 mois n'est pas encore capturé dans
  // les drafts (arrivera Lot 5 via l'éditeur participants), donc on
  // passe `null` par participant : le moteur renvoie « environ 0 % » ou
  // « estimation indisponible » selon la config.
  const consumptionLabel = (() => {
    if (participants.length === 0) return null;
    const ageficeEligibleCount = participants.filter(
      (p) =>
        p.professionalStatus === "agent_commercial_independant" &&
        Number(p.previousYearProduction) > 7000
    ).length;
    const est = computeConsumptionRate({
      consumed24m: participants.map(() => null),
      ageficeEligibleCount,
      opcoEligibleCount: 0,
    });
    return est.label;
  })();

  const chapterMeta = getChapterMeta(2);

  return (
    <SynthesisPanel
      eyebrow={`Chapitre ${chapterMeta?.chapter ?? 2} · Synthèse intermédiaire`}
      title="Financement mobilisable pour cette formation"
      submitting={submitting}
      onContinue={onContinue}
      onSkip={onSkip}
    >
      {/*
        Chantier A funding-opco-ep §9.1 — question dirigeant chapitre 2,
        posée avant les métriques de la synthèse. Année dynamique (pas
        codée en dur). NULL autorisé → warning « estimation à valider »
        côté funding (cf. training-funding.ts, jamais 0 silencieux).
      */}
      {onOpcoEpConsumedInputChange && (
        <section className="rounded-md border border-border/60 bg-[#eaf5ff]/30 p-3">
          <Label
            htmlFor="synth-opcoep-consumed"
            className="text-sm font-medium text-[#00527a]"
          >
            Montant OPCO EP déjà utilisé par votre entreprise depuis
            janvier {new Date().getFullYear()} (autres formations)
          </Label>
          <Input
            id="synth-opcoep-consumed"
            type="number"
            min={0}
            inputMode="numeric"
            value={opcoEpConsumedInput ?? ""}
            onChange={(e) => onOpcoEpConsumedInputChange(e.target.value)}
            placeholder="Laisser vide si inconnu (€)"
            className="mt-2 h-9"
          />
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            Sert à calculer ce qu&apos;il reste de votre enveloppe
            formation salariés. Laissez vide si vous ne savez pas —
            nous le vérifierons.
          </p>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border border-border/60 bg-muted/10 p-3">
          <p className="text-xs text-muted-foreground">Participants prévisionnels</p>
          <p className="mt-1 text-2xl font-semibold text-[#00527a] tabular-nums">
            {participants.length}
          </p>
        </div>
        <div className="rounded-md border border-border/60 bg-muted/10 p-3">
          <p className="text-xs text-muted-foreground">Effectif total (client)</p>
          <p className="mt-1 text-2xl font-semibold text-[#00527a] tabular-nums">
            {collaboratorsCount ?? "—"}
          </p>
        </div>
        {consumptionLabel && (
          <div className="rounded-md border border-border/60 bg-muted/10 p-3 sm:col-span-2">
            <p className="text-xs text-muted-foreground">
              Taux de consommation des droits sur 24 mois
            </p>
            <p className="mt-1 text-base font-medium text-[#00527a]">
              {consumptionLabel}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Estimation — levier disponible si ≤ 30 % (référentiel v1.0)
            </p>
          </div>
        )}
      </section>

      <section>
        <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          Alertes financement
        </p>
        {fundingAlerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune alerte détectée à ce stade. Le calcul se raffinera après
            saisie des participants et des chapitres restants.
          </p>
        ) : (
          <ul className="space-y-2">
            {fundingAlerts.map((a) => (
              <AlertLine key={a.code} alert={a} />
            ))}
          </ul>
        )}
      </section>
    </SynthesisPanel>
  );
}

function SynthesisPipelineStep({
  drafts,
  participants,
  collaboratorsCount,
  submitting,
  onContinue,
  onSkip,
}: SynthesisStepProps) {
  const computed = useMemo(() => {
    return computeRatiosAndAlerts({
      client: { collaboratorsCount },
      diagnostic: draftsToRatiosDiagnostic(drafts),
      answers: draftsToAnswers(drafts),
      participants: draftsToRatiosParticipants(participants),
    });
  }, [drafts, participants, collaboratorsCount]);

  // Étapes de pipeline observables + benchmarks référentiel v1.0.
  const stages: Array<{
    key: keyof typeof computed.ratios.ratios;
    label: string;
    benchmark: number;
    unit: "percent" | "count";
  }> = [
    { key: "contactsToRdvPercent", label: "Contacts → RDV", benchmark: 20, unit: "percent" },
    { key: "rdvToMandatPercent", label: "RDV → Mandat", benchmark: 40, unit: "percent" },
    { key: "exclusivityPercent", label: "Taux d'exclusivité", benchmark: 30, unit: "percent" },
    { key: "offresToCompromisPercent", label: "Offres → Compromis", benchmark: 60, unit: "percent" },
    { key: "compromisToActePercent", label: "Compromis → Actes", benchmark: 85, unit: "percent" },
  ];

  const observed = stages.map((s) => ({
    ...s,
    value: computed.ratios.ratios[s.key] ?? null,
  }));

  const weakest = observed
    .filter((s) => typeof s.value === "number" && s.value < s.benchmark)
    .sort((a, b) => {
      const da = a.benchmark - (a.value as number);
      const db = b.benchmark - (b.value as number);
      return db - da;
    })
    .slice(0, 2);

  const chapterMeta = getChapterMeta(8);

  return (
    <SynthesisPanel
      eyebrow={`Chapitre ${chapterMeta?.chapter ?? 8} · Synthèse intermédiaire`}
      title="Pipeline commercial — étapes vs benchmarks"
      submitting={submitting}
      onContinue={onContinue}
      onSkip={onSkip}
    >
      <section>
        <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          Entonnoir observé (repère = benchmark)
        </p>
        <ul className="space-y-2">
          {observed.map((s) => {
            const isWeak = weakest.some((w) => w.key === s.key);
            const val = s.value;
            return (
              <li
                key={s.key}
                className="grid grid-cols-[160px_1fr_auto] items-center gap-3 text-sm"
              >
                <span className="text-muted-foreground">{s.label}</span>
                <div className="relative h-5 rounded-sm bg-muted/40">
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-sm",
                      isWeak ? "bg-amber-500" : "bg-emerald-600"
                    )}
                    style={{
                      width:
                        typeof val === "number"
                          ? `${Math.min(100, Math.max(0, val))}%`
                          : "0%",
                    }}
                  />
                  <div
                    className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-[#00527a]/70"
                    style={{ left: `${s.benchmark}%` }}
                    title={`Benchmark : ${s.benchmark} %`}
                  />
                </div>
                <span className="min-w-[52px] text-right font-semibold tabular-nums">
                  {typeof val === "number" ? `${val.toFixed(0)} %` : "—"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-md border border-border/60 bg-muted/10 p-3">
        <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wider text-muted-foreground">
          Les 2 étapes les plus faibles
        </p>
        {weakest.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Toutes les étapes calculées sont dans la cible ou sans donnée.
          </p>
        ) : (
          <ol className="ml-4 list-decimal space-y-1 text-sm text-[#34332F]">
            {weakest.map((s) => (
              <li key={s.key}>
                <strong>
                  {s.label} : {(s.value as number).toFixed(0)} %
                </strong>{" "}
                — {(s.benchmark - (s.value as number)).toFixed(0)} points sous
                le benchmark ({s.benchmark} %).
              </li>
            ))}
          </ol>
        )}
      </section>
    </SynthesisPanel>
  );
}

interface SummaryStepProps {
  form: ContextForm;
  summary: DiagnosticSummary | null;
  diagnosticId: string | null;
  clientId: string | null;
}

function SummaryStep({ form, summary, diagnosticId, clientId }: SummaryStepProps) {
  const stats = summary?.stats ?? { answered: 0, skipped: 0, weakSignals: 0 };
  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-white">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <CardTitle className="font-heading text-xl text-[#00527a]">
              Diagnostic terminé
            </CardTitle>
          </div>
          <CardDescription>
            Le diagnostic est passé au statut <code>to_review</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Questions répondues" value={stats.answered} />
            <StatCard label="Questions passées" value={stats.skipped} />
            <StatCard label="Signaux faibles" value={stats.weakSignals} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-white">
        <CardHeader>
          <CardTitle className="font-heading text-base text-[#00527a]">
            Contexte
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 text-sm">
          <SummaryItem label="Entreprise" value={form.companyName || "—"} />
          <SummaryItem label="Dirigeant" value={form.director || "—"} />
          <SummaryItem
            label="Profils concernés"
            value={
              form.profilesInScope
                .map(
                  (p) =>
                    PROFILE_OPTIONS.find((o) => o.value === p)?.label ?? p
                )
                .join(", ") || "—"
            }
          />
          <SummaryItem
            label="Mode"
            value={
              MODE_OPTIONS.find((m) => m.value === form.mode)?.label ?? form.mode
            }
          />
          <SummaryItem
            label="Objectif déclaré"
            value={form.declaredGoal || "—"}
            className="sm:col-span-2"
          />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/diagnostics"
          className={cn(
            buttonVariants({ variant: "outline", size: "default" }),
            "h-10 px-4 border-[#00527a]/20 text-[#00527a] hover:bg-[#eaf5ff]"
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux diagnostics
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {diagnosticId && isAuditAvailable(stats.answered) && (
            <Link
              href={`/diagnostics/${diagnosticId}/audit`}
              className={cn(
                buttonVariants({ variant: "outline", size: "default" }),
                "h-10 px-4 border-[#00527a]/20 text-[#00527a] hover:bg-[#eaf5ff]"
              )}
            >
              <FileText className="h-4 w-4" />
              Voir l&apos;audit
            </Link>
          )}
          {diagnosticId ? (
            <Link
              href={`/diagnostics/${diagnosticId}/recommendation`}
              className={cn(
                buttonVariants({ size: "default" }),
                "h-10 px-5 bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90"
              )}
            >
              Voir la recommandation
              <ArrowRight className="h-4 w-4" />
            </Link>
          ) : (
            <button
              type="button"
              disabled
              className={cn(
                buttonVariants({ size: "default" }),
                "h-10 px-5 opacity-60 cursor-not-allowed"
              )}
            >
              Voir la recommandation
            </button>
          )}
        </div>
      </div>

      {diagnosticId && (
        <p className="text-xs text-muted-foreground">
          diagnostic id : <code>{diagnosticId}</code>
          {clientId && (
            <>
              {" "}· client id : <code>{clientId}</code>
            </>
          )}
        </p>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="font-heading text-3xl font-bold text-[#00527a]">{value}</p>
    </div>
  );
}

function SummaryItem({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="text-foreground">{value}</p>
    </div>
  );
}

interface FormFieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}

function FormField({ label, htmlFor, required, hint, className, children }: FormFieldProps) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={htmlFor} className="text-sm">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
