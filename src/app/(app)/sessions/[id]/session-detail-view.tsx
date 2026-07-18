"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Brain,
  CalendarCheck2,
  ClipboardList,
  Cloud,
  FileText,
  HardDrive,
  Link as LinkIcon,
  Loader2,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

import {
  getTrainingSessionById,
  listParticipantsBySession,
  type ParticipantRecord,
} from "@/lib/sessions/session-service";
import type { SessionStatus, TrainingSessionViewModel } from "@/types";
import { AccessInvitations } from "./access-invitations";
import { SessionDateOptions } from "./session-date-options";
import { SessionDocuments } from "./session-documents";
import { SessionActivityJournal } from "./session-activity-journal";
import { PostTrainingReviewBlock } from "./post-training-review";
import { SessionStatusActions } from "./session-status-actions";
import { formatPriceEuros } from "@/lib/pricing/training-pricing";

const STATUS_LABEL: Record<SessionStatus, string> = {
  created: "Créée",
  awaiting_client_validation: "En attente validation client",
  dates_to_position: "Dates à positionner",
  dates_validated: "Dates validées",
  collection_open: "Collecte ouverte",
  data_collected: "Données collectées",
  support_generating: "Support en génération",
  support_ready: "Support prêt",
  delivered: "Formation réalisée",
  report_sent: "Bilan envoyé",
};

const STATUS_TONE: Record<SessionStatus, string> = {
  created: "bg-[#eaf5ff] text-[#00527a]",
  awaiting_client_validation: "bg-amber-50 text-amber-800",
  dates_to_position: "bg-amber-50 text-amber-800",
  dates_validated: "bg-emerald-50 text-emerald-700",
  collection_open: "bg-emerald-50 text-emerald-700",
  data_collected: "bg-emerald-100 text-emerald-800",
  support_generating: "bg-[#eaf5ff] text-[#00527a]",
  support_ready: "bg-emerald-100 text-emerald-800",
  delivered: "bg-emerald-100 text-emerald-800",
  report_sent: "bg-muted text-muted-foreground",
};

interface Props {
  sessionId: string;
}

export function SessionDetailView({ sessionId }: Props) {
  const [session, setSession] = useState<TrainingSessionViewModel | null>(null);
  const [participants, setParticipants] = useState<ParticipantRecord[]>([]);
  const [participantsMode, setParticipantsMode] = useState<"supabase" | "local" | null>(null);
  const [participantsError, setParticipantsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getTrainingSessionById(sessionId),
      listParticipantsBySession(sessionId),
    ]).then(([sessionResult, participantsResult]) => {
      if (cancelled) return;
      setSession(sessionResult.data);
      setError(sessionResult.error);
      setParticipants(participantsResult.data);
      setParticipantsMode(participantsResult.mode);
      setParticipantsError(participantsResult.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (loading) {
    return (
      <div className="space-y-8">
        <Card className="border-border/60 bg-white">
          <CardContent className="flex items-center gap-3 py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Chargement de la session…
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="space-y-6">
        <Link
          href="/sessions"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-[#00527a]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour aux sessions
        </Link>
        <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-red-700" />
          <div>
            <p className="font-medium">Session introuvable</p>
            <p className="text-red-800/80">
              {error ??
                "Cette session n'existe pas (ou plus) dans Supabase ni en localStorage."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <Link
          href="/sessions"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-[#00527a]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour aux sessions
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold text-[#00527a]">
              {session.clientName ?? "Session formation"}
            </h1>
            <p className="text-muted-foreground">
              {session.proposalTitle ?? "Programme à finaliser"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-medium",
                STATUS_TONE[session.status]
              )}
            >
              {STATUS_LABEL[session.status]}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                "flex items-center gap-1 text-xs",
                session.source === "supabase"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                  : "border-amber-300 bg-amber-50 text-amber-800"
              )}
            >
              {session.source === "supabase" ? (
                <Cloud className="h-3 w-3" />
              ) : (
                <HardDrive className="h-3 w-3" />
              )}
              {session.source === "supabase" ? "Persistée Supabase" : "Stockage local"}
            </Badge>
            {session.source === "supabase" && (
              <SessionStatusActions
                sessionId={session.id}
                currentStatus={session.status}
                onStatusChanged={(newStatus) =>
                  setSession((prev) =>
                    prev ? { ...prev, status: newStatus } : prev
                  )
                }
              />
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-700" />
          <p>{error}</p>
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <Stat label="Public cible" value={session.targetAudience ?? "—"} />
        <Stat
          label="Durée totale"
          value={
            session.totalDurationHours !== null
              ? `${session.totalDurationHours} h`
              : "—"
          }
        />
        <Stat
          label="Format suggéré"
          value={session.suggestedFormat ?? "—"}
        />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Stat
          label="Participants"
          value={
            session.participantCount !== null
              ? String(session.participantCount)
              : "À confirmer"
          }
        />
        <Stat
          label="Coût / participant"
          value={
            session.costPerParticipant !== null
              ? formatPriceEuros(session.costPerParticipant)
              : "À valider"
          }
        />
        <Stat
          label="Budget estimé (tarif Start Academy, tout compris)"
          value={
            session.totalEstimatedCost !== null
              ? formatPriceEuros(session.totalEstimatedCost)
              : "À calculer"
          }
        />
      </section>

      <Card className="border-border/60 bg-white">
        <CardHeader>
          <CardTitle className="font-heading text-xl text-[#00527a]">
            Éléments liés
          </CardTitle>
          <CardDescription>
            Diagnostic, recommandation et proposition rattachés à la session.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <LinkedItem
            icon={ClipboardList}
            title="Diagnostic"
            href={
              session.diagnosticId ? `/diagnostics/new` : null
            }
            value={session.diagnosticId}
          />
          <LinkedItem
            icon={Brain}
            title="Recommandation"
            href={
              session.diagnosticId
                ? `/diagnostics/${session.diagnosticId}/recommendation`
                : null
            }
            value={session.recommendationId}
          />
          <LinkedItem
            icon={FileText}
            title="Proposition"
            href={
              session.diagnosticId
                ? `/diagnostics/${session.diagnosticId}/proposal`
                : null
            }
            value={session.proposalTitle ?? "Voir le détail"}
          />
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-white">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CalendarCheck2 className="h-5 w-5 text-[#3ea9ff]" />
            <CardTitle className="font-heading text-xl text-[#00527a]">
              Dates de formation
            </CardTitle>
          </div>
          <CardDescription>
            Les dates seront proposées via Calendar lors d&apos;une prochaine
            étape.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {session.dates.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune date proposée pour le moment.
            </p>
          ) : (
            <ul className="space-y-1 text-sm text-foreground/80">
              {session.dates.map((d, idx) => (
                <li key={`${idx}-${d}`}>· {d}</li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled
              className={cn(
                buttonVariants({ size: "sm", variant: "outline" }),
                "h-9 px-3 border-[#00527a]/20 text-[#00527a] opacity-60 cursor-not-allowed"
              )}
            >
              <CalendarCheck2 className="h-3.5 w-3.5" />
              Positionner les dates
              <span className="ml-2 rounded-full bg-[#eaf5ff] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#00527a]">
                Calendar à venir
              </span>
            </button>
          </div>
        </CardContent>
      </Card>

      <AccessInvitations
        sessionId={session.id}
        clientName={session.clientName}
        proposalTitle={session.proposalTitle}
      />

      <SessionDateOptions sessionId={session.id} />

      <SessionDocuments sessionId={session.id} />

      <Card className="border-border/60 bg-white">
        <CardHeader>
          <div className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5 text-[#3ea9ff]" />
            <CardTitle className="font-heading text-xl text-[#00527a]">
              Lien interne collecte collaborateurs (legacy)
            </CardTitle>
          </div>
          <CardDescription>
            URL interne historique — toujours utilisable en interne /
            dev. Pour partager avec un collaborateur externe, préférer
            désormais le lien public signé ci-dessus.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-sm font-mono text-foreground/80">
            {session.collectionLink}
          </div>
          <Link
            href={session.collectionLink}
            className={cn(
              buttonVariants({ size: "sm" }),
              "bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90 h-9 px-3"
            )}
          >
            <Users className="h-3.5 w-3.5" />
            Ouvrir la page de collecte
          </Link>
          {participants.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {participants.length} participant
              {participants.length > 1 ? "s ont" : " a"} déjà répondu (
              {participantsMode === "supabase"
                ? "Supabase"
                : "stockage local"}
              ).
            </p>
          )}
        </CardContent>
      </Card>

      {participants.length > 0 && (
        <Card className="border-border/60 bg-white">
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="font-heading text-base text-[#00527a]">
                Participants enregistrés ({participants.length})
              </CardTitle>
              {participantsMode && (
                <Badge
                  variant="outline"
                  className={cn(
                    "flex items-center gap-1 text-xs",
                    participantsMode === "supabase"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                      : "border-amber-300 bg-amber-50 text-amber-800"
                  )}
                >
                  {participantsMode === "supabase" ? (
                    <Cloud className="h-3 w-3" />
                  ) : (
                    <HardDrive className="h-3 w-3" />
                  )}
                  {participantsMode === "supabase"
                    ? "Supabase"
                    : "Stockage local"}
                </Badge>
              )}
            </div>
            {participantsMode === "local" && participantsError && (
              <p className="mt-1 text-xs text-amber-700">
                {participantsError}
              </p>
            )}
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {participants.map((p) => (
                <li
                  key={p.id}
                  className="rounded-md border border-border/60 bg-muted/10 px-3 py-2"
                >
                  <p className="font-medium text-foreground">
                    {p.firstName} {p.lastName}{" "}
                    <span className="text-xs text-muted-foreground">
                      · {p.role}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.email} · niveau estimé : {p.estimatedLevel || "—"}
                  </p>
                  {p.mainProblem && (
                    <p className="mt-1 text-xs text-foreground/80">
                      Problématique : {p.mainProblem}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <PostTrainingReviewBlock sessionId={session.id} />

      <SessionActivityJournal sessionId={session.id} />

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-between">
        <Link
          href="/sessions"
          className={cn(
            buttonVariants({ variant: "outline", size: "default" }),
            "h-10 px-4 border-[#00527a]/20 text-[#00527a] hover:bg-[#eaf5ff]"
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux sessions
        </Link>
        <Link
          href={`/sessions/${session.id}/support`}
          className={cn(
            buttonVariants({ size: "default" }),
            "h-10 px-5 bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90"
          )}
        >
          Générer le support de formation
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <p className="text-xs text-muted-foreground">
        session id : <code>{session.id}</code> · créée le{" "}
        {new Date(session.createdAt).toLocaleString("fr-FR")}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-4 py-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-heading text-base font-semibold text-[#00527a]">
        {value}
      </p>
    </div>
  );
}

function LinkedItem({
  icon: Icon,
  title,
  href,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  href: string | null;
  value: string | null;
}) {
  const body = (
    <div className="flex items-start gap-3">
      <Icon className="h-4 w-4 flex-none text-[#3ea9ff]" />
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          {title}
        </p>
        <p className="truncate text-sm text-foreground">{value ?? "—"}</p>
      </div>
    </div>
  );
  if (!href) {
    return (
      <div className="rounded-md border border-border/60 bg-muted/10 px-3 py-2">
        {body}
      </div>
    );
  }
  return (
    <Link
      href={href}
      className="block rounded-md border border-border/60 bg-muted/10 px-3 py-2 transition-colors hover:bg-[#eaf5ff]"
    >
      {body}
    </Link>
  );
}
