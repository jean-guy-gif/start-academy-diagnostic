import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { validatePublicToken } from "@/lib/public-access/public-token-service";
import { PublicShell } from "@/app/public/_components/public-shell";
import { PublicTokenError } from "@/app/public/_components/public-token-error";
import { PublicCollectForm } from "./public-collect-form";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ token: string }>;
}

export default async function PublicCollectPage({ params }: Props) {
  const { token } = await params;
  const validation = await validatePublicToken(token);

  if (!validation.valid) {
    return <PublicTokenError reason={validation.reason} />;
  }
  if (validation.accessType !== "participant_collect") {
    return <PublicTokenError reason="wrong_access_type" />;
  }

  return (
    <PublicShell>
      <div className="space-y-6">
        <div>
          <p className="font-heading text-xs uppercase tracking-widest text-muted-foreground">
            Préparation collaborateur ·{" "}
            {validation.clientName ?? "Start Academy"}
          </p>
          <h1 className="mt-2 font-heading text-2xl font-bold text-[#00527a] md:text-3xl">
            {validation.sessionTitle ?? "Préparer votre formation"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ce formulaire permet à votre formateur de personnaliser la
            session. 5 minutes suffisent — vous pourrez compléter
            l&apos;information plus tard si nécessaire.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-heading text-lg">
              Votre fiche de préparation
            </CardTitle>
            <CardDescription>
              Les informations restent confidentielles et ne sont
              utilisées que par votre formateur Start Academy.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PublicCollectForm
              token={token}
              defaultEmail={validation.recipientEmail ?? ""}
              defaultName={validation.recipientName ?? ""}
            />
          </CardContent>
        </Card>
      </div>
    </PublicShell>
  );
}
