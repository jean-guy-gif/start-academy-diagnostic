"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileText, RefreshCw } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatDocumentCategory } from "@/lib/documents/document-types";

interface ApiDocument {
  id: string;
  fileName: string;
  fileType: string | null;
  fileSize: number | null;
  category: string | null;
  participantName: string | null;
  participantEmail: string | null;
  createdAt: string;
  downloadUrl: string | null;
}

interface Props {
  sessionId: string;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function SessionDocuments({ sessionId }: Props) {
  const [docs, setDocs] = useState<ApiDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/sessions/${encodeURIComponent(sessionId)}/documents`,
        { cache: "no-store" }
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setError(json.error ?? "Chargement impossible.");
        setDocs([]);
        return;
      }
      const json = (await res.json()) as { documents: ApiDocument[] };
      setDocs(json.documents ?? []);
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
              <FileText className="h-5 w-5 text-[#3ea9ff]" />
              <CardTitle className="font-heading text-xl text-[#00527a]">
                Documents reçus
              </CardTitle>
            </div>
            <CardDescription>
              Pièces déposées par les collaborateurs via le lien public.
              Téléchargement par lien signé courte durée (60 s).
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
      <CardContent>
        {error ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {error}
          </p>
        ) : null}

        {!loading && docs.length === 0 && !error ? (
          <p className="rounded-md border border-dashed border-border/60 bg-muted/20 px-4 py-6 text-sm text-muted-foreground">
            Aucun document reçu pour le moment.
          </p>
        ) : null}

        {docs.length > 0 ? (
          <ul className="space-y-2">
            {docs.map((d) => (
              <li
                key={d.id}
                className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/10 p-3 text-sm md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">
                    {d.fileName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDocumentCategory(d.category)}
                    {d.participantName ? ` · ${d.participantName}` : ""}
                    {" · "}
                    {formatFileSize(d.fileSize)}
                    {" · "}
                    {new Date(d.createdAt).toLocaleDateString()}
                  </p>
                </div>
                {d.downloadUrl ? (
                  <a
                    href={d.downloadUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-[#00527a]/30 bg-white px-3 text-xs text-[#00527a] hover:bg-[#eaf5ff]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Télécharger
                  </a>
                ) : (
                  <span className="text-[11px] text-muted-foreground">
                    Lien temporairement indisponible — actualiser.
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
