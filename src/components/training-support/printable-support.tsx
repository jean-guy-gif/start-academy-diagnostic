import { cn } from "@/lib/utils";
import type { StoredTrainingSupport, SupportStatus } from "@/lib/training-support/training-support-service";

/**
 * Rendu imprimable du support de formation.
 *
 * - Aux couleurs Start Academy (#FFFFFF / #3EA9FF / #00527A).
 * - Page de garde + résumé + intention pédagogique + modules détaillés.
 * - Classes utilitaires `print-page-break`, `print-avoid-break`,
 *   `print-keep-color` (cf. globals.css @media print).
 * - Aucune interaction : composant 100% statique, sans état ni event.
 *
 * Le composant utilise des classes Tailwind standards et reste lisible
 * à l'écran. La feuille de styles @media print masque le chrome
 * applicatif (sidebar/topbar) et impose A4 + marges + page breaks.
 */

const STATUS_LABEL: Record<SupportStatus, string> = {
  draft: "Brouillon",
  validated: "Validé",
  archived: "Archivé",
};

interface PrintableSupportProps {
  stored: StoredTrainingSupport;
}

export function PrintableSupport({ stored }: PrintableSupportProps) {
  const s = stored.support;
  return (
    <article className="mx-auto w-full max-w-[210mm] bg-white text-[#0b1b2a] print-keep-color">
      <CoverPage stored={stored} />

      <Section title="Résumé de session" className="print-page-break">
        <p className="text-sm leading-relaxed text-foreground/85">
          {s.sessionSummary}
        </p>
      </Section>

      <Section title="Intention pédagogique">
        <p className="text-sm leading-relaxed text-foreground/85">
          {s.pedagogicalIntent}
        </p>
      </Section>

      <Section title={`Programme synthétique (${s.modules.length} module${s.modules.length > 1 ? "s" : ""})`}>
        <ul className="space-y-2 text-sm">
          {s.modules.map((m, idx) => (
            <li
              key={`prog-${idx}`}
              className="flex items-start justify-between gap-4 border-b border-[#3ea9ff]/20 pb-2 last:border-b-0"
            >
              <span className="font-medium text-[#00527a]">
                {idx + 1}. {m.moduleTitle}
              </span>
              <span className="text-xs text-foreground/70">
                {m.durationHours} h
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {s.modules.map((module, idx) => (
        <ModulePage
          key={`mod-${idx}`}
          index={idx + 1}
          module={module}
        />
      ))}

      <Section title="Notes formateur" className="print-page-break">
        <Bullets items={s.facilitatorNotes} emptyHint="Aucune note spécifique." />
      </Section>

      <Section title="Préparation participants">
        <Bullets
          items={s.participantPreparation}
          emptyHint="Aucune préparation spécifique demandée."
        />
      </Section>

      <Section title="Matériel nécessaire">
        <Bullets items={s.materialsNeeded} emptyHint="Aucun matériel spécifique." />
      </Section>

      {s.missingInformation.length > 0 && (
        <Section
          title="Informations manquantes"
          className="border-l-2 border-[#3ea9ff] pl-4"
        >
          <Bullets items={s.missingInformation} emptyHint="—" />
        </Section>
      )}

      <Footer stored={stored} />
    </article>
  );
}

function CoverPage({ stored }: { stored: StoredTrainingSupport }) {
  const s = stored.support;
  return (
    <header className="flex min-h-[240mm] flex-col justify-between bg-white pb-16 print-avoid-break print-keep-color">
      <div className="space-y-10">
        <div className="flex items-center gap-3 border-b-2 border-[#3ea9ff] pb-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[#00527a] text-white font-heading text-xl font-bold">
            SA
          </div>
          <div>
            <p className="font-heading text-xs uppercase tracking-[0.3em] text-[#00527a]/70">
              Start Academy
            </p>
            <p className="font-heading text-lg font-semibold text-[#00527a]">
              Support de formation
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <p className="font-heading text-xs uppercase tracking-widest text-[#3ea9ff]">
            Programme
          </p>
          <h1 className="font-heading text-4xl font-bold leading-tight text-[#00527a]">
            {s.supportTitle}
          </h1>
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4 border-t-2 border-[#00527a]/10 pt-6">
          <CoverStat label="Public cible" value={s.targetAudience} />
          <CoverStat label="Durée totale" value={`${s.totalDurationHours} h`} />
          <CoverStat
            label="Statut"
            value={STATUS_LABEL[stored.status]}
          />
        </div>
        <p className="text-xs text-[#00527a]/60">
          Confidentiel — usage interne Start Academy et participants désignés.
        </p>
      </div>
    </header>
  );
}

function CoverStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-heading text-[10px] uppercase tracking-widest text-[#00527a]/60">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[#00527a]">{value}</p>
    </div>
  );
}

function ModulePage({
  index,
  module,
}: {
  index: number;
  module: StoredTrainingSupport["support"]["modules"][number];
}) {
  return (
    <section className="print-page-break print-keep-color space-y-5 py-4">
      <div className="space-y-1 border-b-2 border-[#3ea9ff]/40 pb-3">
        <p className="font-heading text-[10px] uppercase tracking-[0.25em] text-[#3ea9ff]">
          Module {index} · {module.durationHours} h
        </p>
        <h2 className="font-heading text-2xl font-bold text-[#00527a]">
          {module.moduleTitle}
        </h2>
      </div>

      <Block label="Problématique" body={module.problemStatement} />
      <Block label="Prise de conscience" body={module.awarenessSequence} />

      <div className="print-avoid-break">
        <BlockLabel label="Fondamentaux" />
        <ol className="mt-2 space-y-1 text-sm text-foreground/85">
          {module.fundamentals.map((f, idx) => (
            <li key={`fund-${idx}`}>{idx + 1}. {f}</li>
          ))}
        </ol>
      </div>

      <div className="print-avoid-break rounded-md border border-[#3ea9ff]/30 bg-[#eaf5ff]/40 p-3 print-keep-color">
        <BlockLabel label="Accélérateur IA" />
        <p className="mt-1.5 text-sm text-foreground/85">
          {module.aiAccelerator.objective}
        </p>
        {module.aiAccelerator.tools.length > 0 && (
          <p className="mt-1 text-xs text-[#00527a]">
            <span className="font-semibold">Outils :</span>{" "}
            {module.aiAccelerator.tools.join(", ")}
          </p>
        )}
        {module.aiAccelerator.examplePrompts.length > 0 && (
          <div className="mt-2 space-y-1">
            <p className="font-heading text-[10px] uppercase tracking-widest text-[#00527a]/60">
              Prompts d&apos;exemple
            </p>
            <ul className="space-y-1">
              {module.aiAccelerator.examplePrompts.map((p, idx) => (
                <li
                  key={`prompt-${idx}`}
                  className="rounded-sm border border-[#3ea9ff]/40 bg-white px-2 py-1 text-[11px] text-foreground/80"
                >
                  {p}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="print-avoid-break">
        <BlockLabel label="Exercice métier" />
        <p className="mt-1.5 text-sm font-semibold text-[#00527a]">
          {module.concreteBusinessExercise.title}
        </p>
        <p className="mt-1 text-sm text-foreground/85">
          {module.concreteBusinessExercise.context}
        </p>
        <ol className="mt-2 space-y-1 text-sm text-foreground/85">
          {module.concreteBusinessExercise.instructions.map((ins, idx) => (
            <li key={`ins-${idx}`}>{idx + 1}. {ins}</li>
          ))}
        </ol>
        <p className="mt-2 text-xs text-foreground/70">
          <span className="font-semibold text-[#00527a]">Livrable :</span>{" "}
          {module.concreteBusinessExercise.expectedOutput}
        </p>
      </div>

      {module.realCasesToUse.length > 0 ? (
        <div className="print-avoid-break">
          <BlockLabel label="Cas réels à utiliser" />
          <ul className="mt-1.5 space-y-1 text-sm text-foreground/85">
            {module.realCasesToUse.map((c, idx) => (
              <li key={`rc-${idx}`}>· {c}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-xs italic text-foreground/60">
          Aucun cas réel collaborateur disponible — exercice générique métier
          appliqué.
        </p>
      )}

      <div className="grid grid-cols-3 gap-3 print-avoid-break">
        <CompactBlock label="Clôture" body={module.stepClosing} />
        <CompactBlock label="Action terrain" body={module.fieldAction} />
        <CompactBlock label="Indicateur" body={module.progressIndicator} />
      </div>
    </section>
  );
}

function Section({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "py-5 print-avoid-break print-keep-color",
        className
      )}
    >
      <h2 className="font-heading text-lg font-semibold uppercase tracking-wider text-[#00527a]">
        {title}
      </h2>
      <div className="mt-3 border-t border-[#3ea9ff]/30 pt-3">{children}</div>
    </section>
  );
}

function Block({ label, body }: { label: string; body: string }) {
  return (
    <div className="print-avoid-break">
      <BlockLabel label={label} />
      <p className="mt-1.5 text-sm leading-relaxed text-foreground/85">{body}</p>
    </div>
  );
}

function BlockLabel({ label }: { label: string }) {
  return (
    <p className="font-heading text-[10px] uppercase tracking-[0.25em] text-[#3ea9ff]">
      {label}
    </p>
  );
}

function CompactBlock({ label, body }: { label: string; body: string }) {
  return (
    <div className="rounded-sm border border-[#00527a]/15 bg-white p-2 print-keep-color">
      <BlockLabel label={label} />
      <p className="mt-1 text-xs text-foreground/80">{body}</p>
    </div>
  );
}

function Bullets({
  items,
  emptyHint,
}: {
  items: string[];
  emptyHint: string;
}) {
  if (items.length === 0) {
    return <p className="text-xs italic text-foreground/60">{emptyHint}</p>;
  }
  return (
    <ul className="space-y-1 text-sm text-foreground/85">
      {items.map((item, idx) => (
        <li key={`b-${idx}`}>· {item}</li>
      ))}
    </ul>
  );
}

function Footer({ stored }: { stored: StoredTrainingSupport }) {
  const generated = (() => {
    try {
      return new Date(stored.generatedAt).toLocaleString("fr-FR");
    } catch {
      return stored.generatedAt;
    }
  })();
  return (
    <footer className="mt-10 border-t-2 border-[#00527a]/10 pt-4 text-[10px] uppercase tracking-widest text-[#00527a]/60">
      <div className="flex items-center justify-between">
        <span>Start Academy · Support formation</span>
        <span>Généré le {generated}</span>
      </div>
    </footer>
  );
}
