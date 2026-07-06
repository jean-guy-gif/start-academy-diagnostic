"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ClipboardList,
  FileText,
  Layers,
  Loader2,
  Printer,
} from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { DesignedSlideCard } from "@/components/training-support/designed-slide";
import { cn } from "@/lib/utils";
import {
  getDesignedSupportBySessionId,
  type StoredDesignedSupport,
} from "@/lib/training-support/designed-support-service";

interface Props {
  sessionId: string;
}

export function DesignPrintView({ sessionId }: Props) {
  const [stored, setStored] = useState<StoredDesignedSupport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getDesignedSupportBySessionId(sessionId).then((result) => {
      if (cancelled) return;
      setStored(result.data);
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
          Chargement du déroulé…
        </CardContent>
      </Card>
    );
  }

  if (!stored) {
    return (
      <div className="space-y-6">
        <Card className="border-border/60 bg-white">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="font-heading text-lg font-semibold text-[#00527a]">
                Aucun support designé pour cette session
              </p>
              <p className="max-w-md text-sm text-muted-foreground">
                Générer d&apos;abord le support designé pour pouvoir l&apos;exporter
                en PDF Start Academy.
              </p>
            </div>
            <Link
              href={`/sessions/${sessionId}/support/design`}
              className={cn(
                buttonVariants({ size: "default" }),
                "h-10 px-4 bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90"
              )}
            >
              <ArrowLeft className="h-4 w-4" />
              Retour au support designé
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const design = stored.design;

  return (
    <div className="space-y-6">
      {/* Toolbar visible à l'écran uniquement — JAMAIS imprimée. */}
      <div className="space-y-3 print:hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="mt-2 font-heading text-2xl font-bold text-[#00527a]">
              Aperçu impression — support designé
            </h1>
            <p className="text-sm text-muted-foreground">
              Une slide 16:9 par page A4 paysage. Cliquez sur « Imprimer /
              Enregistrer en PDF » et choisissez l&apos;orientation paysage
              dans la boîte de dialogue de votre navigateur.
            </p>
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

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/sessions/${sessionId}`}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-9 px-3 text-xs"
            )}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour à la session
          </Link>
          <Link
            href={`/sessions/${sessionId}/support/design`}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-9 px-3 text-xs"
            )}
          >
            <Layers className="h-3.5 w-3.5" />
            Support designé
          </Link>
          <Link
            href={`/sessions/${sessionId}/support`}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-9 px-3 text-xs"
            )}
          >
            <FileText className="h-3.5 w-3.5" />
            Support brut
          </Link>
          <Link
            href={`/sessions/${sessionId}`}
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-9 px-3 text-xs"
            )}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            Participants / Documents / Dates
          </Link>
        </div>

        <p className="rounded-md border border-[#00527a]/20 bg-[#eaf5ff]/40 px-3 py-2 text-xs text-[#00527a]">
          Après l&apos;export PDF, vous pouvez revenir à la session pour
          modifier les participants, les documents, les dates ou régénérer
          le support.
        </p>
      </div>

      {/* Une slide = une page A4 paysage. La règle @page est portée
          via inline style pour rester locale à cette route. Sur impression :
          - chaque slide remplit la page (aspect 16:9 conservé)
          - aucun gap entre les slides
          - le cadre / shadow de prévisualisation disparaît */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
          html, body { margin: 0 !important; padding: 0 !important; }
          .print-slide-wrapper {
            page-break-after: always;
            break-after: page;
            margin: 0 !important;
            padding: 0 !important;
            width: 100%;
          }
          .print-slide-wrapper:last-child {
            page-break-after: auto;
            break-after: auto;
          }
        }
      `}</style>

      <div className="space-y-6 print:space-y-0">
        {design.slides.map((slide) => (
          <div
            key={`print-slide-${slide.slideNumber}`}
            className="print-slide-wrapper print-page-break print:m-0 print:p-0"
          >
            <DesignedSlideCard
              slide={slide}
              total={design.slides.length}
              printMode
              deckTitle={design.designTitle}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
