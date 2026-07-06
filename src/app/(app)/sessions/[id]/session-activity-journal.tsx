"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  Award,
  Brain,
  CalendarCheck,
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  FileText,
  Inbox,
  Link as LinkIcon,
  Loader2,
  MessageSquare,
  Palette,
  Send,
  UserPlus,
  Wand2,
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

import type {
  ActivityEventType,
  ActivitySeverity,
} from "@/lib/activity/activity-event-types";

interface JournalEntry {
  id: string;
  eventType: ActivityEventType | string;
  eventLabel: string;
  eventDescription: string | null;
  actorName: string | null;
  actorRole: string | null;
  severity: ActivitySeverity;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface Props {
  sessionId: string;
}

const SEVERITY_TONE: Record<ActivitySeverity, string> = {
  info: "bg-[#eaf5ff] text-[#00527a]",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  error: "bg-red-50 text-red-700",
};

const SEVERITY_LABEL: Record<ActivitySeverity, string> = {
  info: "Info",
  success: "Succès",
  warning: "À vérifier",
  error: "Erreur",
};

function iconForEvent(eventType: string) {
  switch (eventType) {
    case "diagnostic_created":
    case "diagnostic_completed":
      return ClipboardList;
    case "recommendation_generated":
      return Brain;
    case "proposal_generated":
      return FileText;
    case "session_created":
      return CalendarPlus;
    case "access_link_created":
      return LinkIcon;
    case "participant_submitted":
      return UserPlus;
    case "document_uploaded":
      return Inbox;
    case "date_option_created":
      return CalendarPlus;
    case "date_option_selected":
      return CalendarCheck;
    case "training_support_generated":
      return Wand2;
    case "designed_support_generated":
      return Palette;
    case "support_validated":
      return CheckCircle2;
    case "support_archived":
      return Award;
    case "note_added":
      return MessageSquare;
    default:
      return Activity;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SessionActivityJournal({ sessionId }: Props) {
  const [logs, setLogs] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submittingNote, setSubmittingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/activity?limit=30`, {
        credentials: "same-origin",
      });
      if (!res.ok) {
        setError(`Chargement impossible (HTTP ${res.status}).`);
        setLoading(false);
        return;
      }
      const json = (await res.json()) as { logs: JournalEntry[] };
      setLogs(Array.isArray(json.logs) ? json.logs : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const submitNote = useCallback(async () => {
    const trimmed = note.trim();
    if (trimmed.length === 0) return;
    setSubmittingNote(true);
    setNoteError(null);
    try {
      const res = await fetch("/api/activity/log", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "note_added",
          sessionId,
          eventDescription: trimmed.slice(0, 500),
        }),
      });
      if (!res.ok) {
        setNoteError(`Note refusée (HTTP ${res.status}).`);
      } else {
        setNote("");
        await reload();
      }
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setSubmittingNote(false);
    }
  }, [note, sessionId, reload]);

  return (
    <Card className="border-[#00527a]/10">
      <CardHeader>
        <CardTitle className="font-heading text-[#00527a]">
          Journal d&apos;activité
        </CardTitle>
        <CardDescription>
          Historique interne du dossier — 30 dernières actions, plus récentes en
          haut. Visible uniquement par l&apos;équipe Start Academy.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Bloc « Ajouter une note interne » */}
        <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Ajouter une note interne
          </p>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ex. Dirigeant relancé par téléphone, valide les dates lundi…"
            rows={3}
            maxLength={500}
            disabled={submittingNote}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {note.length}/500 — visible uniquement en interne.
            </p>
            <Button
              type="button"
              size="sm"
              onClick={() => void submitNote()}
              disabled={submittingNote || note.trim().length === 0}
              className="bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90"
            >
              {submittingNote ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Enregistrer la note
            </Button>
          </div>
          {noteError && (
            <p className="mt-2 flex items-center gap-2 text-xs text-amber-700">
              <AlertTriangle className="h-3 w-3" />
              {noteError}
            </p>
          )}
        </div>

        {/* Liste des événements */}
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement…
          </p>
        ) : error ? (
          <p className="flex items-center gap-2 text-sm text-amber-700">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucune action enregistrée pour cette session pour l&apos;instant.
          </p>
        ) : (
          <ol className="space-y-2">
            {logs.map((entry) => {
              const Icon = iconForEvent(entry.eventType);
              return (
                <li
                  key={entry.id}
                  className="flex gap-3 rounded-md border border-border/60 bg-muted/10 px-3 py-2"
                >
                  <div className="flex h-8 w-8 flex-none items-center justify-center rounded-md bg-[#eaf5ff] text-[#00527a]">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-foreground">
                        {entry.eventLabel}
                      </p>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "h-5 px-2 text-[10px] font-medium",
                          SEVERITY_TONE[entry.severity]
                        )}
                      >
                        {SEVERITY_LABEL[entry.severity]}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatDate(entry.createdAt)}
                      {entry.actorName ? ` · ${entry.actorName}` : ""}
                      {entry.actorRole ? ` (${entry.actorRole})` : ""}
                    </p>
                    {entry.eventDescription && (
                      <p className="mt-1 whitespace-pre-wrap text-xs text-foreground/80">
                        {entry.eventDescription}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
