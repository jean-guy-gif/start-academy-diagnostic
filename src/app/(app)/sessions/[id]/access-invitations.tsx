"use client";

import { useMemo, useState } from "react";
import {
  ClipboardCheck,
  Copy,
  ExternalLink,
  Mail,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ACCESS_TYPES,
  type AccessType,
} from "@/lib/public-access/access-types";
import {
  buildEmailTemplate,
  buildMailtoUrl,
} from "@/lib/public-access/email-templates";

interface Props {
  sessionId: string;
  clientName?: string | null;
  proposalTitle?: string | null;
  senderName?: string | null;
  senderEmail?: string | null;
}

interface GeneratedLink {
  id: string | null;
  url: string;
  fullUrl: string;
  accessType: AccessType;
  expiresAt: string | null;
  recipient: string;
  recipientEmail: string | null;
  recipientName: string | null;
}

const ACCESS_LABEL: Record<AccessType, { title: string; description: string }> =
  {
    client_session_view: {
      title: "Lien dirigeant",
      description:
        "Le dirigeant consulte sa proposition, le statut et les prochaines étapes. Lecture seule. Aucune saisie de diagnostic possible.",
    },
    participant_collect: {
      title: "Lien collecte collaborateurs",
      description:
        "Lien à transmettre aux collaborateurs pour qu'ils renseignent leur préparation. Une soumission par adresse email.",
    },
    trainer_session_view: {
      title: "Lien formateur",
      description:
        "Le formateur consulte le diagnostic, la recommandation, les participants et les cas concrets. Lecture seule.",
    },
  };

export function AccessInvitations({
  sessionId,
  clientName,
  proposalTitle,
  senderName,
  senderEmail,
}: Props) {
  return (
    <Card className="border-border/60 bg-white">
      <CardHeader>
        <CardTitle className="font-heading text-xl text-[#00527a]">
          Accès & invitations
        </CardTitle>
        <CardDescription>
          Générez un lien dédié pour chaque destinataire. Aucun email
          n&apos;est envoyé automatiquement pour le moment — copiez le lien
          et transmettez-le par votre canal habituel, ou ouvrez votre
          messagerie pré-remplie en un clic.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {ACCESS_TYPES.map((type) => (
          <AccessTypeBlock
            key={type}
            sessionId={sessionId}
            accessType={type}
            clientName={clientName ?? null}
            proposalTitle={proposalTitle ?? null}
            senderName={senderName ?? null}
            senderEmail={senderEmail ?? null}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function AccessTypeBlock({
  sessionId,
  accessType,
  clientName,
  proposalTitle,
  senderName,
  senderEmail,
}: {
  sessionId: string;
  accessType: AccessType;
  clientName: string | null;
  proposalTitle: string | null;
  senderName: string | null;
  senderEmail: string | null;
}) {
  const { title, description } = ACCESS_LABEL[accessType];

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [expiresInDays, setExpiresInDays] = useState<string>("30");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<GeneratedLink | null>(null);
  const [copied, setCopied] = useState(false);

  async function onGenerate() {
    setBusy(true);
    setError(null);
    setGenerated(null);
    setCopied(false);

    try {
      const expires = Number(expiresInDays);
      const body = {
        accessType,
        recipientEmail: email.trim() || null,
        recipientName: name.trim() || null,
        expiresInDays:
          Number.isFinite(expires) && expires > 0 ? expires : null,
      };

      const res = await fetch(
        `/api/sessions/${encodeURIComponent(sessionId)}/create-access-link`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );

      const json = (await res.json().catch(() => ({}))) as {
        id?: string;
        url?: string;
        accessType?: AccessType;
        expiresAt?: string | null;
        error?: string;
      };

      if (!res.ok || !json.url || !json.accessType) {
        setError(json.error ?? "Génération impossible.");
        return;
      }

      const origin =
        typeof window !== "undefined" ? window.location.origin : "";
      setGenerated({
        id: json.id ?? null,
        url: json.url,
        fullUrl: `${origin}${json.url}`,
        accessType: json.accessType,
        expiresAt: json.expiresAt ?? null,
        recipient: email || name || "—",
        recipientEmail: email.trim() || null,
        recipientName: name.trim() || null,
      });
    } catch {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function onCopy() {
    if (!generated || typeof navigator === "undefined") return;
    try {
      await navigator.clipboard.writeText(generated.fullUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard refusé — on laisse l'utilisateur copier à la main */
    }
  }

  const emailTemplate = useMemo(() => {
    if (!generated) return null;
    return buildEmailTemplate({
      fullUrl: generated.fullUrl,
      accessType: generated.accessType,
      recipientEmail: generated.recipientEmail,
      recipientName: generated.recipientName,
      clientName,
      senderName,
      senderEmail,
      proposalTitle,
    });
  }, [generated, clientName, senderName, senderEmail, proposalTitle]);

  const [messageCopied, setMessageCopied] = useState(false);

  async function onCopyMessage() {
    if (!emailTemplate || typeof navigator === "undefined") return;
    try {
      const text = `${emailTemplate.subject}\n\n${emailTemplate.body}`;
      await navigator.clipboard.writeText(text);
      setMessageCopied(true);
      setTimeout(() => setMessageCopied(false), 2000);
    } catch {
      /* clipboard refusé — l'utilisateur copiera à la main */
    }
  }

  type GmailState =
    | { kind: "idle" }
    | { kind: "creating" }
    | { kind: "not_configured"; message: string }
    | { kind: "error"; message: string }
    | { kind: "success"; draftId: string; draftUrl: string | null };

  const [gmailState, setGmailState] = useState<GmailState>({ kind: "idle" });
  const gmailButtonEnabled = Boolean(
    emailTemplate &&
      generated &&
      generated.recipientEmail &&
      gmailState.kind !== "creating"
  );

  async function onCreateGmailDraft() {
    if (!emailTemplate || !generated || !generated.recipientEmail) return;
    setGmailState({ kind: "creating" });
    try {
      const res = await fetch("/api/email/create-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: generated.recipientEmail,
          subject: emailTemplate.subject,
          body: emailTemplate.body,
          accessLinkId: generated.id ?? null,
          sessionId,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        code?: string;
        message?: string;
        draftId?: string;
        draftUrl?: string | null;
      };

      if (json.ok && json.draftId) {
        setGmailState({
          kind: "success",
          draftId: json.draftId,
          draftUrl: json.draftUrl ?? null,
        });
        return;
      }

      if (json.code === "not_configured" || json.code === "not_implemented") {
        setGmailState({
          kind: "not_configured",
          message:
            json.message ??
            "Gmail n'est pas encore configuré. Utilisez Copier le message ou Ouvrir dans mon mail.",
        });
        return;
      }

      setGmailState({
        kind: "error",
        message: json.message ?? "Création du brouillon impossible.",
      });
    } catch {
      setGmailState({
        kind: "error",
        message: "Erreur réseau. Réessayez.",
      });
    }
  }

  return (
    <div className="rounded-md border border-border/60 bg-muted/10 p-4">
      <div className="mb-3">
        <h3 className="font-heading text-sm font-semibold text-[#00527a]">
          {title}
        </h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label
            htmlFor={`email-${accessType}`}
            className="text-xs text-muted-foreground"
          >
            Email destinataire (optionnel)
          </Label>
          <Input
            id={`email-${accessType}`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="dirigeant@client.fr"
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label
            htmlFor={`name-${accessType}`}
            className="text-xs text-muted-foreground"
          >
            Nom destinataire (optionnel)
          </Label>
          <Input
            id={`name-${accessType}`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Catherine"
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label
            htmlFor={`expires-${accessType}`}
            className="text-xs text-muted-foreground"
          >
            Expiration (jours)
          </Label>
          <Input
            id={`expires-${accessType}`}
            type="number"
            min={1}
            max={365}
            value={expiresInDays}
            onChange={(e) => setExpiresInDays(e.target.value)}
            className="h-9"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <Button
          type="button"
          onClick={onGenerate}
          disabled={busy}
          size="sm"
          className="bg-[#00527a] text-white hover:bg-[#00527a]/90"
        >
          <Send className="h-3.5 w-3.5" />
          {busy ? "Génération…" : "Générer le lien"}
        </Button>
      </div>

      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
        >
          {error}
        </p>
      ) : null}

      {generated ? (
        <div className="mt-3 space-y-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-xs">
          <p className="font-medium text-emerald-900">
            Lien généré pour {generated.recipient}. Il ne s&apos;affichera
            qu&apos;une seule fois — copiez-le maintenant.
          </p>
          <div className="rounded-md border border-emerald-200 bg-white px-2 py-1.5 font-mono text-[11px] text-foreground/80 break-all">
            {generated.fullUrl}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onCopy}
              className="h-8 px-3 text-xs"
            >
              {copied ? (
                <>
                  <ClipboardCheck className="h-3.5 w-3.5" />
                  Copié
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copier le lien
                </>
              )}
            </Button>
            <a
              href={generated.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-[#00527a] hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Ouvrir dans un nouvel onglet
            </a>
            {generated.expiresAt ? (
              <span className="ml-auto text-[11px] text-muted-foreground">
                Expire le {new Date(generated.expiresAt).toLocaleDateString()}
              </span>
            ) : null}
          </div>

          {emailTemplate ? (
            <div className="mt-3 space-y-2 border-t border-emerald-200 pt-3">
              <p className="text-[11px] font-medium uppercase tracking-wider text-emerald-800">
                Modèle d&apos;email prêt à envoyer
              </p>
              <div className="rounded-md border border-emerald-200 bg-white px-2 py-1.5 text-[11px] text-foreground/80">
                <p className="font-medium">{emailTemplate.subject}</p>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-[11px] text-foreground/70">
                  {emailTemplate.body}
                </pre>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onCopyMessage}
                  className="h-8 px-3 text-xs"
                >
                  {messageCopied ? (
                    <>
                      <ClipboardCheck className="h-3.5 w-3.5" />
                      Message copié
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copier le message
                    </>
                  )}
                </Button>
                <a
                  href={buildMailtoUrl(emailTemplate)}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-[#00527a]/30 bg-white px-3 text-xs text-[#00527a] hover:bg-[#eaf5ff]"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Ouvrir dans mon mail
                </a>
                <button
                  type="button"
                  onClick={onCreateGmailDraft}
                  disabled={!gmailButtonEnabled}
                  title={
                    !generated?.recipientEmail
                      ? "Renseignez un email destinataire pour activer le brouillon Gmail."
                      : gmailState.kind === "creating"
                      ? "Création en cours…"
                      : "Crée un brouillon Gmail — aucun envoi automatique."
                  }
                  className={
                    gmailButtonEnabled
                      ? "inline-flex h-8 items-center gap-1 rounded-md border border-[#00527a]/30 bg-white px-3 text-xs text-[#00527a] hover:bg-[#eaf5ff]"
                      : "inline-flex h-8 cursor-not-allowed items-center gap-1 rounded-md border border-border/60 bg-muted/30 px-3 text-xs text-muted-foreground opacity-70"
                  }
                >
                  <Mail className="h-3.5 w-3.5" />
                  {gmailState.kind === "creating"
                    ? "Création…"
                    : "Créer un brouillon Gmail"}
                </button>
              </div>

              {gmailState.kind === "success" ? (
                <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900">
                  <p className="font-medium">
                    Brouillon créé dans Gmail (id: {gmailState.draftId}).
                  </p>
                  {gmailState.draftUrl ? (
                    <a
                      href={gmailState.draftUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-[#00527a] hover:underline"
                    >
                      Ouvrir le brouillon
                    </a>
                  ) : (
                    <p className="text-[10px] text-muted-foreground">
                      Retrouvez-le dans le dossier « Brouillons » de Gmail.
                    </p>
                  )}
                </div>
              ) : null}
              {gmailState.kind === "not_configured" ? (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                  {gmailState.message}
                </p>
              ) : null}
              {gmailState.kind === "error" ? (
                <p
                  role="alert"
                  className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-[11px] text-destructive"
                >
                  {gmailState.message}
                </p>
              ) : null}

              <p className="text-[10px] text-muted-foreground">
                Aucun email n&apos;est envoyé automatiquement. Vérifiez
                le contenu avant d&apos;envoyer depuis votre messagerie.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
