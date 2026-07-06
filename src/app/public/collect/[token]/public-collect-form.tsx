"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ParticipantDocumentsUpload } from "./participant-documents-upload";

interface Props {
  token: string;
  defaultEmail: string;
  defaultName: string;
}

interface Status {
  kind: "idle" | "submitting" | "success" | "error";
  message?: string;
}

type ProfessionalStatusValue =
  | ""
  | "salarie"
  | "agent_commercial_independant"
  | "autre";

const EXPERIENCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Sélectionner…" },
  { value: "lt_1", label: "Moins de 1 an" },
  { value: "1_3", label: "1 à 3 ans" },
  { value: "3_5", label: "3 à 5 ans" },
  { value: "5_10", label: "5 à 10 ans" },
  { value: "gt_10", label: "Plus de 10 ans" },
];

const STATUS_OPTIONS: Array<{ value: ProfessionalStatusValue; label: string }> =
  [
    { value: "", label: "Sélectionner…" },
    { value: "salarie", label: "Salarié" },
    {
      value: "agent_commercial_independant",
      label: "Agent commercial indépendant",
    },
    { value: "autre", label: "Autre" },
  ];

export function PublicCollectForm({ token, defaultEmail, defaultName }: Props) {
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [profStatus, setProfStatus] = useState<ProfessionalStatusValue>("");
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const defaultParts = defaultName.split(" ");
  const defaultFirstName = defaultParts[0] ?? "";
  const defaultLastName = defaultParts.slice(1).join(" ");

  async function onSubmit(formData: FormData) {
    setStatus({ kind: "submitting" });

    const toolsRaw = (formData.get("toolsUsed") as string) ?? "";
    const toolsUsed = toolsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);

    const rawStatus = (formData.get("professionalStatus") as string) ?? "";
    const professionalStatus =
      rawStatus === "salarie" ||
      rawStatus === "agent_commercial_independant" ||
      rawStatus === "autre"
        ? rawStatus
        : null;

    const email = ((formData.get("email") as string) ?? "").trim();

    const payload = {
      token,
      participant: {
        firstName: ((formData.get("firstName") as string) ?? "").trim(),
        lastName: ((formData.get("lastName") as string) ?? "").trim(),
        email,
        role: ((formData.get("role") as string) ?? "").trim(),
        estimatedLevel: ((formData.get("estimatedLevel") as string) ?? "").trim(),
        personalGoal: ((formData.get("personalGoal") as string) ?? "").trim(),
        mainProblem: ((formData.get("mainProblem") as string) ?? "").trim(),
        toolsUsed,
        concreteCase: ((formData.get("concreteCase") as string) ?? "").trim(),
        lastDiploma: ((formData.get("lastDiploma") as string) ?? "").trim(),
        realEstateExperienceYears: (
          (formData.get("realEstateExperienceYears") as string) ?? ""
        ).trim(),
        professionalStatus,
      },
    };

    try {
      const res = await fetch("/api/public/submit-participant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setStatus({
          kind: "error",
          message: json.error ?? "Enregistrement impossible.",
        });
        return;
      }
      setSubmittedEmail(payload.participant.email || null);
      setStatus({
        kind: "success",
        message:
          "Merci ! Vos informations ont bien été transmises à votre formateur.",
      });
    } catch {
      setStatus({
        kind: "error",
        message: "Connexion impossible. Réessayez dans un instant.",
      });
    }
  }

  if (status.kind === "success") {
    return (
      <div className="space-y-4">
        <p className="rounded-md border border-emerald-500/40 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {status.message}
        </p>
        <p className="text-xs text-muted-foreground">
          Vous pouvez maintenant déposer vos pièces utiles si vous le
          souhaitez. Ces documents restent confidentiels — ils ne sont
          pas publics.
        </p>
        {submittedEmail ? (
          <ParticipantDocumentsUpload
            token={token}
            participantEmail={submittedEmail}
          />
        ) : null}
        <p className="text-xs text-muted-foreground">
          Pour modifier vos informations plus tard, réutilisez le lien
          que vous avez reçu.
        </p>
      </div>
    );
  }

  return (
    <form action={onSubmit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">Prénom</Label>
          <Input
            id="firstName"
            name="firstName"
            required
            defaultValue={defaultFirstName}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">Nom</Label>
          <Input
            id="lastName"
            name="lastName"
            required
            defaultValue={defaultLastName}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email professionnel</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          defaultValue={defaultEmail}
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="role">Votre rôle</Label>
          <Input
            id="role"
            name="role"
            placeholder="Conseiller, manager, assistant…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="estimatedLevel">Votre niveau IA</Label>
          <Input
            id="estimatedLevel"
            name="estimatedLevel"
            placeholder="Débutant / intermédiaire / avancé"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="toolsUsed">Outils utilisés aujourd&apos;hui</Label>
        <Input
          id="toolsUsed"
          name="toolsUsed"
          placeholder="ChatGPT, Notion, CRM… (séparés par des virgules)"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="personalGoal">Objectif personnel pour la formation</Label>
        <Textarea
          id="personalGoal"
          name="personalGoal"
          rows={2}
          placeholder="Ex : signer plus de mandats exclusifs."
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mainProblem">Difficulté principale aujourd&apos;hui</Label>
        <Textarea
          id="mainProblem"
          name="mainProblem"
          rows={2}
          placeholder="Ex : je ne ferme pas en exclusivité en R2."
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[#00527a]">
          Informations administratives
        </p>
        <p className="text-xs text-muted-foreground">
          Pour préparer votre dossier de formation (CFP / URSSAF si
          applicable).
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="lastDiploma">Dernier diplôme obtenu</Label>
          <Input
            id="lastDiploma"
            name="lastDiploma"
            placeholder="BTS, licence, master, autre…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="realEstateExperienceYears">
            Ancienneté en immobilier
          </Label>
          <select
            id="realEstateExperienceYears"
            name="realEstateExperienceYears"
            defaultValue=""
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {EXPERIENCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="professionalStatus">Statut professionnel</Label>
        <select
          id="professionalStatus"
          name="professionalStatus"
          value={profStatus}
          onChange={(e) =>
            setProfStatus(e.target.value as ProfessionalStatusValue)
          }
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {profStatus === "agent_commercial_independant" ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Pour les agents commerciaux indépendants, Start Academy peut
            avoir besoin d&apos;une attestation CFP / URSSAF selon le
            dossier de prise en charge. Vous pourrez la déposer après
            envoi du formulaire.
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="concreteCase">Cas concret à traiter en formation</Label>
        <Textarea
          id="concreteCase"
          name="concreteCase"
          rows={3}
          placeholder="Décrivez un mandat ou un client précis où vous bloquez."
        />
      </div>

      {status.kind === "error" ? (
        <p
          role="alert"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {status.message}
        </p>
      ) : null}

      <Button
        type="submit"
        disabled={status.kind === "submitting"}
        className="w-full bg-[#00527a] text-white hover:bg-[#00527a]/90"
      >
        {status.kind === "submitting"
          ? "Envoi en cours…"
          : "Transmettre à mon formateur"}
      </Button>

      <p className="text-xs text-muted-foreground">
        En envoyant ce formulaire, vous acceptez que Start Academy
        partage ces informations avec votre formateur pour personnaliser
        la session.
      </p>
    </form>
  );
}
