"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Cloud,
  HardDrive,
  Loader2,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import {
  getTrainingSessionById,
  saveParticipant,
} from "@/lib/sessions/session-service";
import type { TrainingSessionViewModel } from "@/types";

const TOOL_OPTIONS = ["ChatGPT", "NotebookLM", "Gamma", "CRM", "Canva", "Autre"];

const INITIAL_FORM = {
  firstName: "",
  lastName: "",
  role: "",
  email: "",
  estimatedLevel: "",
  mainProblem: "",
  personalGoal: "",
  toolsUsed: [] as string[],
  concreteCase: "",
};

interface Props {
  sessionId: string;
}

export function CollectView({ sessionId }: Props) {
  const [session, setSession] = useState<TrainingSessionViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);
  const [lastMode, setLastMode] = useState<"supabase" | "local" | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTrainingSessionById(sessionId).then((result) => {
      if (cancelled) return;
      setSession(result.data);
      setLoadError(result.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  function update<K extends keyof typeof INITIAL_FORM>(
    key: K,
    value: (typeof INITIAL_FORM)[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleTool(tool: string) {
    setForm((prev) => {
      const has = prev.toolsUsed.includes(tool);
      const next = has
        ? prev.toolsUsed.filter((t) => t !== tool)
        : [...prev.toolsUsed, tool];
      return { ...prev, toolsUsed: next };
    });
  }

  const canSubmit =
    form.firstName.trim().length > 0 &&
    form.lastName.trim().length > 0 &&
    form.email.trim().length > 0;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setSubmitNotice(null);

    const result = await saveParticipant({
      sessionId,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      role: form.role.trim(),
      email: form.email.trim(),
      estimatedLevel: form.estimatedLevel.trim(),
      mainProblem: form.mainProblem.trim(),
      personalGoal: form.personalGoal.trim(),
      toolsUsed: form.toolsUsed,
      concreteCase: form.concreteCase.trim(),
    });

    setSubmitting(false);
    setSubmitNotice(result.error);
    setLastMode(result.mode);
    if (result.data) {
      setSubmitted(true);
      setForm(INITIAL_FORM);
    }
  }

  if (loading) {
    return (
      <Card className="border-border/60 bg-white">
        <CardContent className="flex items-center gap-3 py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement…
        </CardContent>
      </Card>
    );
  }

  if (!session) {
    return (
      <div className="flex items-start gap-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-red-700" />
        <div>
          <p className="font-medium">Session introuvable</p>
          <p className="text-red-800/80">
            {loadError ??
              "Le lien de collecte ne correspond à aucune session Supabase ni locale."}
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="space-y-6">
        <Header session={session} mode={lastMode} />
        <Card className="border-border/60 bg-white">
          <CardHeader>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <CardTitle className="font-heading text-xl text-[#00527a]">
                Merci, votre réponse est enregistrée
              </CardTitle>
            </div>
            <CardDescription>
              {lastMode === "supabase"
                ? "Vos informations sont enregistrées sur la plateforme Start Academy."
                : "Vos informations sont conservées localement sur ce navigateur. Le commercial les récupérera lors de sa prochaine connexion."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setSubmitted(false);
                setSubmitNotice(null);
              }}
              className={cn(
                buttonVariants({ size: "default" }),
                "bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90 h-10 px-4"
              )}
            >
              Ajouter une autre réponse
              <ArrowRight className="h-4 w-4" />
            </button>
            <Link
              href={`/sessions/${sessionId}`}
              className={cn(
                buttonVariants({ variant: "outline", size: "default" }),
                "h-10 px-4 border-[#00527a]/20 text-[#00527a] hover:bg-[#eaf5ff]"
              )}
            >
              Voir la fiche session
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Header session={session} mode={lastMode} />

      <Card className="border-border/60 bg-white">
        <CardHeader>
          <CardTitle className="font-heading text-xl text-[#00527a]">
            Préparer votre formation
          </CardTitle>
          <CardDescription>
            Vos réponses permettent au formateur de personnaliser les
            exercices avec vos cas réels. Aucune donnée ne quitte la
            plateforme tant que le stockage Supabase n&apos;est pas activé.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Prénom" htmlFor="firstName" required>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={(e) => update("firstName", e.target.value)}
                  required
                />
              </Field>
              <Field label="Nom" htmlFor="lastName" required>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={(e) => update("lastName", e.target.value)}
                  required
                />
              </Field>
              <Field label="Rôle" htmlFor="role">
                <Input
                  id="role"
                  value={form.role}
                  onChange={(e) => update("role", e.target.value)}
                  placeholder="Conseiller, manager, assistante…"
                />
              </Field>
              <Field label="Email" htmlFor="email" required>
                <Input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => update("email", e.target.value)}
                  required
                />
              </Field>
              <Field label="Niveau estimé" htmlFor="estimatedLevel">
                <Input
                  id="estimatedLevel"
                  value={form.estimatedLevel}
                  onChange={(e) => update("estimatedLevel", e.target.value)}
                  placeholder="Débutant, intermédiaire, avancé"
                />
              </Field>
              <Field
                label="Objectif personnel"
                htmlFor="personalGoal"
                hint="Ce que vous voulez avoir gagné à la fin."
              >
                <Input
                  id="personalGoal"
                  value={form.personalGoal}
                  onChange={(e) => update("personalGoal", e.target.value)}
                />
              </Field>
            </div>

            <Field
              label="Problématique principale"
              htmlFor="mainProblem"
              hint="Ce qui vous coûte le plus de temps ou d'énergie aujourd'hui."
            >
              <Textarea
                id="mainProblem"
                rows={3}
                value={form.mainProblem}
                onChange={(e) => update("mainProblem", e.target.value)}
              />
            </Field>

            <div>
              <Label className="text-sm">Outils utilisés</Label>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                {TOOL_OPTIONS.map((tool) => {
                  const checked = form.toolsUsed.includes(tool);
                  return (
                    <label
                      key={tool}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors",
                        checked
                          ? "border-[#3ea9ff] bg-[#eaf5ff] text-[#00527a]"
                          : "border-border hover:bg-muted/30"
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleTool(tool)}
                      />
                      {tool}
                    </label>
                  );
                })}
              </div>
            </div>

            <Field
              label="Cas concret à travailler"
              htmlFor="concreteCase"
              hint="Un dossier réel que vous voulez traiter pendant la formation."
            >
              <Textarea
                id="concreteCase"
                rows={3}
                value={form.concreteCase}
                onChange={(e) => update("concreteCase", e.target.value)}
              />
            </Field>

            <div>
              <Label className="text-sm">Fichier à déposer</Label>
              <div className="mt-2 flex items-center gap-3 rounded-md border border-dashed border-border/80 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                <Upload className="h-4 w-4" />
                <span>Upload désactivé pour le moment.</span>
                <Badge
                  variant="outline"
                  className="ml-auto border-amber-300 bg-amber-50 text-amber-800"
                >
                  Upload à venir
                </Badge>
              </div>
            </div>

            {submitNotice && (
              <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                <HardDrive className="mt-0.5 h-4 w-4 flex-none text-amber-700" />
                <p>{submitNotice}</p>
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={!canSubmit || submitting}
                className={cn(
                  buttonVariants({ size: "lg" }),
                  "bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90 h-11 px-5",
                  (!canSubmit || submitting) && "opacity-60 cursor-not-allowed"
                )}
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                Envoyer
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Header({
  session,
  mode,
}: {
  session: TrainingSessionViewModel;
  mode: "supabase" | "local" | null;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          variant="outline"
          className="border-[#3ea9ff]/40 bg-[#eaf5ff] text-[#00527a]"
        >
          Collecte collaborateurs
        </Badge>
        {mode && (
          <Badge
            variant="outline"
            className={cn(
              "flex items-center gap-1 text-xs",
              mode === "supabase"
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-amber-300 bg-amber-50 text-amber-800"
            )}
          >
            {mode === "supabase" ? (
              <Cloud className="h-3 w-3" />
            ) : (
              <HardDrive className="h-3 w-3" />
            )}
            {mode === "supabase" ? "Persistée Supabase" : "Stockage local"}
          </Badge>
        )}
      </div>
      <h1 className="font-heading text-3xl font-bold text-[#00527a]">
        {session.proposalTitle ?? "Formation Start Academy"}
      </h1>
      <p className="text-muted-foreground">
        {session.clientName
          ? `Pour ${session.clientName}.`
          : "Préparation de votre session formation."}{" "}
        {session.totalDurationHours !== null && (
          <>Durée prévue : {session.totalDurationHours} h. </>
        )}
        {session.suggestedFormat && <>Format : {session.suggestedFormat}.</>}
      </p>
    </div>
  );
}

interface FieldProps {
  label: string;
  htmlFor: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}

function Field({ label, htmlFor, required, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-sm">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
