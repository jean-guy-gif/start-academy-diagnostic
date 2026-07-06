"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Save,
  TrendingUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  calculatePostTrainingAverageScore,
  type PostTrainingFollowUpAction,
  type PostTrainingReview,
  type PostTrainingReviewStatus,
  type PostTrainingReviewType,
} from "@/lib/post-training/post-training.types";

interface Props {
  sessionId: string;
}

const STATUS_LABEL: Record<PostTrainingReviewStatus, string> = {
  draft: "Brouillon",
  completed: "Complété",
  archived: "Archivé",
};

const STATUS_TONE: Record<PostTrainingReviewStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  completed: "bg-emerald-50 text-emerald-700",
  archived: "bg-amber-50 text-amber-800",
};

const TYPE_LABEL: Record<PostTrainingReviewType, string> = {
  trainer: "Synthèse formateur",
  director: "Retour dirigeant",
  participant_summary: "Synthèse participants",
  internal: "Bilan interne",
};

interface FormState {
  reviewType: PostTrainingReviewType;
  satisfactionScore: string;
  perceivedValueScore: string;
  contentRelevanceScore: string;
  actionabilityScore: string;
  keySuccesses: string;
  keyBlockers: string;
  followUpActions: string;
  trainerNotes: string;
  directorFeedback: string;
  participantFeedbackSummary: string;
  nextCommercialOpportunity: string;
}

const EMPTY_FORM: FormState = {
  reviewType: "internal",
  satisfactionScore: "",
  perceivedValueScore: "",
  contentRelevanceScore: "",
  actionabilityScore: "",
  keySuccesses: "",
  keyBlockers: "",
  followUpActions: "",
  trainerNotes: "",
  directorFeedback: "",
  participantFeedbackSummary: "",
  nextCommercialOpportunity: "",
};

function reviewToForm(review: PostTrainingReview): FormState {
  return {
    reviewType: review.reviewType,
    satisfactionScore:
      review.satisfactionScore !== null ? String(review.satisfactionScore) : "",
    perceivedValueScore:
      review.perceivedValueScore !== null
        ? String(review.perceivedValueScore)
        : "",
    contentRelevanceScore:
      review.contentRelevanceScore !== null
        ? String(review.contentRelevanceScore)
        : "",
    actionabilityScore:
      review.actionabilityScore !== null
        ? String(review.actionabilityScore)
        : "",
    keySuccesses: review.keySuccesses.join("\n"),
    keyBlockers: review.keyBlockers.join("\n"),
    followUpActions: review.followUpActions.map(formatActionLine).join("\n"),
    trainerNotes: review.trainerNotes ?? "",
    directorFeedback: review.directorFeedback ?? "",
    participantFeedbackSummary: review.participantFeedbackSummary ?? "",
    nextCommercialOpportunity: review.nextCommercialOpportunity ?? "",
  };
}

function formatActionLine(action: PostTrainingFollowUpAction): string {
  const parts = [action.label];
  if (action.owner) parts.push(`@${action.owner}`);
  if (action.dueDate) parts.push(`→ ${action.dueDate}`);
  if (action.status) parts.push(`[${action.status}]`);
  return parts.join(" ");
}

function parseScore(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(10, Math.round(n)));
}

function parseLines(value: string): string[] {
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseActions(value: string): PostTrainingFollowUpAction[] {
  // Parse léger : chaque ligne devient une action avec uniquement
  // un `label`. Le owner / dueDate / status restent à enrichir via
  // une UI plus poussée (hors scope MVP).
  return parseLines(value)
    .slice(0, 50)
    .map((label) => ({ label }));
}

export function PostTrainingReviewBlock({ sessionId }: Props) {
  const [review, setReview] = useState<PostTrainingReview | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/sessions/${sessionId}/post-training-review`, {
      credentials: "same-origin",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          ok: boolean;
          review: PostTrainingReview | null;
        };
        if (cancelled) return;
        setReview(json.review);
        setForm(json.review ? reviewToForm(json.review) : EMPTY_FORM);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(
            err instanceof Error
              ? err.message
              : "Chargement du suivi impossible."
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const localAverage = useMemo(
    () =>
      calculatePostTrainingAverageScore({
        satisfactionScore: parseScore(form.satisfactionScore),
        perceivedValueScore: parseScore(form.perceivedValueScore),
        contentRelevanceScore: parseScore(form.contentRelevanceScore),
        actionabilityScore: parseScore(form.actionabilityScore),
      }),
    [form]
  );

  const save = useCallback(
    async (nextStatus: PostTrainingReviewStatus) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/sessions/${sessionId}/post-training-review`,
          {
            method: "PUT",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reviewType: form.reviewType,
              status: nextStatus,
              satisfactionScore: parseScore(form.satisfactionScore),
              perceivedValueScore: parseScore(form.perceivedValueScore),
              contentRelevanceScore: parseScore(form.contentRelevanceScore),
              actionabilityScore: parseScore(form.actionabilityScore),
              keySuccesses: parseLines(form.keySuccesses),
              keyBlockers: parseLines(form.keyBlockers),
              followUpActions: parseActions(form.followUpActions),
              trainerNotes: form.trainerNotes.trim() || null,
              directorFeedback: form.directorFeedback.trim() || null,
              participantFeedbackSummary:
                form.participantFeedbackSummary.trim() || null,
              nextCommercialOpportunity:
                form.nextCommercialOpportunity.trim() || null,
            }),
          }
        );
        if (!res.ok) {
          setError(`Enregistrement refusé (HTTP ${res.status}).`);
          return;
        }
        const json = (await res.json()) as {
          ok: boolean;
          review: PostTrainingReview | null;
        };
        if (json.review) {
          setReview(json.review);
          setForm(reviewToForm(json.review));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
      } finally {
        setSaving(false);
      }
    },
    [sessionId, form]
  );

  const updateField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const status: PostTrainingReviewStatus = review?.status ?? "draft";

  return (
    <Card className="border-[#00527a]/10">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-[#3ea9ff]" />
            <CardTitle className="font-heading text-[#00527a]">
              Suivi post-formation
            </CardTitle>
          </div>
          <Badge
            variant="secondary"
            className={cn("text-[10px] font-medium", STATUS_TONE[status])}
          >
            {STATUS_LABEL[status]}
          </Badge>
        </div>
        <CardDescription>
          Bilan interne post-formation. Visible uniquement par
          l&apos;équipe Start Academy. Les retours dirigeant /
          collaborateurs sont saisis manuellement par l&apos;équipe —
          aucun formulaire public côté MVP.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="pt-review-type" className="text-xs">
                  Type de bilan
                </Label>
                <select
                  id="pt-review-type"
                  value={form.reviewType}
                  onChange={(e) =>
                    updateField(
                      "reviewType",
                      e.target.value as PostTrainingReviewType
                    )
                  }
                  disabled={saving}
                  className="mt-1 h-10 w-full rounded-md border border-border/60 bg-background px-3 text-sm"
                >
                  {(
                    Object.keys(TYPE_LABEL) as PostTrainingReviewType[]
                  ).map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABEL[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end justify-end">
                <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-right">
                  <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                    Moyenne scores
                  </p>
                  <p className="font-heading text-base font-semibold text-[#00527a]">
                    {localAverage.averageScore !== null
                      ? `${localAverage.averageScore} / 10`
                      : "—"}
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({localAverage.scoresCount} score
                      {localAverage.scoresCount > 1 ? "s" : ""})
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <ScoreField
                id="pt-satisfaction"
                label="Satisfaction"
                value={form.satisfactionScore}
                onChange={(v) => updateField("satisfactionScore", v)}
                disabled={saving}
              />
              <ScoreField
                id="pt-perceived"
                label="Valeur perçue"
                value={form.perceivedValueScore}
                onChange={(v) => updateField("perceivedValueScore", v)}
                disabled={saving}
              />
              <ScoreField
                id="pt-relevance"
                label="Pertinence contenu"
                value={form.contentRelevanceScore}
                onChange={(v) => updateField("contentRelevanceScore", v)}
                disabled={saving}
              />
              <ScoreField
                id="pt-actionability"
                label="Actionnabilité"
                value={form.actionabilityScore}
                onChange={(v) => updateField("actionabilityScore", v)}
                disabled={saving}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ListField
                id="pt-successes"
                label="Réussites clés (1 par ligne)"
                value={form.keySuccesses}
                onChange={(v) => updateField("keySuccesses", v)}
                disabled={saving}
              />
              <ListField
                id="pt-blockers"
                label="Points de blocage (1 par ligne)"
                value={form.keyBlockers}
                onChange={(v) => updateField("keyBlockers", v)}
                disabled={saving}
              />
            </div>

            <ListField
              id="pt-actions"
              label="Actions de suivi terrain (1 par ligne)"
              value={form.followUpActions}
              onChange={(v) => updateField("followUpActions", v)}
              disabled={saving}
              rows={4}
            />

            <TextareaField
              id="pt-trainer-notes"
              label="Notes formateur"
              value={form.trainerNotes}
              onChange={(v) => updateField("trainerNotes", v)}
              disabled={saving}
              placeholder="Ce qui a marché, ce qu'il faut réajuster, idées d'amélioration support…"
            />

            <TextareaField
              id="pt-director-feedback"
              label="Retour dirigeant"
              value={form.directorFeedback}
              onChange={(v) => updateField("directorFeedback", v)}
              disabled={saving}
              placeholder="Verbatim ou synthèse du retour dirigeant (entretien, mail, débrief)."
            />

            <TextareaField
              id="pt-participant-summary"
              label="Synthèse retours participants"
              value={form.participantFeedbackSummary}
              onChange={(v) => updateField("participantFeedbackSummary", v)}
              disabled={saving}
              placeholder="Saisie manuelle interne — pas de formulaire public côté MVP."
            />

            <TextareaField
              id="pt-commercial"
              label="Opportunité commerciale suivante"
              value={form.nextCommercialOpportunity}
              onChange={(v) => updateField("nextCommercialOpportunity", v)}
              disabled={saving}
              placeholder="Ex: renouvellement, session manager, accompagnement individuel…"
              rows={2}
            />

            {error && (
              <p className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="h-3.5 w-3.5 flex-none" />
                {error}
              </p>
            )}

            {status === "completed" ? (
              <p className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                <CheckCircle2 className="h-3.5 w-3.5 flex-none" />
                Suivi post-formation complété. Vous pouvez passer la
                session en <code>report_sent</code> dans la fiche
                session quand le bilan client a été envoyé.
              </p>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void save("draft")}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Enregistrer brouillon
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void save("completed")}
                disabled={saving}
                className="bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90"
              >
                <CheckCircle2 className="h-4 w-4" />
                Marquer comme complété
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreField({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs">
        {label} (0-10)
      </Label>
      <Input
        id={id}
        type="number"
        min={0}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="mt-1 h-9"
      />
    </div>
  );
}

function ListField({
  id,
  label,
  value,
  onChange,
  disabled,
  rows = 3,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  rows?: number;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={rows}
        className="mt-1"
      />
    </div>
  );
}

function TextareaField({
  id,
  label,
  value,
  onChange,
  disabled,
  placeholder,
  rows = 3,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <div>
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        rows={rows}
        placeholder={placeholder}
        className="mt-1"
      />
    </div>
  );
}
