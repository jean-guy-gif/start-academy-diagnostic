"use client";

import { useState } from "react";
import { CalendarCheck2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface PublicDateOption {
  id: string;
  title: string | null;
  startAt: string;
  endAt: string;
  location: string | null;
  format: "presentiel" | "visio" | "hybride" | null;
  status: "proposed" | "selected" | "rejected" | "cancelled";
  selectedAt: string | null;
}

interface Props {
  token: string;
  initialOptions: PublicDateOption[];
  recipientEmail: string | null;
}

const FORMAT_LABEL: Record<NonNullable<PublicDateOption["format"]>, string> = {
  presentiel: "Présentiel",
  visio: "Visio",
  hybride: "Hybride",
};

function formatDateRange(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);
    const dateOpts: Intl.DateTimeFormatOptions = {
      weekday: "long",
      day: "2-digit",
      month: "long",
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

export function DateChoiceList({ token, initialOptions, recipientEmail }: Props) {
  const [options, setOptions] = useState<PublicDateOption[]>(initialOptions);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectable = options.filter(
    (o) => o.status === "proposed" || o.status === "selected"
  );
  const selected = options.find((o) => o.status === "selected") ?? null;

  if (selectable.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
        Votre interlocuteur Start Academy vous proposera prochainement
        plusieurs dates.
      </p>
    );
  }

  async function onChoose(optionId: string) {
    setBusyId(optionId);
    setError(null);
    try {
      const res = await fetch("/api/public/select-date-option", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          optionId,
          selectedByEmail: recipientEmail ?? null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        dateOption?: { id: string; status: PublicDateOption["status"]; selected_at?: string | null };
      };
      if (!res.ok || !json.ok || !json.dateOption) {
        setError(json.error ?? "Sélection refusée.");
        return;
      }
      const updatedId = json.dateOption.id;
      setOptions((prev) =>
        prev.map((o) => {
          if (o.id === updatedId) {
            return {
              ...o,
              status: "selected",
              selectedAt:
                json.dateOption?.selected_at ?? new Date().toISOString(),
            };
          }
          // Les autres `selected` repassent en `proposed` côté serveur ;
          // on reflète le même état localement.
          if (o.status === "selected") {
            return { ...o, status: "proposed", selectedAt: null };
          }
          return o;
        })
      );
    } catch {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-3">
      {selected ? (
        <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <p className="font-medium">
            <CheckCircle2 className="mr-1 inline h-4 w-4" />
            Vous avez choisi : {selected.title ?? "ce créneau"}.
          </p>
          <p className="text-xs">
            {formatDateRange(selected.startAt, selected.endAt)}
            {selected.location ? ` · ${selected.location}` : ""}
          </p>
          <p className="mt-1 text-[11px]">
            Vous pouvez toujours modifier votre choix tant que la formation
            n&apos;est pas confirmée. Votre interlocuteur Start Academy
            sera notifié.
          </p>
        </div>
      ) : null}

      <ul className="space-y-2">
        {selectable.map((opt) => {
          const isSelected = opt.status === "selected";
          const isBusy = busyId === opt.id;
          return (
            <li
              key={opt.id}
              className={
                isSelected
                  ? "rounded-md border border-emerald-300 bg-emerald-50 p-3"
                  : "rounded-md border border-border/60 bg-white p-3"
              }
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p className="font-heading text-sm font-semibold text-[#00527a]">
                      {opt.title ?? "Créneau proposé"}
                    </p>
                    {opt.format ? (
                      <Badge
                        variant="outline"
                        className="border-[#00527a]/20 bg-[#eaf5ff] text-[10px] text-[#00527a]"
                      >
                        {FORMAT_LABEL[opt.format]}
                      </Badge>
                    ) : null}
                    {isSelected ? (
                      <Badge className="bg-emerald-500 text-[10px] text-white hover:bg-emerald-500">
                        Choisi
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-foreground/80">
                    {formatDateRange(opt.startAt, opt.endAt)}
                  </p>
                  {opt.location ? (
                    <p className="text-xs text-muted-foreground">
                      {opt.location}
                    </p>
                  ) : null}
                </div>
                {!isSelected ? (
                  <Button
                    type="button"
                    onClick={() => onChoose(opt.id)}
                    disabled={isBusy}
                    size="sm"
                    className="bg-[#00527a] text-white hover:bg-[#00527a]/90"
                  >
                    <CalendarCheck2 className="h-3.5 w-3.5" />
                    {isBusy ? "Sélection…" : "Choisir ce créneau"}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {error ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}

      <p className="text-[10px] text-muted-foreground">
        Aucune date n&apos;est confirmée tant que Start Academy n&apos;a
        pas validé le créneau choisi avec vous.
      </p>
    </div>
  );
}
