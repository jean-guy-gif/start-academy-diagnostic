import type { AccessType } from "./access-types";

/**
 * Modèles d'email pour les liens publics.
 *
 * Pas de dépendance Supabase, pas de secret — module pur, utilisable
 * côté client (fiche session interne, génération mailto).
 *
 * Aucun envoi automatique pour le MVP : on retourne un (subject, body)
 * que le commercial copie ou ouvre dans son client mail via `mailto:`.
 */

export interface EmailTemplateInputs {
  fullUrl: string;
  accessType: AccessType;
  recipientEmail: string | null;
  recipientName: string | null;
  clientName: string | null;
  senderName: string | null;
  senderEmail: string | null;
  proposalTitle: string | null;
}

export interface BuiltEmailTemplate {
  to: string | null;
  subject: string;
  body: string;
}

function greeting(name: string | null): string {
  if (!name || !name.trim()) return "Bonjour,";
  return `Bonjour ${name.trim()},`;
}

function signature(
  senderName: string | null,
  senderEmail: string | null
): string {
  if (senderName?.trim()) {
    const lines = [senderName.trim(), "Start Academy"];
    if (senderEmail?.trim()) lines.push(senderEmail.trim());
    return lines.join("\n");
  }
  return "L'équipe Start Academy";
}

function confidentialityLine(): string {
  return "Ce lien est strictement personnel et confidentiel — merci de ne pas le partager hors de votre équipe.";
}

function clientLine(clientName: string | null): string {
  return clientName ? `Pour : ${clientName}` : "";
}

function proposalLine(proposalTitle: string | null): string {
  return proposalTitle ? `Programme : ${proposalTitle}` : "";
}

function buildClientEmail(inputs: EmailTemplateInputs): BuiltEmailTemplate {
  const lines = [
    greeting(inputs.recipientName),
    "",
    "Suite à notre rendez-vous, voici votre espace dirigeant Start Academy.",
    "Vous y retrouverez :",
    "  · le programme de formation préparé pour votre équipe,",
    "  · les prochaines étapes pour démarrer,",
    "  · ce que Start Academy va produire.",
    "",
    `Votre lien sécurisé : ${inputs.fullUrl}`,
    "",
    proposalLine(inputs.proposalTitle),
    clientLine(inputs.clientName),
    "",
    confidentialityLine(),
    "",
    "À votre disposition pour toute question.",
    "",
    signature(inputs.senderName, inputs.senderEmail),
  ]
    .filter((l) => l !== null && l !== undefined)
    .join("\n");

  return {
    to: inputs.recipientEmail,
    subject: inputs.proposalTitle
      ? `Votre parcours Start Academy — ${inputs.proposalTitle}`
      : "Votre parcours de formation Start Academy",
    body: lines,
  };
}

function buildParticipantEmail(
  inputs: EmailTemplateInputs
): BuiltEmailTemplate {
  const lines = [
    greeting(inputs.recipientName),
    "",
    "Pour préparer la formation Start Academy, nous avons besoin de quelques informations de votre part.",
    "Cela prend environ 5 minutes — vous pourrez compléter plus tard si besoin.",
    "",
    `Votre lien sécurisé : ${inputs.fullUrl}`,
    "",
    "À renseigner :",
    "  · votre niveau et vos outils,",
    "  · votre objectif personnel et un cas concret,",
    "  · vos pièces administratives (CNI, RIB, attestation CFP si applicable).",
    "",
    proposalLine(inputs.proposalTitle),
    clientLine(inputs.clientName),
    "",
    confidentialityLine(),
    "",
    "Merci pour votre préparation.",
    "",
    signature(inputs.senderName, inputs.senderEmail),
  ]
    .filter((l) => l !== null && l !== undefined)
    .join("\n");

  return {
    to: inputs.recipientEmail,
    subject: inputs.proposalTitle
      ? `Préparation formation Start Academy — ${inputs.proposalTitle}`
      : "Préparation de votre formation Start Academy",
    body: lines,
  };
}

function buildTrainerEmail(
  inputs: EmailTemplateInputs
): BuiltEmailTemplate {
  const lines = [
    greeting(inputs.recipientName),
    "",
    "Voici l'espace formateur Start Academy pour la session à animer.",
    "Vous y retrouverez :",
    "  · le diagnostic et la recommandation,",
    "  · les cas concrets remontés par les participants,",
    "  · le support pédagogique et le déroulé designé.",
    "",
    `Votre lien sécurisé : ${inputs.fullUrl}`,
    "",
    proposalLine(inputs.proposalTitle),
    clientLine(inputs.clientName),
    "",
    confidentialityLine(),
    "",
    "Bonne préparation,",
    "",
    signature(inputs.senderName, inputs.senderEmail),
  ]
    .filter((l) => l !== null && l !== undefined)
    .join("\n");

  return {
    to: inputs.recipientEmail,
    subject: inputs.proposalTitle
      ? `Session Start Academy à animer — ${inputs.proposalTitle}`
      : "Votre session Start Academy à animer",
    body: lines,
  };
}

export function buildEmailTemplate(
  inputs: EmailTemplateInputs
): BuiltEmailTemplate {
  switch (inputs.accessType) {
    case "client_session_view":
      return buildClientEmail(inputs);
    case "participant_collect":
      return buildParticipantEmail(inputs);
    case "trainer_session_view":
      return buildTrainerEmail(inputs);
  }
}

/**
 * Construit l'URL `mailto:` correspondante (subject + body encodés).
 */
export function buildMailtoUrl(template: BuiltEmailTemplate): string {
  const params = new URLSearchParams();
  if (template.subject) params.set("subject", template.subject);
  if (template.body) params.set("body", template.body);
  const recipient = template.to ?? "";
  return `mailto:${encodeURIComponent(recipient)}?${params.toString()}`;
}
