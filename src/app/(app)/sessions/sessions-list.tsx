"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Cloud,
  HardDrive,
  Loader2,
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
import { formatPriceEuros } from "@/lib/pricing/training-pricing";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { listTrainingSessions, type ServiceMode } from "@/lib/sessions/session-service";
import type { SessionStatus, TrainingSessionViewModel } from "@/types";

const STATUS_LABEL: Record<SessionStatus, string> = {
  created: "Créée",
  awaiting_client_validation: "En attente validation",
  dates_to_position: "Dates à positionner",
  dates_validated: "Dates validées",
  collection_open: "Collecte ouverte",
  data_collected: "Données collectées",
  support_generating: "Support en génération",
  support_ready: "Support prêt",
  delivered: "Réalisée",
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

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function SessionsList() {
  const [items, setItems] = useState<TrainingSessionViewModel[]>([]);
  const [mode, setMode] = useState<ServiceMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listTrainingSessions().then((result) => {
      if (cancelled) return;
      setItems(result.data);
      setMode(result.mode);
      setError(result.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold text-[#00527a]">
            Sessions
          </h1>
          <p className="text-muted-foreground">
            Sessions de formation créées à partir des propositions validées.
          </p>
        </div>
        {mode && (
          <Badge
            variant="outline"
            className={cn(
              "flex items-center gap-1",
              mode === "supabase"
                ? "border-[#3ea9ff]/40 bg-[#eaf5ff] text-[#00527a]"
                : "border-amber-300 bg-amber-50 text-amber-800"
            )}
          >
            {mode === "supabase" ? (
              <Cloud className="h-3 w-3" />
            ) : (
              <HardDrive className="h-3 w-3" />
            )}
            Source : {mode === "supabase" ? "Supabase" : "local"}
          </Badge>
        )}
      </div>

      {mode === "local" && error && (
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-700" />
          <div>
            <p className="font-medium">Fallback local</p>
            <p className="text-amber-800/80">{error}</p>
          </div>
        </div>
      )}

      <Card className="border-border/60 bg-white">
        <CardHeader>
          <CardTitle className="font-heading text-xl text-[#00527a]">
            Pipeline sessions
          </CardTitle>
          <CardDescription>
            Statuts attendus : créée, en attente validation, dates à
            positionner, dates validées, collecte ouverte, support en
            génération, support prêt, formation réalisée, bilan envoyé.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement…
            </div>
          ) : items.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="overflow-hidden rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>Client</TableHead>
                    <TableHead>Titre</TableHead>
                    <TableHead>Durée</TableHead>
                    <TableHead>Format</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Coût</TableHead>
                    <TableHead>Créée le</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id} className="align-top">
                      <TableCell className="font-medium text-foreground">
                        {item.clientName ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate text-muted-foreground">
                        {item.proposalTitle ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.totalDurationHours !== null
                          ? `${item.totalDurationHours} h`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.suggestedFormat ?? "—"}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            STATUS_TONE[item.status]
                          )}
                        >
                          {STATUS_LABEL[item.status]}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.totalEstimatedCost !== null
                          ? formatPriceEuros(item.totalEstimatedCost)
                          : item.costPerParticipant !== null
                            ? `${formatPriceEuros(item.costPerParticipant)} / pers.`
                            : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(item.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/sessions/${item.id}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#00527a] hover:underline"
                        >
                          Voir session
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border/80 bg-muted/30 py-16 text-center">
      <CalendarDays className="h-10 w-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Aucune session pour le moment.</p>
      <p className="text-xs text-muted-foreground">
        Les sessions apparaîtront après création depuis une proposition validée.
      </p>
    </div>
  );
}
