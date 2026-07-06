import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { validatePublicToken } from "@/lib/public-access/public-token-service";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { PublicShell } from "@/app/public/_components/public-shell";
import { PublicTokenError } from "@/app/public/_components/public-token-error";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ token: string }>;
}

interface TrainerSnapshot {
  status: string | null;
  expectedParticipants: number | null;
  diagnostic: {
    declaredGoal: string | null;
    notes: string | null;
  } | null;
  recommendation: {
    clientSummary: string | null;
    toolMaturity: string | null;
  } | null;
  support: {
    title: string | null;
  } | null;
  designedSupport: {
    title: string | null;
    visualIntent: string | null;
  } | null;
  participants: Array<{
    id: string;
    firstName: string;
    lastName: string;
    role: string | null;
    estimatedLevel: string | null;
    mainProblem: string | null;
    concreteCase: string | null;
  }>;
}

async function loadTrainerSnapshot(
  sessionId: string
): Promise<TrainerSnapshot> {
  const empty: TrainerSnapshot = {
    status: null,
    expectedParticipants: null,
    diagnostic: null,
    recommendation: null,
    support: null,
    designedSupport: null,
    participants: [],
  };

  const client = createSupabaseAdminClient();
  if (!client) return empty;

  const { data: session } = await client
    .from("training_sessions")
    .select("status, expected_participants, diagnostic_id, recommendation_id")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) return empty;

  let diagnostic: TrainerSnapshot["diagnostic"] = null;
  if (session.diagnostic_id) {
    const { data: diag } = await client
      .from("diagnostics")
      .select("declared_goal, notes")
      .eq("id", session.diagnostic_id)
      .maybeSingle();
    if (diag) {
      diagnostic = {
        declaredGoal: diag.declared_goal,
        notes: diag.notes,
      };
    }
  }

  let recommendation: TrainerSnapshot["recommendation"] = null;
  if (session.recommendation_id) {
    const { data: reco } = await client
      .from("recommendations")
      .select("client_summary, tool_maturity")
      .eq("id", session.recommendation_id)
      .maybeSingle();
    if (reco) {
      recommendation = {
        clientSummary: reco.client_summary,
        toolMaturity: reco.tool_maturity,
      };
    }
  }

  const { data: support } = await client
    .from("training_supports")
    .select("title")
    .eq("session_id", sessionId)
    .maybeSingle();

  const { data: designed } = await client
    .from("designed_training_supports")
    .select("title, visual_intent")
    .eq("session_id", sessionId)
    .maybeSingle();

  const { data: participants } = await client
    .from("session_participants")
    .select(
      "id, first_name, last_name, role, estimated_level, main_problem, concrete_case"
    )
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });

  return {
    status: session.status,
    expectedParticipants: session.expected_participants,
    diagnostic,
    recommendation,
    support: support ? { title: support.title } : null,
    designedSupport: designed
      ? { title: designed.title, visualIntent: designed.visual_intent }
      : null,
    participants: (participants ?? []).map((p) => ({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      role: p.role,
      estimatedLevel: p.estimated_level,
      mainProblem: p.main_problem,
      concreteCase: p.concrete_case,
    })),
  };
}

export default async function PublicTrainerPage({ params }: Props) {
  const { token } = await params;
  const validation = await validatePublicToken(token);

  if (!validation.valid) {
    return <PublicTokenError reason={validation.reason} />;
  }
  if (validation.accessType !== "trainer_session_view") {
    return <PublicTokenError reason="wrong_access_type" />;
  }

  const snapshot = await loadTrainerSnapshot(validation.sessionId);

  return (
    <PublicShell>
      <div className="space-y-6">
        <div>
          <p className="font-heading text-xs uppercase tracking-widest text-muted-foreground">
            Espace Formateur ·{" "}
            {validation.clientName ?? "Session Start Academy"}
          </p>
          <h1 className="mt-2 font-heading text-2xl font-bold text-[#00527a] md:text-3xl">
            {validation.sessionTitle ??
              snapshot.support?.title ??
              "Préparation session"}
          </h1>
          {validation.recipientName ? (
            <p className="mt-1 text-sm text-muted-foreground">
              Préparé pour {validation.recipientName}.
            </p>
          ) : null}
          <Badge className="mt-3 bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]">
            Lecture seule
          </Badge>
        </div>

        {snapshot.diagnostic ? (
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                Diagnostic
              </CardTitle>
              <CardDescription>
                Synthèse du rendez-vous commercial.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {snapshot.diagnostic.declaredGoal ? (
                <p>
                  <span className="font-medium">Objectif déclaré :</span>{" "}
                  {snapshot.diagnostic.declaredGoal}
                </p>
              ) : null}
              {snapshot.diagnostic.notes ? (
                <p className="text-muted-foreground">
                  {snapshot.diagnostic.notes}
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {snapshot.recommendation ? (
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                Recommandation IA
              </CardTitle>
              {snapshot.recommendation.toolMaturity ? (
                <CardDescription>
                  Maturité outils estimée :{" "}
                  {snapshot.recommendation.toolMaturity}
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {snapshot.recommendation.clientSummary ??
                  "Synthèse client non disponible."}
              </p>
            </CardContent>
          </Card>
        ) : null}

        {snapshot.support ? (
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                Support pédagogique brut
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              {snapshot.support.title ? (
                <p className="font-medium text-foreground">
                  {snapshot.support.title}
                </p>
              ) : null}
              <p className="text-xs">
                Accès complet au support brut depuis l&apos;espace interne
                Start Academy.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {snapshot.designedSupport ? (
          <Card>
            <CardHeader>
              <CardTitle className="font-heading text-lg">
                Support designé
              </CardTitle>
              {snapshot.designedSupport.visualIntent ? (
                <CardDescription>
                  {snapshot.designedSupport.visualIntent}
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {snapshot.designedSupport.title ??
                  "Support designé disponible."}
              </p>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">
              Participants ({snapshot.participants.length}
              {snapshot.expectedParticipants
                ? ` / ${snapshot.expectedParticipants}`
                : ""}
              )
            </CardTitle>
            <CardDescription>
              Préparations renseignées par les collaborateurs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {snapshot.participants.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune préparation collectée pour le moment.
              </p>
            ) : (
              <ul className="space-y-4">
                {snapshot.participants.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm"
                  >
                    <p className="font-medium">
                      {p.firstName} {p.lastName}
                      {p.role ? (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {p.role}
                        </span>
                      ) : null}
                    </p>
                    {p.estimatedLevel ? (
                      <p className="text-xs text-muted-foreground">
                        Niveau : {p.estimatedLevel}
                      </p>
                    ) : null}
                    {p.mainProblem ? (
                      <p className="mt-1 text-xs">
                        <span className="font-medium">Problème :</span>{" "}
                        {p.mainProblem}
                      </p>
                    ) : null}
                    {p.concreteCase ? (
                      <p className="mt-1 text-xs">
                        <span className="font-medium">Cas concret :</span>{" "}
                        {p.concreteCase}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Separator />
        <p className="text-center text-xs text-muted-foreground">
          Espace formateur personnel — ne pas partager.
        </p>
      </div>
    </PublicShell>
  );
}
