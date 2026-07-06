"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarPlus,
  CheckCircle2,
  RefreshCw,
  XCircle,
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

interface ApiOption {
  id: string;
  session_id: string;
  title: string | null;
  start_at: string;
  end_at: string;
  location: string | null;
  format: "presentiel" | "visio" | "hybride" | null;
  status: "proposed" | "selected" | "rejected" | "cancelled";
  selected_by_email: string | null;
  selected_at: string | null;
}

interface Props {
  sessionId: string;
}

const STATUS_LABEL: Record<ApiOption["status"], string> = {
  proposed: "Proposé",
  selected: "Choisi par le dirigeant",
  rejected: "Refusé",
  cancelled: "Annulé",
};

const STATUS_BADGE_CLASS: Record<ApiOption["status"], string> = {
  proposed:
    "border-[#00527a]/20 bg-[#eaf5ff] text-[#00527a]",
  selected: "border-emerald-300 bg-emerald-50 text-emerald-700",
  rejected: "border-amber-300 bg-amber-50 text-amber-800",
  cancelled: "border-muted-foreground/30 bg-muted/30 text-muted-foreground",
};

function formatDateRange(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);
    const dateOpts: Intl.DateTimeFormatOptions = {
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
    };
    const timeOpts: Intl.DateTimeFormatOptions = {
      hour: "2-digit",
      minute: "2-digit",
    };
    const dateStr = s.toLocaleDateString("fr-FR", dateOpts);
    const startTime = s.toLocaleTimeString("fr-FR", timeOpts);
    const endTime = e.toLocaleTimeString("fr-FR", timeOpts);
    return `${dateStr} · ${startTime} – ${endTime}`;
  } catch {
    return `${start} → ${end}`;
  }
}

export function SessionDateOptions({ sessionId }: Props) {
  const [options, setOptions] = useState<ApiOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/sessions/${encodeURIComponent(sessionId)}/date-options`,
        { cache: "no-store" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        dateOptions?: ApiOption[];
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? "Chargement impossible.");
        setOptions([]);
        return;
      }
      setOptions(json.dateOptions ?? []);
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className="border-border/60 bg-white">
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <CalendarPlus className="h-5 w-5 text-[#3ea9ff]" />
              <CardTitle className="font-heading text-xl text-[#00527a]">
                Créneaux proposés
              </CardTitle>
            </div>
            <CardDescription>
              Proposez plusieurs dates au dirigeant. Il choisit depuis son
              espace public sécurisé. Pas d&apos;intégration Google
              Calendar pour le MVP.
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
      <CardContent className="space-y-5">
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {error}
          </p>
        ) : null}

        <CreateDateOptionForm
          sessionId={sessionId}
          onCreated={(opt) => setOptions((prev) => [...prev, opt])}
        />

        {options.length === 0 ? (
          <p className="rounded-md border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
            Aucun créneau proposé pour le moment.
          </p>
        ) : (
          <ul className="space-y-2">
            {options.map((opt) => (
              <DateOptionRow
                key={opt.id}
                option={opt}
                sessionId={sessionId}
                onCancelled={(updated) =>
                  setOptions((prev) =>
                    prev.map((o) => (o.id === updated.id ? updated : o))
                  )
                }
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function CreateDateOptionForm({
  sessionId,
  onCreated,
}: {
  sessionId: string;
  onCreated: (opt: ApiOption) => void;
}) {
  const [title, setTitle] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");
  const [location, setLocation] = useState("");
  const [format, setFormat] = useState<"" | "presentiel" | "visio" | "hybride">(
    ""
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canSubmit = useMemo(() => {
    if (!startAt || !endAt) return false;
    const s = Date.parse(startAt);
    const e = Date.parse(endAt);
    return Number.isFinite(s) && Number.isFinite(e) && e > s && !submitting;
  }, [startAt, endAt, submitting]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const startIso = new Date(startAt).toISOString();
      const endIso = new Date(endAt).toISOString();
      const res = await fetch(
        `/api/sessions/${encodeURIComponent(sessionId)}/date-options`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim() || null,
            startAt: startIso,
            endAt: endIso,
            location: location.trim() || null,
            format: format || null,
          }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        dateOption?: ApiOption;
        error?: string;
      };
      if (!res.ok || !json.dateOption) {
        setSubmitError(json.error ?? "Création impossible.");
        return;
      }
      onCreated(json.dateOption);
      setTitle("");
      setStartAt("");
      setEndAt("");
      setLocation("");
      setFormat("");
    } catch {
      setSubmitError("Erreur réseau.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-3 rounded-md border border-border/60 bg-muted/10 p-3"
    >
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="opt-title" className="text-xs text-muted-foreground">
            Intitulé (optionnel)
          </Label>
          <Input
            id="opt-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Journée 1 / Session matin / etc."
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label
            htmlFor="opt-location"
            className="text-xs text-muted-foreground"
          >
            Lieu (optionnel)
          </Label>
          <Input
            id="opt-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Agence Horizon Immo, 12 rue…"
            className="h-9"
          />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label
            htmlFor="opt-start"
            className="text-xs text-muted-foreground"
          >
            Début
          </Label>
          <Input
            id="opt-start"
            type="datetime-local"
            value={startAt}
            onChange={(e) => setStartAt(e.target.value)}
            required
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="opt-end" className="text-xs text-muted-foreground">
            Fin
          </Label>
          <Input
            id="opt-end"
            type="datetime-local"
            value={endAt}
            onChange={(e) => setEndAt(e.target.value)}
            required
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label
            htmlFor="opt-format"
            className="text-xs text-muted-foreground"
          >
            Format
          </Label>
          <select
            id="opt-format"
            value={format}
            onChange={(e) =>
              setFormat(e.target.value as typeof format)
            }
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <option value="">Non précisé</option>
            <option value="presentiel">Présentiel</option>
            <option value="visio">Visio</option>
            <option value="hybride">Hybride</option>
          </select>
        </div>
      </div>
      {submitError ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {submitError}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          disabled={!canSubmit}
          size="sm"
          className="bg-[#00527a] text-white hover:bg-[#00527a]/90"
        >
          <CalendarPlus className="h-3.5 w-3.5" />
          {submitting ? "Création…" : "Ajouter un créneau"}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          Aucun email n&apos;est envoyé automatiquement. Aucun Google
          Calendar n&apos;est branché.
        </span>
      </div>
    </form>
  );
}

function DateOptionRow({
  option,
  sessionId,
  onCancelled,
}: {
  option: ApiOption;
  sessionId: string;
  onCancelled: (updated: ApiOption) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCancel() {
    if (option.status === "cancelled" || option.status === "selected") return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/sessions/${encodeURIComponent(sessionId)}/date-options/${encodeURIComponent(
          option.id
        )}`,
        { method: "DELETE" }
      );
      const json = (await res.json().catch(() => ({}))) as {
        dateOption?: ApiOption;
        error?: string;
      };
      if (!res.ok || !json.dateOption) {
        setError(json.error ?? "Annulation refusée.");
        return;
      }
      onCancelled(json.dateOption);
    } catch {
      setError("Erreur réseau.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-md border border-border/60 bg-muted/10 p-3 text-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <p className="font-medium text-foreground">
              {option.title ?? "Créneau"}
            </p>
            <Badge
              variant="outline"
              className={`text-[10px] ${STATUS_BADGE_CLASS[option.status]}`}
            >
              {option.status === "selected" ? (
                <CheckCircle2 className="mr-1 h-3 w-3" />
              ) : null}
              {STATUS_LABEL[option.status]}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatDateRange(option.start_at, option.end_at)}
            {option.format ? ` · ${option.format}` : ""}
            {option.location ? ` · ${option.location}` : ""}
          </p>
          {option.selected_by_email ? (
            <p className="text-[11px] text-emerald-700">
              Choisi par {option.selected_by_email}
              {option.selected_at
                ? ` le ${new Date(option.selected_at).toLocaleDateString(
                    "fr-FR"
                  )}`
                : ""}
            </p>
          ) : null}
        </div>
        {option.status === "proposed" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={busy}
            className="h-8 px-3 text-xs"
          >
            <XCircle className="h-3.5 w-3.5" />
            Annuler
          </Button>
        ) : null}
      </div>
      {error ? (
        <p
          role="alert"
          className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}
    </li>
  );
}
