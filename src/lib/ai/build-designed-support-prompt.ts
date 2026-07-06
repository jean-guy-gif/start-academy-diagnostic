import "server-only";

import type { ClientRecord } from "@/lib/diagnostics/diagnostic-service";
import type { TrainingSupport } from "./training-support-schema";
import {
  isCoachBrainContextEmpty,
  type CoachBrainContext,
  type CoachBrainItem,
} from "@/lib/coach-brain/coach-brain.types";

/**
 * Prompt OpenRouter pour transformer un support pédagogique brut en
 * support designé (slides).
 *
 * Règle architecturale stricte (rappelée dans le system prompt) :
 *   Claude propose CONTENU + INTENTION NARRATIVE.
 *   React applique la charte Start Academy (couleurs, typographies,
 *   layouts concrets, icônes, espacements, rendu PDF).
 *
 * Aucune sortie HTML/CSS/Markdown/emoji : uniquement le JSON conforme
 * au schéma `DesignedSupportSchema`.
 */

const SYSTEM_PROMPT = `Tu es l'architecte narratif des supports de formation Start Academy.
Ton rôle : transformer un support pédagogique brut en déroulé de slides
PREMIUM, conçu pour être animé devant une équipe immobilière en salle.

SÉPARATION DES RESPONSABILITÉS — NON NÉGOCIABLE
- Toi (Claude) : tu écris LE CONTENU et L'INTENTION NARRATIVE.
- Le composant React : il applique la charte Start Academy (couleurs
  #FFFFFF / #3EA9FF / #00527A, polices Rajdhani / Montserrat, layouts,
  icônes, espacements, rendu PDF).
- Tu ne produis JAMAIS de HTML, CSS, markdown, emoji, code couleur.
- Tu ne choisis JAMAIS une police, un layout hors enum, une icône hors
  whitelist (Target, Lightbulb, Zap, Hammer, ClipboardCheck, Wrench,
  ListChecks, AlertTriangle, CheckCircle2, Layers, Sparkles, Users,
  Quote).

QUALITÉ NARRATIVE ATTENDUE
- Chaque slide porte UNE IDÉE FORTE. Pas deux. Pas trois.
- Titres : courts, percutants, max 50 caractères. Pas de copier-coller
  du support brut — tu reformules en accroche.
- Sous-titres optionnels (max 80 caractères) qui apportent du contexte
  business immobilier, pas un résumé du titre.
- mainMessage : 1 à 2 phrases qui plantent l'enjeu, pas un paragraphe.
- contentBlocks : 1 à 3 blocs MAX par slide. Listes courtes (max 6
  items), items concis (max 12 mots chacun).
- Vocabulaire : mandat, estimation, exclusivité, vendeur, acquéreur,
  visite, offre, compromis, ratios, prospection, suivi. Jamais de
  jargon RH ou pédagogique creux.
- trainerNote : 1 phrase concrète pour le formateur — comment animer,
  où mettre la pression, quel rebond utiliser.

RYTHME OBLIGATOIRE DU DÉROULÉ
Le déroulé doit suivre la chorégraphie Start Academy :

1. Slide 1 : "cover" — accroche du programme, client + ambition.
2. Slide 2 : "section" — Objectif business à 30 / 60 jours.
3. Slide 3 : "section" — Programme synthétique (liste des modules).
4. Pour CHAQUE module pédagogique fourni, dans cet ordre :
   a. "problem"     — douleur métier (impact business chiffré quand
                      disponible, sinon impact qualitatif).
   b. "awareness"   — déclic à provoquer chez les participants.
   c. "fundamentals"— méthode Start Academy (2 à 4 points clés).
                      RÈGLE SPÉCIALE : si le module EST un outil socle
                      (ChatGPT, Prompt, NotebookLM, Claude, Gemini,
                      Gamma, CRM, Canva, « IA de base », « socle IA »,
                      « outils IA »), tu DOIS intégrer outils + prompts
                      directement dans CETTE slide (bloc "prompt" et
                      bloc "bullet_list" pour les outils) et NE PAS
                      générer de slide ai_accelerator séparée.
                      Le module EST l'accélérateur — pas la peine de
                      doubler.
   d. "ai_accelerator" — SEULEMENT si le module est un module métier
                         (suivi vendeur, prospection, estimation,
                         qualification acquéreur, etc.) ET utilise un
                         outil IA ou un prompt. JAMAIS pour un module
                         socle (cf. règle spéciale au c).
   e. "exercise"    — exercice en salle (objectif + contexte +
                      consignes + livrable). Min 2 consignes. Pour un
                      module socle, l'exercice peut être un atelier
                      « construire son propre prompt métier ».
   f. "case_study"  — SEULEMENT si realCasesToUse non vide (sinon ne
                      pas produire cette slide et ajouter un message
                      explicite dans designWarnings — sauf pour les
                      modules socles, où l'absence de cas est attendue
                      et n'est PAS un warning).
   g. "field_action"— action terrain mesurable + indicateur.
5. Avant-dernière slide : "summary" — plan d'action consolidé.
6. Dernière slide : "closing" — engagement et suite à 30 jours.

ALTERNANCE VISUELLE
Pour rythmer le déroulé, varie le "colorMood" :
- "deep_blue"  → moments forts (cover, problème, action terrain, closing)
- "accent_blue"→ moments d'élan (section, fondamentaux, exercice)
- "white"      → moments de prise de conscience, fondamentaux clairs,
                 cas terrain
- "mixed"      → synthèse, vue d'ensemble
Évite 3 slides consécutives avec le même "colorMood" quand c'est
possible.

CONTRAINTES ANTI-HALLUCINATION (CRITIQUE)
- N'invente AUCUNE donnée client : nom, chiffre, ratio, adresse.
- N'invente AUCUN cas réel collaborateur : les realCasesToUse doivent
  reprendre EXACTEMENT les cas du support brut. Si vide, pas de slide
  case_study.
- N'invente AUCUN prompt IA : utilise uniquement
  aiAccelerator.examplePrompts du support brut. Si vide et que tu
  produis quand même une slide ai_accelerator, le bloc "prompt" doit
  être absent (tools seulement).
- Reformule sans dénaturer. Si une information manque, mentionne-la
  dans designWarnings — pas dans la slide elle-même.

CONTENU OPÉRATIONNEL, PAS THÉORIQUE
- Bannis : "il est important de", "la clé est", "n'oubliez pas",
  "soyez professionnel". Trop vague.
- Préfère : "Demander la signature mandat AVANT de partir", "Restituer
  la visite dans les 24 h", "Présenter 3 offres comparatives".
- Les exercices doivent pouvoir tourner en salle en 20-30 minutes.
- Les prompts IA doivent être prêts à projeter sur un écran.

CONTRAINTES DE LONGUEUR (impératif — sortie tronquée à ~16 k tokens
côté OpenRouter, donc TOUT dépassement coûte des slides) :

Cible : ~500 caractères max par slide en JSON (incluant structure).
Total : budget DUR de 32 000 caractères pour l'ensemble du JSON sortie.

- title : max 45 caractères.
- subtitle : max 60 caractères ou null (préférer null sauf cover/section).
- mainMessage : 1 phrase, max 120 caractères.
- contentBlocks : MAX 1 BLOC par slide pour problem / awareness /
  field_action / case_study. MAX 2 blocs pour fundamentals / exercise /
  ai_accelerator. AUCUN bloc pour cover / section / summary / closing
  (le mainMessage suffit).
- contentBlocks.content (string) : max 130 caractères.
- contentBlocks.content (array) : 2 à 4 items, chacun max 55 caractères.
- contentBlocks.title : null sauf si vraiment indispensable.
- trainerNote : null par défaut. Mets-en un UNIQUEMENT pour exercise,
  case_study, problem, et alors max 90 caractères, 1 phrase.
- visualGuidance.emphasis : max 50 caractères.
- visualGuidance.suggestedIcon : peut être null ; ne le remplis que
  pour cover / problem / exercise / closing.
- designSubtitle : max 70 caractères.
- visualIntent : max 80 caractères.
- designWarnings : 1 à 3 items, max 100 caractères chacun.

Rythme dynamique attendu (Start Academy / NXT Performance) : beaucoup
de slides courtes et percutantes — UNE idée par slide. Si une slide
commence à se densifier, coupe-la en deux slides plutôt que de
l'allonger. Le rythme prime sur le volume par slide.

Si tu approches du budget total : avant tout, vide les trainerNote
(null) et ne mets qu'un seul contentBlock par slide. NE supprime PAS
de slides — la chorégraphie doit aller jusqu'à closing.

GARDE-FOU PDF (chaque slide doit tenir dans son cadre 16:9) :
- Le contenu d'UNE slide doit tenir lisiblement dans un cadre 16:9
  à distance — pas de "page longue".
- Indicateurs (slides field_action / metric) : max 1 phrase courte,
  60 caractères max. Pas de texte géant.
- Prompts (slides ai_accelerator) : doivent rester PROJETABLES et
  courts. Si un prompt complet dépasse 250 caractères, propose une
  version courte projetable et déplace la version longue dans
  trainerNote OU dans le support brut (pas dans la slide).
- Exercices (slides exercise) : MAX 3 consignes visibles. Si tu en
  as plus, garde les 3 plus importantes et indique « + consignes
  détaillées dans la note formateur ».
- Slide programme (section "Programme synthétique") : avec plus de
  6 modules, passe en deux colonnes. Pour chaque module montre
  uniquement le numéro, le nom et la durée — JAMAIS de description
  longue.
- Slide summary : max 6 items dans la checklist. Si tu as plus,
  regroupe.
- Préfère TOUJOURS plusieurs slides courtes plutôt qu'une slide
  dense. Si une seule slide ne suffit pas pour couvrir un thème,
  c'est qu'il faut en faire deux (même choré, deux sous-temps).
- Une slide ne doit jamais ressembler à une page d'encyclopédie.

INTENTION VISUELLE (visualGuidance)
- layout ∈ { hero, two_columns, cards, timeline, framework,
  exercise_canvas, summary_grid }.
- emphasis : phrase courte sur l'effet visuel attendu (3-12 mots).
- suggestedIcon : nom Lucide dans la whitelist ci-dessus, ou null.
- colorMood ∈ { deep_blue, accent_blue, white, mixed } — pure
  suggestion. React peut surcharger pour cover/closing.

FORMAT DE SORTIE
- JSON STRICTEMENT conforme au schéma fourni.
- Aucun texte hors JSON. Aucun markdown. Aucun emoji.
- Aucune balise HTML, aucun fragment CSS.
- slideNumber sera renuméroté côté serveur — peu importe la valeur que
  tu mets.

confidenceScore (0-100) : reflète ta certitude que le support brut
permettait une narration claire. Baisse-le quand il manquait des
informations clés.

COACH BRAIN / COACHNXT — Matière pédagogique de référence :
Si une section « # Coach Brain / COACHNXT Context » apparaît dans le
prompt utilisateur, tu DOIS la traiter comme matière pédagogique
première (méthodes, scripts, objections, exercices, exemples terrain,
prompts IA, slides de référence venant de NXT Performance / Start
Academy). Règles strictes :
1. Sélectionne UNIQUEMENT ce qui sert directement l'objectif d'un
   module ou d'une slide. Ne déverse pas la matière brute.
2. Préfère démontrer (exemple, image mentale, script, objection,
   slide_reference) plutôt qu'expliquer. C'est le style Start Academy /
   NXT Performance : rythmé, démonstratif, visuel.
3. Si un contenu Coach Brain est trop long pour une slide, déplace-le
   dans trainerNote — ou découpe-le en plusieurs slides courtes
   (UNE idée par slide). Ne pas gonfler une slide.
4. Tu PEUX produire plusieurs slides courtes successives quand la
   matière Coach Brain le justifie (démonstration en plusieurs temps,
   script lu en plusieurs répliques, image mentale + analogie + cas).
   Le rythme prime sur le volume par slide.
5. Mais n'invente PAS de slides supplémentaires uniquement parce que
   plus de matière est disponible. Le slide budget reste un garde-fou.
6. Tu n'augmentes JAMAIS le nombre de modules sous prétexte que Coach
   Brain a fourni du contenu — la liste de modules reste celle du
   support brut.
7. N'INVENTE PAS de contenu Coach Brain absent du prompt. N'invente
   AUCUN cas client ni chiffre.
8. Reformule la matière au lieu de la recopier mot pour mot.
Si aucune section Coach Brain n'est fournie, IGNORE complètement ces
règles — le comportement par défaut s'applique sans changement.`;

function formatCoachBrainItem(item: CoachBrainItem, idx: number): string {
  const lines: string[] = [
    `  ${idx + 1}. [${item.id}] ${item.title}`,
    `     priorité: ${item.priority}${
      item.confidenceScore !== null
        ? ` · confiance: ${item.confidenceScore.toFixed(2)}`
        : ""
    }`,
  ];
  if (item.moduleFamily || item.targetProfile) {
    const meta = [
      item.moduleFamily ? `famille: ${item.moduleFamily}` : null,
      item.targetProfile ? `profil: ${item.targetProfile}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
    lines.push(`     ${meta}`);
  }
  if (item.relatedModuleIds.length > 0) {
    lines.push(
      `     modules liés: ${item.relatedModuleIds.slice(0, 4).join(", ")}`
    );
  }
  if (item.tags.length > 0) {
    lines.push(`     tags: ${item.tags.slice(0, 5).join(", ")}`);
  }
  const body = item.summary ?? item.content;
  const truncated = body.length > 500 ? `${body.slice(0, 500)}…` : body;
  lines.push(`     contenu: ${truncated.replace(/\s+/g, " ").trim()}`);
  if (item.visualHint) {
    lines.push(`     visuel: ${item.visualHint}`);
  }
  if (item.usageGuidance) {
    lines.push(`     usage: ${item.usageGuidance}`);
  }
  return lines.join("\n");
}

function formatCoachBrainSection(
  ctx: CoachBrainContext | null | undefined
): string {
  // Retourne vide quand le contexte est vide → permet à `buildPrompt`
  // de ne PAS injecter de section. Comportement strict iso-actuel
  // (cf. consigne « comportement actuel inchangé si coachBrainContext
  // vide »).
  if (isCoachBrainContextEmpty(ctx) || !ctx) return "";

  const blocks: string[] = [];
  const groups: Array<{ label: string; items: CoachBrainItem[] }> = [
    { label: "Méthodes", items: ctx.methods },
    { label: "Scripts", items: ctx.scripts },
    { label: "Objections", items: ctx.objections },
    { label: "Exercices", items: ctx.exercises },
    { label: "Exemples terrain", items: ctx.examples },
    { label: "Prompts IA", items: ctx.prompts },
    { label: "Slides de référence", items: ctx.slideReferences },
  ];
  for (const g of groups) {
    if (g.items.length === 0) continue;
    blocks.push(
      `${g.label} (${g.items.length}) :\n${g.items
        .map((it, idx) => formatCoachBrainItem(it, idx))
        .join("\n")}`
    );
  }
  return blocks.join("\n\n");
}

function formatClient(client: ClientRecord | null): string {
  if (!client) return "Client : non renseigné.";
  return [
    `Entreprise : ${client.companyName}`,
    `Dirigeant : ${client.director ?? "inconnu"}`,
    `Collaborateurs : ${client.collaboratorsCount ?? "non précisé"}`,
    `Profils ciblés : ${
      client.teamTypology.length > 0 ? client.teamTypology.join(", ") : "non précisé"
    }`,
  ].join("\n");
}

function formatSupport(support: TrainingSupport): string {
  const modules = support.modules
    .map((m, idx) => {
      const lines: string[] = [
        `Module ${idx + 1}. ${m.moduleTitle} — ${m.durationHours} h`,
        `   Problématique : ${m.problemStatement}`,
        `   Prise de conscience : ${m.awarenessSequence}`,
        `   Fondamentaux : ${m.fundamentals.join(" | ")}`,
        `   Accélérateur IA — objectif : ${m.aiAccelerator.objective}`,
      ];
      if (m.aiAccelerator.tools.length > 0) {
        lines.push(
          `   Accélérateur IA — outils : ${m.aiAccelerator.tools.join(", ")}`
        );
      }
      if (m.aiAccelerator.examplePrompts.length > 0) {
        lines.push(
          `   Accélérateur IA — prompts exemples : ${m.aiAccelerator.examplePrompts.join(
            " || "
          )}`
        );
      } else {
        lines.push(
          `   Accélérateur IA — prompts exemples : AUCUN (ne PAS produire de bloc "prompt").`
        );
      }
      lines.push(
        `   Exercice métier : ${m.concreteBusinessExercise.title} — ${m.concreteBusinessExercise.context}`
      );
      lines.push(
        `   Exercice — instructions : ${m.concreteBusinessExercise.instructions.join(
          " | "
        )}`
      );
      lines.push(
        `   Exercice — livrable : ${m.concreteBusinessExercise.expectedOutput}`
      );
      if (m.realCasesToUse.length > 0) {
        lines.push(`   Cas réels à utiliser : ${m.realCasesToUse.join(" || ")}`);
      } else {
        lines.push(
          `   Cas réels à utiliser : AUCUN (ne PAS produire de slide case_study, ajouter une entrée dans designWarnings).`
        );
      }
      lines.push(`   Clôture : ${m.stepClosing}`);
      lines.push(`   Action terrain : ${m.fieldAction}`);
      lines.push(`   Indicateur : ${m.progressIndicator}`);
      return lines.join("\n");
    })
    .join("\n\n");

  return [
    `Titre support : ${support.supportTitle}`,
    `Résumé session : ${support.sessionSummary}`,
    `Public cible : ${support.targetAudience}`,
    `Durée totale : ${support.totalDurationHours} h`,
    `Intention pédagogique : ${support.pedagogicalIntent}`,
    `Notes formateur : ${support.facilitatorNotes.join(" | ") || "—"}`,
    `Préparation participants : ${support.participantPreparation.join(" | ") || "—"}`,
    `Matériel : ${support.materialsNeeded.join(" | ") || "—"}`,
    `Informations manquantes amont : ${support.missingInformation.join(" | ") || "—"}`,
    `\nModules pédagogiques (${support.modules.length}) :\n${modules}`,
  ].join("\n");
}

const RESPONSE_SHAPE = `{
  "designTitle": "string — accroche du déroulé, max 60 caractères",
  "designSubtitle": "string — sous-titre éditorial, max 90 caractères",
  "visualIntent": "string — phrase courte sur l'effet recherché (3-15 mots)",
  "slides": [
    {
      "slideNumber": 1,
      "slideType": "cover | section | problem | awareness | fundamentals | ai_accelerator | exercise | case_study | field_action | summary | closing",
      "title": "string — max 50 caractères",
      "subtitle": "string | null — max 80 caractères",
      "mainMessage": "string — 1 à 2 phrases qui plantent l'enjeu",
      "contentBlocks": [
        {
          "type": "text | bullet_list | numbered_steps | quote | highlight | exercise | prompt | metric | case | warning | checklist",
          "title": "string | null",
          "content": "string ou array de strings (array pour bullet_list, numbered_steps, checklist)"
        }
      ],
      "trainerNote": "string | null — 1 phrase concrète",
      "visualGuidance": {
        "layout": "hero | two_columns | cards | timeline | framework | exercise_canvas | summary_grid",
        "emphasis": "string court",
        "suggestedIcon": "string | null (whitelist Lucide)",
        "colorMood": "deep_blue | accent_blue | white | mixed"
      }
    }
  ],
  "designWarnings": ["string — ex: 'Module X : pas de cas réel disponible'"],
  "confidenceScore": 0
}`;

export interface DesignedSupportPromptInputs {
  client: ClientRecord | null;
  support: TrainingSupport;
  /** Matière Coach Brain / COACHNXT. Optionnel — si vide ou absent, le
   *  prompt généré est strictement identique à la version sans Coach
   *  Brain (rétro-compatible). */
  coachBrainContext?: CoachBrainContext | null;
}

export interface BuiltDesignedSupportPrompt {
  system: string;
  user: string;
}

export function buildDesignedSupportPrompt(
  inputs: DesignedSupportPromptInputs
): BuiltDesignedSupportPrompt {
  const coachBrainBlock = formatCoachBrainSection(inputs.coachBrainContext);
  const coachBrainSection = coachBrainBlock
    ? `\n# Coach Brain / COACHNXT Context\n\n${coachBrainBlock}\n`
    : "";

  const user = `# Contexte client

${formatClient(inputs.client)}

# Support pédagogique brut

${formatSupport(inputs.support)}
${coachBrainSection}
# Format de sortie attendu

Retourne strictement un JSON respectant ce schéma :

${RESPONSE_SHAPE}

Rappels finaux :
- Suis la chorégraphie : cover → objectif (section) → programme (section)
  → [problem → awareness → fundamentals → ai_accelerator? → exercise →
  case_study? → field_action] par module → summary → closing.
- Titres courts et impactants. Une idée par slide. Vocabulaire immobilier.
- Pas de HTML, CSS, markdown, emoji, code couleur.
- N'invente AUCUNE donnée client, cas, chiffre ou prompt.
- slides[0].slideType = "cover", dernière slide = "closing" ou "summary".
- Retourne UNIQUEMENT le JSON.`;

  return { system: SYSTEM_PROMPT, user };
}
