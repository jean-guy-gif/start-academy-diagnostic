"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Hammer,
  Layers,
  Lightbulb,
  ListChecks,
  Quote,
  Sparkles,
  Target,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";

import { cn } from "@/lib/utils";
import type {
  ColorMood,
  ContentBlock,
  ContentBlockType,
  DesignedSlide,
  SlideLayout,
  SlideType,
} from "@/lib/ai/designed-support-schema";

/**
 * Composant slide premium Start Academy.
 *
 * Architecture :
 *   - L'IA fournit uniquement contenu + intention (slideType, layout,
 *     colorMood, suggestedIcon).
 *   - Ce composant IMPOSE le design : palette charte, polices Rajdhani
 *     / Montserrat, espacements, icônes, ratio 16:9, page break print.
 *
 * Tout choix libre de Claude est filtré ici (icon whitelist, layout
 * enum, colorMood enum). Si Claude propose une icône inconnue, on
 * retombe sur le default lié au slideType — la cohérence visuelle est
 * garantie quelle que soit la génération.
 */

// ---------------------------------------------------------------------------
// Icon library — whitelist déterministe, jamais d'icône inventée.
// ---------------------------------------------------------------------------

const ICON_LIBRARY: Record<string, LucideIcon> = {
  Target,
  Lightbulb,
  Zap,
  Hammer,
  ClipboardCheck,
  Wrench,
  ListChecks,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Sparkles,
  Users,
  Quote,
};

const DEFAULT_ICON_BY_TYPE: Record<SlideType, LucideIcon> = {
  cover: Sparkles,
  section: Layers,
  problem: AlertTriangle,
  awareness: Lightbulb,
  fundamentals: Wrench,
  ai_accelerator: Zap,
  exercise: Hammer,
  case_study: ClipboardCheck,
  field_action: Target,
  summary: ListChecks,
  closing: CheckCircle2,
};

function pickIcon(slide: DesignedSlide): LucideIcon {
  const proposed = slide.visualGuidance.suggestedIcon;
  if (proposed && proposed in ICON_LIBRARY) {
    return ICON_LIBRARY[proposed];
  }
  return DEFAULT_ICON_BY_TYPE[slide.slideType];
}

// ---------------------------------------------------------------------------
// Palettes — 4 thèmes Start Academy stricts.
// ---------------------------------------------------------------------------

interface Palette {
  key: "deep" | "accent" | "white" | "mixed";
  surface: string;
  text: string;
  subtleText: string;
  accentText: string;
  divider: string;
  blockSurface: string;
  blockBorder: string;
}

const PALETTE_DEEP: Palette = {
  key: "deep",
  surface: "bg-[#00527a]",
  text: "text-white",
  subtleText: "text-white/75",
  accentText: "text-[#3ea9ff]",
  divider: "border-[#3ea9ff]",
  blockSurface: "bg-white/10",
  blockBorder: "border-white/15",
};

const PALETTE_ACCENT: Palette = {
  key: "accent",
  surface: "bg-[#3ea9ff]",
  text: "text-white",
  subtleText: "text-white/85",
  accentText: "text-[#00527a]",
  divider: "border-white/40",
  blockSurface: "bg-white/15",
  blockBorder: "border-white/30",
};

const PALETTE_WHITE: Palette = {
  key: "white",
  surface: "bg-white",
  text: "text-[#0b1b2a]",
  subtleText: "text-[#00527a]/70",
  accentText: "text-[#3ea9ff]",
  divider: "border-[#3ea9ff]/40",
  blockSurface: "bg-[#eaf5ff]/50",
  blockBorder: "border-[#3ea9ff]/25",
};

const PALETTE_MIXED: Palette = {
  key: "mixed",
  surface: "bg-gradient-to-br from-white via-[#eaf5ff]/50 to-[#3ea9ff]/15",
  text: "text-[#0b1b2a]",
  subtleText: "text-[#00527a]/80",
  accentText: "text-[#00527a]",
  divider: "border-[#00527a]/25",
  blockSurface: "bg-white",
  blockBorder: "border-[#00527a]/15",
};

const PALETTE_BY_MOOD: Record<ColorMood, Palette> = {
  deep_blue: PALETTE_DEEP,
  accent_blue: PALETTE_ACCENT,
  white: PALETTE_WHITE,
  mixed: PALETTE_MIXED,
};

function resolvePalette(slide: DesignedSlide): Palette {
  // Cover et closing : toujours bleu profond — non négociable côté React.
  if (slide.slideType === "cover" || slide.slideType === "closing") {
    return PALETTE_DEEP;
  }
  return PALETTE_BY_MOOD[slide.visualGuidance.colorMood];
}

function isDarkPalette(palette: Palette): boolean {
  return palette.key === "deep" || palette.key === "accent";
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

const SLIDE_TYPE_LABEL: Record<SlideType, string> = {
  cover: "Ouverture",
  section: "Section",
  problem: "Problématique",
  awareness: "Prise de conscience",
  fundamentals: "Méthode",
  ai_accelerator: "Accélérateur IA",
  exercise: "Exercice",
  case_study: "Cas terrain",
  field_action: "Action terrain",
  summary: "Synthèse",
  closing: "Clôture",
};

// ---------------------------------------------------------------------------
// Composant principal
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Densité de contenu — garde-fou anti-débordement en PDF
//
// Une slide 16:9 a un budget visuel limité. Quand le LLM (ou
// l'heuristique) envoie trop de texte, on dégrade gracieusement
// AVANT que le contenu déborde du cadre. Trois leviers :
//   - typo réduite (text-base → text-sm)
//   - gaps resserrés (gap-7 → gap-4)
//   - caps d'items par bloc (cf. MAX_ITEMS_BY_DENSITY)
// ---------------------------------------------------------------------------

type ContentDensity = "low" | "medium" | "high" | "overflowRisk";

interface DensitySpec {
  density: ContentDensity;
  approxChars: number;
}

const OVERFLOW_RISK_THRESHOLD = 1400;
const HIGH_DENSITY_THRESHOLD = 900;
const MEDIUM_DENSITY_THRESHOLD = 500;

function blockCharCount(blocks: DesignedSlide["contentBlocks"]): number {
  let total = 0;
  for (const block of blocks) {
    if (block.title) total += block.title.length;
    const c = block.content;
    if (typeof c === "string") {
      total += c.length;
    } else if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === "string") total += item.length;
      }
    }
  }
  return total;
}

export function getContentDensity(slide: DesignedSlide): DensitySpec {
  const titleChars = slide.title.length + (slide.subtitle?.length ?? 0);
  const mainChars = slide.mainMessage.length;
  const blockChars = blockCharCount(slide.contentBlocks);
  const trainerChars = slide.trainerNote?.length ?? 0;
  const approxChars = titleChars + mainChars + blockChars + trainerChars;

  if (approxChars >= OVERFLOW_RISK_THRESHOLD) {
    return { density: "overflowRisk", approxChars };
  }
  if (approxChars >= HIGH_DENSITY_THRESHOLD) {
    return { density: "high", approxChars };
  }
  if (approxChars >= MEDIUM_DENSITY_THRESHOLD) {
    return { density: "medium", approxChars };
  }
  return { density: "low", approxChars };
}

interface DensityClasses {
  outerGap: string;
  bodyGap: string;
  titleSize: string;
  mainSize: string;
  blockTextSize: string;
  itemSpacing: string;
}

export function getTextSizeForDensity(density: ContentDensity): DensityClasses {
  switch (density) {
    case "overflowRisk":
      return {
        outerGap: "gap-3",
        bodyGap: "gap-2",
        titleSize: "text-[22px] md:text-[26px]",
        mainSize: "text-sm md:text-[15px]",
        blockTextSize: "text-[12px] md:text-[13px]",
        itemSpacing: "space-y-1",
      };
    case "high":
      return {
        outerGap: "gap-4",
        bodyGap: "gap-3",
        titleSize: "text-[26px] md:text-[30px]",
        mainSize: "text-sm md:text-base",
        blockTextSize: "text-[13px] md:text-[14px]",
        itemSpacing: "space-y-1.5",
      };
    case "medium":
      return {
        outerGap: "gap-5",
        bodyGap: "gap-4",
        titleSize: "text-[28px] md:text-[34px]",
        mainSize: "text-base md:text-[17px]",
        blockTextSize: "text-sm",
        itemSpacing: "space-y-2",
      };
    case "low":
    default:
      return {
        outerGap: "gap-7",
        bodyGap: "gap-6",
        titleSize: "text-[32px] md:text-[40px]",
        mainSize: "text-base md:text-lg",
        blockTextSize: "text-sm md:text-base",
        itemSpacing: "space-y-2",
      };
  }
}

const MAX_ITEMS_BY_DENSITY: Record<ContentDensity, number> = {
  low: 6,
  medium: 5,
  high: 4,
  overflowRisk: 3,
};

export function maxItemsForDensity(density: ContentDensity): number {
  return MAX_ITEMS_BY_DENSITY[density];
}

export function shouldUseCompactLayout(slide: DesignedSlide): boolean {
  const { density } = getContentDensity(slide);
  return density === "high" || density === "overflowRisk";
}

/** Tronque une liste d'items à `max` et ajoute un item récapitulatif si
 *  dépassement — utilisé par les blocs lists pour éviter les
 *  débordements. Le texte récapitulatif est neutre et passe-partout. */
export function capItems(items: string[], max: number): string[] {
  if (items.length <= max) return items;
  const kept = items.slice(0, max);
  kept.push(`+ ${items.length - max} autres — voir note formateur.`);
  return kept;
}

interface DesignedSlideProps {
  slide: DesignedSlide;
  total: number;
  /** Si true, applique `print-page-break` (utile en mode impression). */
  printMode?: boolean;
  /** Titre global du déroulé, utilisé en surimpression discrète. */
  deckTitle?: string;
  /** Nom de client (cover override). */
  clientName?: string | null;
}

export function DesignedSlideCard({
  slide,
  total,
  printMode = false,
  deckTitle,
  clientName,
}: DesignedSlideProps) {
  const palette = resolvePalette(slide);
  const Icon = pickIcon(slide);
  const { density } = getContentDensity(slide);
  const sizes = getTextSizeForDensity(density);
  const compact = density === "high" || density === "overflowRisk";

  return (
    <article
      className={cn(
        "relative w-full overflow-hidden print-keep-color",
        "aspect-[16/9]",
        "rounded-2xl shadow-md ring-1 ring-black/5 print:rounded-none print:shadow-none print:ring-0",
        printMode && "print-page-break print-avoid-break",
        palette.surface,
        palette.text
      )}
      data-slide-type={slide.slideType}
      data-density={density}
    >
      <div
        className={cn(
          "absolute inset-0 flex h-full w-full flex-col overflow-hidden",
          // Padding horizontal CONSTANT (px-12 → px-16) pour ne jamais
          // coller le texte aux bords. Seul le padding vertical se
          // resserre en mode dense. Évite le bug "texte collé sur les
          // bords" rapporté en pilote.
          "px-12 md:px-14 lg:px-16",
          compact ? "py-7 md:py-8 lg:py-9" : "py-12 md:py-14 lg:py-16",
          sizes.outerGap
        )}
      >
        {/* Header et footer en flex-shrink-0 : ils gardent leur
            hauteur intrinsèque même si le body veut grandir. Le seul
            qui doit se contraindre, c'est le body (min-h-0 + overflow-hidden). */}
        <div className="flex-shrink-0">
          <SlideHeader slide={slide} palette={palette} icon={Icon} deckTitle={deckTitle} />
        </div>

        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col overflow-hidden",
            sizes.bodyGap
          )}
        >
          {slide.slideType === "cover" ? (
            <CoverBody slide={slide} palette={palette} clientName={clientName} />
          ) : slide.slideType === "closing" ? (
            <ClosingBody slide={slide} palette={palette} />
          ) : (
            <StandardBody slide={slide} palette={palette} sizes={sizes} density={density} />
          )}
        </div>

        <div className="flex-shrink-0">
          <SlideFooter slide={slide} palette={palette} total={total} />
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Header / Footer
// ---------------------------------------------------------------------------

function SlideHeader({
  slide,
  palette,
  icon: Icon,
  deckTitle,
}: {
  slide: DesignedSlide;
  palette: Palette;
  icon: LucideIcon;
  deckTitle?: string;
}) {
  return (
    <header className="flex items-start justify-between gap-6">
      <div className="flex flex-col gap-1">
        <BrandMark palette={palette} />
        {deckTitle && (
          <span
            className={cn(
              "font-heading text-[10px] uppercase tracking-[0.35em]",
              palette.subtleText
            )}
          >
            {deckTitle}
          </span>
        )}
      </div>
      <div className="flex flex-col items-end gap-2">
        <span
          className={cn(
            "font-heading text-[10px] uppercase tracking-[0.35em]",
            palette.accentText
          )}
        >
          {SLIDE_TYPE_LABEL[slide.slideType]}
        </span>
        <div
          className={cn(
            "flex h-14 w-14 items-center justify-center rounded-full border",
            palette.blockSurface,
            palette.blockBorder
          )}
        >
          <Icon className={cn("h-6 w-6", palette.accentText)} />
        </div>
      </div>
    </header>
  );
}

function SlideFooter({
  slide,
  palette,
  total,
}: {
  slide: DesignedSlide;
  palette: Palette;
  total: number;
}) {
  return (
    <footer
      className={cn(
        "flex items-center justify-between border-t pt-4",
        palette.divider,
        palette.subtleText
      )}
    >
      <span className="font-heading text-[10px] uppercase tracking-[0.35em]">
        Start Academy
      </span>
      <span className="font-heading text-[10px] uppercase tracking-[0.35em]">
        {slide.slideNumber} / {total}
      </span>
    </footer>
  );
}

function BrandMark({ palette }: { palette: Palette }) {
  const useWhite = isDarkPalette(palette);
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "relative h-9 w-9 overflow-hidden rounded-md print-keep-color",
          useWhite ? "bg-white/15" : "bg-[#00527a]/10"
        )}
      >
        <Image
          src={useWhite ? "/brand/logo-white.png" : "/brand/logo-color.png"}
          alt="Start Academy"
          fill
          sizes="36px"
          className="object-contain p-1.5"
        />
      </div>
      <span
        className={cn(
          "font-heading text-xs font-bold tracking-[0.3em]",
          palette.text
        )}
      >
        START ACADEMY
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bodies par type
// ---------------------------------------------------------------------------

function CoverBody({
  slide,
  palette,
  clientName,
}: {
  slide: DesignedSlide;
  palette: Palette;
  clientName?: string | null;
}) {
  // Titre cover : tailles dégressives si le titre est long, pour
  // éviter qu'il pousse le mainMessage sous le footer en PDF.
  const longTitle = slide.title.length > 60;
  const veryLongTitle = slide.title.length > 90;
  const titleSize = veryLongTitle
    ? "text-[28px] md:text-[36px] lg:text-[40px]"
    : longTitle
      ? "text-[36px] md:text-[44px] lg:text-[48px]"
      : "text-[44px] md:text-[56px] lg:text-[64px]";

  return (
    <div className="grid min-h-0 h-full flex-1 grid-cols-1 gap-10 overflow-hidden md:grid-cols-[1.4fr_1fr]">
      <div className="flex min-h-0 h-full flex-col justify-between gap-6 overflow-hidden">
        <div className="min-h-0 space-y-4 overflow-hidden">
          {clientName && (
            <span
              className={cn(
                "font-heading text-xs font-semibold uppercase tracking-[0.5em]",
                palette.subtleText
              )}
            >
              Pour {clientName}
            </span>
          )}
          <h1
            className={cn(
              "font-heading font-bold leading-[1.05] tracking-tight",
              titleSize,
              palette.text
            )}
          >
            {slide.title}
          </h1>
          {slide.subtitle && (
            <p
              className={cn(
                "max-w-2xl font-heading text-base leading-snug md:text-lg",
                palette.subtleText
              )}
            >
              {slide.subtitle}
            </p>
          )}
        </div>

        <p
          className={cn(
            "max-w-2xl text-sm leading-relaxed md:text-base",
            palette.text
          )}
        >
          {slide.mainMessage}
        </p>
      </div>

      <div className="flex min-h-0 h-full flex-col justify-end gap-3 overflow-hidden">
        {slide.contentBlocks.slice(0, 3).map((block, idx) => (
          <CoverChip key={`cover-chip-${idx}`} block={block} palette={palette} />
        ))}
      </div>
    </div>
  );
}

function CoverChip({
  block,
  palette,
}: {
  block: ContentBlock;
  palette: Palette;
}) {
  const text = Array.isArray(block.content)
    ? block.content.join(" · ")
    : block.content;
  return (
    <div
      className={cn(
        "rounded-lg border px-4 py-3",
        palette.blockSurface,
        palette.blockBorder
      )}
    >
      {block.title && (
        <p
          className={cn(
            "font-heading text-[10px] uppercase tracking-[0.3em]",
            palette.subtleText
          )}
        >
          {block.title}
        </p>
      )}
      <p
        className={cn(
          "mt-1 font-heading text-lg font-semibold leading-tight",
          palette.text
        )}
      >
        {text}
      </p>
    </div>
  );
}

function ClosingBody({
  slide,
  palette,
}: {
  slide: DesignedSlide;
  palette: Palette;
}) {
  // Même logique anti-débordement que CoverBody : tailles dégressives
  // selon longueur du titre + flex parent qui clippe.
  const longTitle = slide.title.length > 50;
  const veryLongTitle = slide.title.length > 80;
  const titleSize = veryLongTitle
    ? "text-[32px] md:text-[40px]"
    : longTitle
      ? "text-[40px] md:text-[48px]"
      : "text-[52px] md:text-[64px]";

  return (
    <div className="flex min-h-0 h-full flex-col items-center justify-center overflow-hidden text-center">
      <div className="min-h-0 max-w-3xl space-y-5 overflow-hidden">
        <span
          className={cn(
            "font-heading text-xs font-semibold uppercase tracking-[0.5em]",
            palette.accentText
          )}
        >
          Clôture
        </span>
        <h1
          className={cn(
            "font-heading font-bold leading-tight",
            titleSize,
            palette.text
          )}
        >
          {slide.title}
        </h1>
        {slide.subtitle && (
          <p
            className={cn(
              "font-heading text-base md:text-lg",
              palette.subtleText
            )}
          >
            {slide.subtitle}
          </p>
        )}
        <p
          className={cn(
            "mt-4 max-w-2xl text-sm leading-relaxed md:text-base",
            palette.text
          )}
        >
          {slide.mainMessage}
        </p>
      </div>
    </div>
  );
}

function StandardBody({
  slide,
  palette,
  sizes,
  density,
}: {
  slide: DesignedSlide;
  palette: Palette;
  sizes: DensityClasses;
  density: ContentDensity;
}) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col overflow-hidden", sizes.bodyGap)}>
      <div className="space-y-2">
        <p
          className={cn(
            "font-heading text-[11px] font-semibold uppercase tracking-[0.4em]",
            palette.accentText
          )}
        >
          {slide.visualGuidance.emphasis}
        </p>
        <h2
          className={cn(
            "font-heading font-bold leading-tight",
            sizes.titleSize,
            palette.text
          )}
        >
          {slide.title}
        </h2>
        {slide.subtitle && (
          <p
            className={cn(
              "font-medium",
              density === "overflowRisk" ? "text-xs" : "text-sm md:text-base",
              palette.subtleText
            )}
          >
            {slide.subtitle}
          </p>
        )}
      </div>

      <p
        className={cn(
          "max-w-4xl leading-relaxed",
          sizes.mainSize,
          palette.text
        )}
      >
        {slide.mainMessage}
      </p>

      <div className="min-h-0 flex-1 overflow-hidden">
        <ContentArea
          blocks={slide.contentBlocks}
          layout={slide.visualGuidance.layout}
          palette={palette}
          density={density}
          sizes={sizes}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Layouts — React DÉCIDE la disposition concrète.
// ---------------------------------------------------------------------------

function ContentArea({
  blocks,
  layout,
  palette,
  density,
  sizes,
}: {
  blocks: ContentBlock[];
  layout: SlideLayout;
  palette: Palette;
  density: ContentDensity;
  sizes: DensityClasses;
}) {
  if (blocks.length === 0) return null;

  switch (layout) {
    case "two_columns":
      return (
        <div className="grid flex-1 min-h-0 grid-cols-1 gap-5 overflow-hidden md:grid-cols-2">
          {blocks.map((b, idx) => (
            <BlockRenderer key={`b-${idx}`} block={b} palette={palette} density={density} sizes={sizes} />
          ))}
        </div>
      );

    case "cards":
      return (
        <div
          className={cn(
            "grid flex-1 min-h-0 gap-4 overflow-hidden",
            blocks.length <= 2
              ? "grid-cols-1 md:grid-cols-2"
              : "grid-cols-1 md:grid-cols-3"
          )}
        >
          {blocks.map((b, idx) => (
            <BlockRenderer key={`b-${idx}`} block={b} palette={palette} density={density} sizes={sizes} />
          ))}
        </div>
      );

    case "timeline":
      return (
        <ol
          className={cn(
            "relative flex-1 min-h-0 space-y-4 overflow-hidden border-l-2 pl-6",
            palette.divider
          )}
        >
          {blocks.map((b, idx) => (
            <li
              key={`tl-${idx}`}
              className={cn(
                "relative",
                "before:absolute before:-left-8 before:top-3 before:h-3.5 before:w-3.5 before:rounded-full",
                isDarkPalette(palette) ? "before:bg-white" : "before:bg-[#3ea9ff]"
              )}
            >
              <BlockRenderer block={b} palette={palette} density={density} sizes={sizes} />
            </li>
          ))}
        </ol>
      );

    case "framework":
      return (
        <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-hidden">
          {blocks.map((b, idx) => (
            <BlockRenderer key={`b-${idx}`} block={b} palette={palette} density={density} sizes={sizes} />
          ))}
        </div>
      );

    case "exercise_canvas":
      return <ExerciseCanvas blocks={blocks} palette={palette} density={density} sizes={sizes} />;

    case "summary_grid":
      return (
        <div
          className={cn(
            "grid flex-1 min-h-0 gap-4 overflow-hidden",
            blocks.length <= 1
              ? "grid-cols-1"
              : "grid-cols-1 md:grid-cols-2"
          )}
        >
          {blocks.map((b, idx) => (
            <BlockRenderer key={`b-${idx}`} block={b} palette={palette} density={density} sizes={sizes} />
          ))}
        </div>
      );

    case "hero":
    default:
      return (
        <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-hidden">
          {blocks.map((b, idx) => (
            <BlockRenderer key={`b-${idx}`} block={b} palette={palette} density={density} sizes={sizes} />
          ))}
        </div>
      );
  }
}

/**
 * Canvas d'exercice — quadrillage clair "Objectif / Contexte / Consignes
 * / Livrable" quand les blocs collent à ces sémantiques, sinon stacking
 * encadré dashed. La sémantique est inférée par le `type` du bloc (et
 * non par son texte — React décide).
 */
function ExerciseCanvas({
  blocks,
  palette,
  density,
  sizes,
}: {
  blocks: ContentBlock[];
  palette: Palette;
  density: ContentDensity;
  sizes: DensityClasses;
}) {
  return (
    <div
      className={cn(
        "flex flex-1 min-h-0 flex-col gap-4 overflow-hidden rounded-2xl border-2 border-dashed p-5 md:p-6 print-keep-color",
        palette.divider,
        palette.blockSurface
      )}
    >
      <p
        className={cn(
          "font-heading text-[10px] uppercase tracking-[0.35em]",
          palette.accentText
        )}
      >
        Canvas exercice
      </p>
      <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 overflow-hidden md:grid-cols-2">
        {blocks.map((b, idx) => (
          <BlockRenderer key={`exc-${idx}`} block={b} palette={palette} density={density} sizes={sizes} />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Block renderers — React choisit l'apparence finale par type.
// ---------------------------------------------------------------------------

function BlockRenderer({
  block,
  palette,
  density = "low",
  sizes,
}: {
  block: ContentBlock;
  palette: Palette;
  density?: ContentDensity;
  sizes?: DensityClasses;
}) {
  const rawItems = Array.isArray(block.content) ? block.content : null;
  // Cap items selon densité (cf. MAX_ITEMS_BY_DENSITY). Au-delà de la
  // limite, on ajoute "+ N autres — voir note formateur." pour ne pas
  // laisser deviner que du contenu a été tronqué.
  const items = rawItems
    ? capItems(rawItems, maxItemsForDensity(density))
    : null;
  const text = !Array.isArray(block.content) ? block.content : null;
  const blockTextSize = sizes?.blockTextSize ?? "text-base";
  const itemSpacing = sizes?.itemSpacing ?? "space-y-2";

  switch (block.type) {
    case "bullet_list":
      return (
        <BlockShell title={block.title} palette={palette}>
          <ul className={cn(itemSpacing, blockTextSize, "leading-snug", palette.text)}>
            {(items ?? []).map((item, idx) => (
              <li key={`bl-${idx}`} className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-2 h-1.5 w-1.5 flex-none rounded-full",
                    isDarkPalette(palette) ? "bg-white" : "bg-[#3ea9ff]"
                  )}
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </BlockShell>
      );

    case "numbered_steps":
      return (
        <BlockShell title={block.title} palette={palette}>
          <ol className={cn(itemSpacing, blockTextSize, "leading-snug", palette.text)}>
            {(items ?? []).map((item, idx) => (
              <li key={`ns-${idx}`} className="flex items-start gap-4">
                <span
                  className={cn(
                    "flex h-7 w-7 flex-none items-center justify-center rounded-full font-heading text-sm font-bold",
                    isDarkPalette(palette)
                      ? "bg-white text-[#00527a]"
                      : "bg-[#00527a] text-white"
                  )}
                >
                  {idx + 1}
                </span>
                <span className="pt-0.5">{item}</span>
              </li>
            ))}
          </ol>
        </BlockShell>
      );

    case "checklist":
      return (
        <BlockShell title={block.title} palette={palette}>
          <ul className={cn(itemSpacing, blockTextSize, "leading-snug", palette.text)}>
            {(items ?? []).map((item, idx) => (
              <li key={`cl-${idx}`} className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 h-5 w-5 flex-none rounded-md border-2",
                    isDarkPalette(palette)
                      ? "border-white"
                      : "border-[#00527a]"
                  )}
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </BlockShell>
      );

    case "quote":
      return (
        <BlockShell
          title={block.title}
          palette={palette}
          extraClass="border-l-4"
        >
          <div className="flex items-start gap-4">
            <Quote className={cn("h-6 w-6 flex-none", palette.accentText)} />
            <p
              className={cn(
                "font-heading text-xl italic leading-snug md:text-2xl",
                palette.text
              )}
            >
              {text}
            </p>
          </div>
        </BlockShell>
      );

    case "highlight":
      return (
        <BlockShell title={block.title} palette={palette}>
          <p
            className={cn(
              "font-heading text-xl font-bold leading-snug md:text-2xl",
              palette.text
            )}
          >
            {text}
          </p>
        </BlockShell>
      );

    case "prompt": {
      // Slide projetable : bandeau "PROMPT À PROJETER" + bloc mono.
      // Si très long en mode dense, on bascule en typo plus petite et
      // line-clamp pour éviter que le prompt déborde sous le footer.
      const promptDense = density === "high" || density === "overflowRisk";
      const promptText = promptDense ? "text-[11px]" : "text-[13px]";
      const promptPadding = promptDense ? "px-3 py-2" : "px-4 py-3";
      const promptClampStyle = promptDense
        ? {
            display: "-webkit-box",
            WebkitLineClamp: density === "overflowRisk" ? 4 : 6,
            WebkitBoxOrient: "vertical" as const,
            overflow: "hidden" as const,
          }
        : undefined;
      return (
        <div className="flex min-h-0 flex-col gap-2 overflow-hidden print-keep-color">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2.5 py-1 font-heading text-[10px] font-bold uppercase tracking-[0.3em]",
                isDarkPalette(palette)
                  ? "bg-[#3ea9ff] text-white"
                  : "bg-[#00527a] text-white"
              )}
            >
              {promptDense ? "Prompt — version courte" : "Prompt à projeter"}
            </span>
            {block.title && (
              <span
                className={cn(
                  "font-heading text-[11px] uppercase tracking-[0.3em]",
                  palette.subtleText
                )}
              >
                {block.title}
              </span>
            )}
          </div>
          {items ? (
            <ul className={cn("space-y-2 min-h-0 overflow-hidden")}>
              {items.map((item, idx) => (
                <li
                  key={`p-${idx}`}
                  className={cn(
                    "rounded-md border font-mono leading-relaxed print-keep-color",
                    promptText,
                    promptPadding,
                    isDarkPalette(palette)
                      ? "border-white/25 bg-[#0b1b2a]/40 text-white"
                      : "border-[#00527a]/15 bg-[#0b1b2a] text-white"
                  )}
                  style={promptClampStyle}
                >
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p
              className={cn(
                "rounded-md border font-mono leading-relaxed print-keep-color",
                promptText,
                promptPadding,
                isDarkPalette(palette)
                  ? "border-white/25 bg-[#0b1b2a]/40 text-white"
                  : "border-[#00527a]/15 bg-[#0b1b2a] text-white"
              )}
              style={promptClampStyle}
            >
              {text}
            </p>
          )}
          {promptDense ? (
            <p className={cn("text-[10px] italic", palette.subtleText)}>
              Prompt complet dans le support brut / note formateur.
            </p>
          ) : null}
        </div>
      );
    }

    case "metric": {
      // Indicateur (souvent utilisé pour "action terrain"). Réduit
      // automatiquement la typo si le texte dépasse ~60 chars OU si la
      // slide est en risque d'overflow — empêche les blocs géants qui
      // poussent le footer hors-page.
      const raw = Array.isArray(block.content) ? block.content[0] ?? "" : text ?? "";
      const longMetric = raw.length > 60;
      const compactMetric =
        density === "high" || density === "overflowRisk" || longMetric;
      const metricSize = compactMetric
        ? "text-xl md:text-2xl"
        : "text-4xl md:text-5xl";
      return (
        <BlockShell title={block.title ?? "Indicateur"} palette={palette}>
          <p
            className={cn(
              "font-heading font-bold leading-tight",
              metricSize,
              palette.accentText
            )}
            style={
              compactMetric
                ? {
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical" as const,
                    overflow: "hidden" as const,
                  }
                : undefined
            }
          >
            {compactMetric && longMetric ? `Indicateur : ${raw}` : raw}
          </p>
        </BlockShell>
      );
    }

    case "case":
      return (
        <BlockShell
          title={block.title ?? "Cas terrain"}
          palette={palette}
          extraClass="border-l-4"
        >
          {items ? (
            <ul className={cn("space-y-2 text-base leading-snug", palette.text)}>
              {items.map((item, idx) => (
                <li key={`case-${idx}`} className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-2 h-1.5 w-1.5 flex-none rounded-full",
                      isDarkPalette(palette) ? "bg-white" : "bg-[#3ea9ff]"
                    )}
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={cn("text-base leading-relaxed", palette.text)}>{text}</p>
          )}
        </BlockShell>
      );

    case "warning":
      return (
        <div className="rounded-xl border-l-4 border-amber-400 bg-amber-50 px-5 py-4 text-amber-900 shadow-sm print-keep-color">
          {block.title && (
            <p className="font-heading text-[10px] uppercase tracking-[0.3em] text-amber-800">
              {block.title}
            </p>
          )}
          <p className="mt-1.5 text-base leading-relaxed">
            {Array.isArray(block.content) ? block.content.join(" · ") : block.content}
          </p>
        </div>
      );

    case "exercise":
      return (
        <BlockShell title={block.title ?? "Exercice"} palette={palette}>
          <p className={cn("text-base leading-relaxed", palette.text)}>
            {Array.isArray(block.content) ? block.content.join(" · ") : block.content}
          </p>
        </BlockShell>
      );

    case "text":
    default:
      return (
        <BlockShell title={block.title} palette={palette}>
          <p className={cn("text-base leading-relaxed", palette.text)}>
            {Array.isArray(block.content) ? block.content.join(" · ") : block.content}
          </p>
        </BlockShell>
      );
  }
}

function BlockShell({
  title,
  palette,
  extraClass,
  children,
}: {
  title: string | null;
  palette: Palette;
  extraClass?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-5 print-keep-color",
        palette.blockSurface,
        palette.blockBorder,
        extraClass
      )}
    >
      {title && (
        <p
          className={cn(
            "mb-3 font-heading text-[11px] font-semibold uppercase tracking-[0.3em]",
            palette.subtleText
          )}
        >
          {title}
        </p>
      )}
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Re-exports & TrainerNoteCard
// ---------------------------------------------------------------------------

export type DesignedSlideRenderable = DesignedSlide;
export type DesignedSlideBlockType = ContentBlockType;

/**
 * Notes formateur — composant compagnon affiché HORS slide (sur la
 * page web). N'apparaît pas dans le cadre 16:9 pour préserver l'aspect
 * "présentation".
 */
export function TrainerNoteCard({
  slide,
  className,
}: {
  slide: DesignedSlide;
  className?: string;
}) {
  if (!slide.trainerNote) return null;
  return (
    <div
      className={cn(
        "rounded-md border border-[#00527a]/15 bg-[#eaf5ff]/40 px-4 py-2.5 text-xs text-[#00527a]",
        className
      )}
    >
      <span className="font-heading text-[10px] font-semibold uppercase tracking-[0.3em] text-[#00527a]/70">
        Note formateur
      </span>
      <p className="mt-1 text-sm text-foreground/85">{slide.trainerNote}</p>
    </div>
  );
}
