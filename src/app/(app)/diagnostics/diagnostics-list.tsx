"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  ClipboardList,
  Cloud,
  HardDrive,
  Loader2,
  PlusCircle,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  listDiagnostics,
  type DiagnosticListItem,
  type DiagnosticStatus,
  type ServiceMode,
} from "@/lib/diagnostics/diagnostic-service";

const STATUS_LABEL: Record<DiagnosticStatus, string> = {
  draft: "Brouillon",
  in_progress: "En cours",
  transcript_uploaded: "Transcription déposée",
  ai_analyzed: "Analyse IA terminée",
  to_review: "À relire",
  validated: "Validé",
};

const STATUS_TONE: Record<DiagnosticStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  in_progress: "bg-[#eaf5ff] text-[#00527a]",
  transcript_uploaded: "bg-[#eaf5ff] text-[#00527a]",
  ai_analyzed: "bg-emerald-50 text-emerald-700",
  to_review: "bg-amber-50 text-amber-800",
  validated: "bg-emerald-100 text-emerald-800",
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

export function DiagnosticsList() {
  const [items, setItems] = useState<DiagnosticListItem[]>([]);
  const [mode, setMode] = useState<ServiceMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listDiagnostics().then((result) => {
      if (cancelled) return;
      setItems(result.data ?? []);
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
            Diagnostics
          </h1>
          <p className="text-muted-foreground">
            Tous les rendez-vous qualifiés et propositions générées.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
          <Link
            href="/diagnostics/new"
            className={cn(
              buttonVariants({ size: "default" }),
              "bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90 h-10 px-4"
            )}
          >
            <PlusCircle className="h-4 w-4" />
            Nouveau diagnostic
          </Link>
        </div>
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
            Liste des diagnostics
          </CardTitle>
          <CardDescription>
            Filtrage par statut, commercial, client, mode (questions guidées /
            transcription).
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
                    <TableHead>Profils</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead>Progression</TableHead>
                    <TableHead>Créé le</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.diagnostic.id} className="align-top">
                      <TableCell className="font-medium text-foreground">
                        {item.client?.companyName ?? "—"}
                        {item.client?.director && (
                          <p className="text-xs text-muted-foreground">
                            {item.client.director}
                          </p>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.diagnostic.profilesInScope.length > 0
                          ? item.diagnostic.profilesInScope.join(", ")
                          : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.diagnostic.mode}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                            STATUS_TONE[item.diagnostic.status]
                          )}
                        >
                          {STATUS_LABEL[item.diagnostic.status]}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.answerCount} réponse
                        {item.answerCount > 1 ? "s" : ""}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatDate(item.diagnostic.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/diagnostics/${item.diagnostic.id}/recommendation`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-[#00527a] hover:underline"
                        >
                          Voir recommandation
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
      <ClipboardList className="h-10 w-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Aucun diagnostic enregistré.</p>
      <p className="text-xs text-muted-foreground">
        Lancez un nouveau diagnostic pour commencer.
      </p>
      <Link
        href="/diagnostics/new"
        className={cn(
          buttonVariants({ size: "sm" }),
          "mt-2 bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90 h-9 px-4"
        )}
      >
        <PlusCircle className="h-4 w-4" />
        Nouveau diagnostic
      </Link>
    </div>
  );
}
