"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Loader2, Printer } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PrintableSupport } from "@/components/training-support/printable-support";
import { cn } from "@/lib/utils";
import {
  getTrainingSupportBySessionId,
  type StoredTrainingSupport,
} from "@/lib/training-support/training-support-service";

interface Props {
  sessionId: string;
}

export function PrintView({ sessionId }: Props) {
  const [stored, setStored] = useState<StoredTrainingSupport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTrainingSupportBySessionId(sessionId).then((result) => {
      if (cancelled) return;
      setStored(result.data);
      setError(result.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (loading) {
    return (
      <Card className="border-border/60 bg-white">
        <CardContent className="flex items-center gap-3 py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement du support…
        </CardContent>
      </Card>
    );
  }

  if (!stored) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-700" />
          <div>
            <p className="font-medium">Aucun support généré pour cette session</p>
            {error && <p className="text-amber-800/80">{error}</p>}
          </div>
        </div>
        <Link
          href={`/sessions/${sessionId}/support`}
          className={cn(
            buttonVariants({ variant: "outline", size: "default" }),
            "h-10 px-4 border-[#00527a]/20 text-[#00527a] hover:bg-[#eaf5ff]"
          )}
        >
          <ArrowLeft className="h-4 w-4" />
          Retour au support
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toolbar à l'écran uniquement — masquée à l'impression. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <Link
            href={`/sessions/${sessionId}/support`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-[#00527a]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour au support
          </Link>
          <h1 className="mt-2 font-heading text-2xl font-bold text-[#00527a]">
            Aperçu d&apos;impression
          </h1>
          <p className="text-sm text-muted-foreground">
            Cliquez sur « Imprimer / Enregistrer en PDF » et choisissez
            « Enregistrer au format PDF » dans la boîte de dialogue de votre
            navigateur.
          </p>
          {stored.source !== "llm" && (
            <p className="mt-1 text-xs text-amber-800">
              Support généré par le moteur local — relire avant diffusion.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className={cn(
            buttonVariants({ size: "lg" }),
            "bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90 h-11 px-5"
          )}
        >
          <Printer className="h-4 w-4" />
          Imprimer / Enregistrer en PDF
        </button>
      </div>

      {/* À l'écran : preview entouré d'un cadre A4 simulé.
          À l'impression : globals.css applique A4 + marges, le cadre disparaît. */}
      <div className="rounded-lg border border-border/60 bg-white p-6 shadow-sm print:rounded-none print:border-0 print:p-0 print:shadow-none">
        <PrintableSupport stored={stored} />
      </div>
    </div>
  );
}
