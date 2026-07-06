"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Save,
  ShieldAlert,
  ShieldCheck,
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  SUPPORT_QUALITY_CRITERIA,
  calculateSupportQualityScore,
  type SupportQualityChecklist,
  type SupportQualityRating,
  type SupportQualityReview,
  type SupportQualityStatus,
} from "@/lib/training-support/support-quality.types";

interface Props {
  sessionId: string;
  designedSupportId?: string | null;
  trainingSupportId?: string | null;
}

const STATUS_LABEL: Record<SupportQualityStatus, string> = {
  draft: "Brouillon",
  needs_revision: "À corriger",
  validated: "Validé pédagogiquement",
  rejected: "Rejeté",
};

const STATUS_TONE: Record<SupportQualityStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  needs_revision: "bg-amber-50 text-amber-800",
  validated: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
};

const RATING_LABEL: Record<SupportQualityRating, string> = {
  0: "Non conforme",
  1: "À corriger",
  2: "Acceptable",
  3: "Validé",
};

const RATING_TONE: Record<SupportQualityRating, string> = {
  0: "border-red-300 bg-red-50 text-red-700",
  1: "border-amber-300 bg-amber-50 text-amber-800",
  2: "border-[#3ea9ff]/40 bg-[#eaf5ff] text-[#00527a]",
  3: "border-emerald-300 bg-emerald-50 text-emerald-700",
};

export function SupportQualityValidation({
  sessionId,
  designedSupportId,
  trainingSupportId,
}: Props) {
  const [review, setReview] = useState<SupportQualityReview | null>(null);
  const [checklist, setChecklist] = useState<SupportQualityChecklist>({});
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/sessions/${sessionId}/support-quality`, {
      credentials: "same-origin",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          ok: boolean;
          review: SupportQualityReview | null;
        };
        if (cancelled) return;
        setReview(json.review);
        setChecklist(json.review?.checklist ?? {});
        setNotes(json.review?.notes ?? "");
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(
            err instanceof Error
              ? err.message
              : "Chargement de la validation impossible."
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const score = useMemo(
    () => calculateSupportQualityScore(checklist),
    [checklist]
  );

  const save = useCallback(
    async (nextStatus: SupportQualityStatus) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch(`/api/sessions/${sessionId}/support-quality`, {
          method: "PUT",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            designedSupportId: designedSupportId ?? null,
            trainingSupportId: trainingSupportId ?? null,
            status: nextStatus,
            checklist,
            notes: notes.trim() || null,
          }),
        });
        if (!res.ok) {
          setError(`Enregistrement refusé (HTTP ${res.status}).`);
          return;
        }
        const json = (await res.json()) as {
          ok: boolean;
          review: SupportQualityReview | null;
        };
        if (json.review) {
          setReview(json.review);
          setChecklist(json.review.checklist ?? {});
          setNotes(json.review.notes ?? "");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
      } finally {
        setSaving(false);
      }
    },
    [sessionId, designedSupportId, trainingSupportId, checklist, notes]
  );

  const setRating = useCallback(
    (criterionId: string, rating: SupportQualityRating) => {
      setChecklist((prev) => ({ ...prev, [criterionId]: rating }));
    },
    []
  );

  const status: SupportQualityStatus = review?.status ?? "draft";

  return (
    <Card className="border-[#00527a]/10">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#3ea9ff]" />
            <CardTitle className="font-heading text-[#00527a]">
              Validation pédagogique
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
          Contrôle qualité interne avant utilisation du support en
          formation. Visible uniquement par l&apos;équipe Start Academy.
          Les notes 0–3 servent à calculer un score global indicatif.
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
            <div className="grid grid-cols-1 gap-2">
              {SUPPORT_QUALITY_CRITERIA.map((criterion) => {
                const current = checklist[criterion.id];
                return (
                  <div
                    key={criterion.id}
                    className="rounded-md border border-border/60 bg-muted/10 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">
                          {criterion.label}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {criterion.description}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {[0, 1, 2, 3].map((value) => {
                          const rating = value as SupportQualityRating;
                          const active = current === rating;
                          return (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setRating(criterion.id, rating)}
                              disabled={saving}
                              className={cn(
                                "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                                active
                                  ? RATING_TONE[rating]
                                  : "border-border/60 bg-white text-muted-foreground hover:bg-muted/40"
                              )}
                            >
                              {value} · {RATING_LABEL[rating]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/10 px-3 py-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  Score global
                </p>
                <p className="font-heading text-base font-semibold text-[#00527a]">
                  {score.total} / {score.max || "—"}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({score.percent.toFixed(1)}%)
                  </span>
                </p>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {Object.keys(checklist).length} /{" "}
                {SUPPORT_QUALITY_CRITERIA.length} critères notés
              </p>
            </div>

            <div>
              <label
                htmlFor="quality-notes"
                className="mb-1 block text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                Notes internes
              </label>
              <Textarea
                id="quality-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Points à corriger, décisions, contexte de validation…"
                rows={3}
                maxLength={4000}
                disabled={saving}
              />
            </div>

            {error && (
              <p className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="h-3.5 w-3.5 flex-none" />
                {error}
              </p>
            )}

            {status === "validated" ? (
              <p className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                <CheckCircle2 className="h-3.5 w-3.5 flex-none" />
                Validé pédagogiquement. Vous pouvez maintenant passer le
                support designé en <code>validated</code> dans le bloc
                au-dessus pour autoriser sa diffusion.
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
                variant="outline"
                size="sm"
                onClick={() => void save("needs_revision")}
                disabled={saving}
                className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
              >
                <ShieldAlert className="h-4 w-4" />
                Marquer à corriger
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void save("validated")}
                disabled={saving}
                className="bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90"
              >
                <CheckCircle2 className="h-4 w-4" />
                Valider pédagogiquement
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
