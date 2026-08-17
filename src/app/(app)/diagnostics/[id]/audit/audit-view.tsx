import Image from "next/image";
import Link from "next/link";
import { AlertCircle, ArrowLeft, FileText } from "lucide-react";

import type { AuditContent } from "@/lib/audit/build-audit-content";
import {
  decideAuditRender,
  decideRatioDisplay,
} from "@/lib/audit/decide-audit-render";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { PrintButton } from "./print-button";

export interface AuditViewProps {
  diagnosticId: string;
  agencyName: string | null;
  commercialName: string | null;
  commercialEmail: string | null;
  audit: AuditContent;
  generatedOn: Date;
}

const DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

const NUMBER_FMT = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
});

function formatMetricValue(
  value: number | null,
  unit: string
): string {
  if (value === null || !Number.isFinite(value)) return "—";
  switch (unit) {
    case "percent":
      return `${NUMBER_FMT.format(value)} %`;
    case "months":
      return `${NUMBER_FMT.format(value)} mois`;
    case "rating_5":
      return `${NUMBER_FMT.format(value)} / 5`;
    case "count":
    case "ratio":
    default:
      return NUMBER_FMT.format(value);
  }
}

/**
 * Les alertes internes issues de `missing_required_data:*` arrivent
 * avec un libellé long « Donnée obligatoire manquante — <texte de la
 * question> ». On extrait juste le texte de la question pour l'encart
 * commercial (l'entête « N questions clés sans réponse » porte déjà le
 * verbe et la sévérité).
 */
function formatInternalAlertShort(label: string): string {
  const sep = " — ";
  const idx = label.indexOf(sep);
  return idx >= 0 ? label.slice(idx + sep.length) : label;
}

const THEME_LABEL: Record<string, string> = {
  prospecting_setup: "Prospection — dispositif",
  seller_rituals: "RDV vendeur — rituels",
  mandates_setup: "Mandats — dispositif",
  commercial_followup: "Suivi commercial",
  buyer_process: "Acquéreurs — process",
  db_reputation: "Base clients & e-réputation",
  tools_ai: "Outils & IA",
  management: "Management & pilotage",
};

function severityStyles(severity: "info" | "warning" | "error"): {
  border: string;
  text: string;
  label: string;
} {
  switch (severity) {
    case "error":
      return {
        border: "border-red-300 bg-red-50",
        text: "text-red-900",
        label: "Critique",
      };
    case "warning":
      return {
        border: "border-amber-300 bg-amber-50",
        text: "text-amber-900",
        label: "Vigilance",
      };
    case "info":
    default:
      return {
        border: "border-sky-300 bg-sky-50",
        text: "text-sky-900",
        label: "Info",
      };
  }
}

export function AuditView(props: AuditViewProps) {
  const decision = decideAuditRender(props.audit);

  if (decision.kind === "empty") {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 print:hidden">
        <Link
          href={`/diagnostics/${props.diagnosticId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour au diagnostic
        </Link>
        <div className="mt-8 rounded-lg border border-border/60 bg-white p-8 text-center">
          <FileText className="mx-auto h-10 w-10 text-primary/40" />
          <h1
            className="mt-4 font-heading text-2xl font-bold"
            style={{ color: "var(--color-brand-deep)" }}
          >
            Aucun audit à afficher
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Complétez votre diagnostic pour générer l&apos;audit.
          </p>
          <Link
            href={`/diagnostics/${props.diagnosticId}`}
            className={cn(
              buttonVariants({ size: "default" }),
              "mt-6 h-10 px-5 bg-[color:var(--color-brand-blue)] text-white hover:opacity-90"
            )}
          >
            Reprendre le diagnostic
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="audit-page mx-auto max-w-4xl px-6 py-6 print:max-w-none print:px-0 print:py-0">
      {/* Barre d'actions (écran uniquement) */}
      <div className="mb-6 flex items-center justify-between gap-4 print:hidden">
        <Link
          href={`/diagnostics/${props.diagnosticId}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour au diagnostic
        </Link>
        <PrintButton />
      </div>

      {/* Encart interne commercial — masqué en print, JAMAIS dans le
          doc client. Distingué structurellement par `audience` sur
          chaque alerte (pas de filtrage de texte de code). */}
      {props.audit.internalAlerts.length > 0 && (
        <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 print:hidden">
          <div className="mb-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-700" />
            <p className="font-medium">
              {props.audit.internalAlerts.length} question
              {props.audit.internalAlerts.length > 1 ? "s" : ""} clé
              {props.audit.internalAlerts.length > 1 ? "s" : ""} sans réponse
            </p>
          </div>
          <ul className="ml-6 list-disc space-y-1 text-amber-900/85">
            {props.audit.internalAlerts.map((a) => (
              <li key={a.code}>
                {formatInternalAlertShort(a.label)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-amber-800/70">
            Rappel : cet encart est visible uniquement à l&apos;écran, jamais
            dans le document remis au dirigeant.
          </p>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────
          Bloc 1 — Page de garde (première page à l'impression)
          ────────────────────────────────────────────────────────── */}
      <section className="audit-cover rounded-lg border border-border/60 bg-white p-10 print:rounded-none print:border-0 print:p-16">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-12 overflow-hidden">
            <Image
              src="/brand/logo-color.png"
              alt="Start Academy"
              fill
              sizes="48px"
              className="object-contain"
            />
          </div>
          <span
            className="font-heading text-sm font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-brand-deep)" }}
          >
            Start Academy
          </span>
        </div>

        <h1
          className="mt-16 font-heading text-4xl font-bold leading-tight print:text-5xl"
          style={{ color: "var(--color-brand-deep)" }}
        >
          Audit de performance
        </h1>
        {props.agencyName && (
          <p className="mt-3 font-heading text-2xl text-foreground/80 print:text-3xl">
            {props.agencyName}
          </p>
        )}

        <div className="mt-16 grid grid-cols-2 gap-8 text-sm">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Date
            </p>
            <p className="mt-1 font-medium">
              {DATE_FMT.format(props.generatedOn)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Réalisé par
            </p>
            <p className="mt-1 font-medium">
              {props.commercialName ?? "—"}
            </p>
            {props.commercialEmail && (
              <p className="text-xs text-muted-foreground">
                {props.commercialEmail}
              </p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Start Academy — accompagnement commercial des agences immobilières
            </p>
          </div>
        </div>

        {decision.completenessLabel && (
          <p className="mt-16 text-xs text-muted-foreground">
            {decision.completenessLabel}.
          </p>
        )}
      </section>

      {/* ──────────────────────────────────────────────────────────
          Bloc 2 — Synthèse dirigeant
          ────────────────────────────────────────────────────────── */}
      <section className="audit-block mt-10 rounded-lg border border-border/60 bg-white p-8 print:rounded-none print:border-0 print:p-12">
        <h2
          className="font-heading text-2xl font-bold"
          style={{ color: "var(--color-brand-deep)" }}
        >
          Synthèse dirigeant
        </h2>

        {decision.showPrioritiesQuote && (
          <blockquote className="mt-6 border-l-4 pl-4 italic text-foreground/80"
            style={{ borderColor: "var(--color-brand-blue)" }}>
            «&nbsp;
            {
              props.audit.practices.verbatims.find(
                (v) => v.key === "top3_priorities"
              )?.content
            }
            &nbsp;»
            <footer className="mt-2 text-xs not-italic text-muted-foreground">
              — Vos priorités, dans vos mots
            </footer>
          </blockquote>
        )}

        {props.audit.summary.keyMetrics.length > 0 && (
          <div className="mt-6 grid grid-cols-3 gap-4">
            {props.audit.summary.keyMetrics.map((m) => (
              <div
                key={m.key}
                className="audit-metric rounded-md border border-border/60 p-4"
                style={{ background: "var(--secondary)" }}
              >
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  {m.label}
                </p>
                <p
                  className="mt-2 font-heading text-3xl font-bold"
                  style={{ color: "var(--color-brand-deep)" }}
                >
                  {m.value === null
                    ? "Non mesuré"
                    : formatMetricValue(m.value, m.unit)}
                </p>
                {m.value !== null && m.benchmark !== null && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Repère : {formatMetricValue(m.benchmark, m.unit)}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        {props.audit.summary.topAlerts.length > 0 && (
          <div className="mt-6 space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Points d&apos;attention
            </p>
            <ul className="space-y-2">
              {props.audit.summary.topAlerts.map((a) => {
                const s = severityStyles(a.severity);
                return (
                  <li
                    key={a.code}
                    className={cn("rounded-md border px-3 py-2 text-sm", s.border, s.text)}
                  >
                    <span className="mr-2 text-[10.5px] font-semibold uppercase tracking-wider">
                      {s.label}
                    </span>
                    {a.label}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      {/* ──────────────────────────────────────────────────────────
          Bloc 3 — Performance de la chaîne
          ────────────────────────────────────────────────────────── */}
      <section className="audit-block mt-10 rounded-lg border border-border/60 bg-white p-8 print:rounded-none print:border-0 print:p-12">
        <h2
          className="font-heading text-2xl font-bold"
          style={{ color: "var(--color-brand-deep)" }}
        >
          Performance de la chaîne commerciale
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {props.audit.completeness.byBlock.performance_chain.answeredCount} question
          {props.audit.completeness.byBlock.performance_chain.answeredCount > 1 ? "s" : ""} renseignée
          {props.audit.completeness.byBlock.performance_chain.answeredCount > 1 ? "s" : ""} sur{" "}
          {props.audit.completeness.byBlock.performance_chain.totalCount}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-4">
          {/* Filtre `derived` : les ratios marqués dérivés (chute
              compromis→acte = 100 − compromis→acte) restent dans la
              structure mais ne sont pas rendus — ils dupliquent un
              autre ratio déjà présent. */}
          {props.audit.performanceChain.ratios
            .filter((r) => !r.derived)
            .map((r) => {
              const display = decideRatioDisplay(r);
              const statusStyle =
                r.status === "above"
                  ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                  : r.status === "below"
                  ? "bg-amber-50 text-amber-900 border-amber-200"
                  : "bg-muted text-muted-foreground border-border";
              const statusLabel =
                r.status === "above"
                  ? r.higherIsWorse
                    ? "À surveiller"
                    : "Au-dessus du repère"
                  : r.higherIsWorse
                  ? "Dans le repère"
                  : "Sous le repère";
              return (
                <div
                  key={r.key}
                  className="audit-ratio rounded-md border border-border/60 p-4"
                >
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {r.label}
                  </p>
                  <p
                    className={cn(
                      "mt-2 font-heading text-2xl font-bold",
                      !display.showValue && "text-muted-foreground/70 text-base"
                    )}
                    style={{
                      color: display.showValue
                        ? "var(--color-brand-deep)"
                        : undefined,
                    }}
                  >
                    {display.showValue
                      ? formatMetricValue(r.value, r.unit)
                      : display.emptyValueText}
                  </p>
                  {(display.showStatusBadge || r.benchmark !== null) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                      {r.benchmark !== null && display.showValue && (
                        <span className="text-muted-foreground">
                          Repère {formatMetricValue(r.benchmark, r.unit)}
                        </span>
                      )}
                      {display.showStatusBadge && (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full border px-2 py-0.5",
                            statusStyle
                          )}
                        >
                          {statusLabel}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────
          Bloc 4 — Pratiques & organisation
          ────────────────────────────────────────────────────────── */}
      <section className="audit-block mt-10 rounded-lg border border-border/60 bg-white p-8 print:rounded-none print:border-0 print:p-12">
        <h2
          className="font-heading text-2xl font-bold"
          style={{ color: "var(--color-brand-deep)" }}
        >
          Pratiques & organisation
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {props.audit.completeness.byBlock.practices.answeredCount} question
          {props.audit.completeness.byBlock.practices.answeredCount > 1 ? "s" : ""} renseignée
          {props.audit.completeness.byBlock.practices.answeredCount > 1 ? "s" : ""} sur{" "}
          {props.audit.completeness.byBlock.practices.totalCount}
        </p>

        {/* Version courte (lot audit-2) : par thème, une ligne par
            pratique absente formulée en constat. Formulation en dur via
            `PRACTICE_GAP_STATEMENTS` côté moteur — aucun IA, mapping
            explicite par ID de question. Les pratiques présentes ne
            sont pas listées (le doc client se concentre sur les
            manques). Version dense reviendra au lot audit-3. */}
        {props.audit.practices.gaps.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">
            Aucun manque de pratique identifié sur les questions couvertes.
          </p>
        ) : (
          Object.entries(
            props.audit.practices.gaps.reduce<
              Record<string, typeof props.audit.practices.gaps>
            >((acc, g) => {
              const key = g.theme;
              acc[key] = acc[key] ? [...acc[key], g] : [g];
              return acc;
            }, {})
          ).map(([theme, gaps]) => (
            <div key={theme} className="audit-flag-group mt-6">
              <h3
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: "var(--color-brand-deep)" }}
              >
                {THEME_LABEL[theme] ?? theme}
              </h3>
              <ul className="mt-2 space-y-1 text-sm text-foreground/80">
                {gaps.map((g) => (
                  <li key={g.key} className="flex gap-2">
                    <span
                      aria-hidden="true"
                      className="mt-1 h-1.5 w-1.5 flex-none rounded-full"
                      style={{ background: "var(--color-brand-deep)" }}
                    />
                    <span>{g.statement}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}

        {/* Verbatims */}
        {props.audit.practices.verbatims.length > 0 && (
          <div className="mt-8">
            <h3
              className="text-xs font-semibold uppercase tracking-wider"
              style={{ color: "var(--color-brand-deep)" }}
            >
              Vos verbatims
            </h3>
            <div className="mt-3 space-y-3">
              {props.audit.practices.verbatims.map((v) => (
                <div
                  key={v.key}
                  className="audit-verbatim rounded-md border border-border/60 p-4"
                  style={{ background: "var(--secondary)" }}
                >
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {v.label}
                  </p>
                  <p className="mt-2 italic text-foreground/80">
                    «&nbsp;{v.content}&nbsp;»
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ──────────────────────────────────────────────────────────
          Bloc 5 — Priorités numérotées
          ────────────────────────────────────────────────────────── */}
      {props.audit.priorities.length > 0 && (
        <section className="audit-block mt-10 rounded-lg border border-border/60 bg-white p-8 print:rounded-none print:border-0 print:p-12">
          <h2
            className="font-heading text-2xl font-bold"
            style={{ color: "var(--color-brand-deep)" }}
          >
            Priorités
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Votre proposition commerciale répondra point par point à ces priorités.
          </p>
          <ol className="mt-6 space-y-4">
            {props.audit.priorities.map((p) => {
              const s = severityStyles(p.severity);
              return (
                <li
                  key={p.rank}
                  className={cn(
                    "flex gap-4 rounded-md border p-4",
                    s.border,
                    s.text
                  )}
                >
                  <span
                    className="flex h-10 w-10 flex-none items-center justify-center rounded-full font-heading text-lg font-bold"
                    style={{
                      background: "var(--color-brand-deep)",
                      color: "white",
                    }}
                  >
                    {p.rank}
                  </span>
                  <div className="flex-1">
                    <p className="font-medium">{p.title}</p>
                    <p className="mt-1 text-[11px] uppercase tracking-wider opacity-70">
                      {s.label}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* CSS @media print — inline pour scope local à cette page. */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 16mm; }
          html, body { background: white !important; }
          .audit-cover { min-height: calc(100vh - 32mm); page-break-after: always; }
          .audit-block { break-inside: avoid; page-break-inside: avoid; }
          .audit-block { margin-top: 12mm !important; }
          .audit-ratio, .audit-metric, .audit-verbatim { break-inside: avoid; page-break-inside: avoid; }
          .audit-flag-group { break-inside: avoid-page; page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
