import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const REASON_LABEL: Record<string, string> = {
  not_found: "Lien introuvable ou révoqué.",
  expired: "Ce lien a expiré.",
  exhausted: "Ce lien a atteint son nombre maximum d'utilisations.",
  disabled: "Ce lien a été désactivé par Start Academy.",
  malformed: "Lien invalide.",
  session_not_found: "La session associée à ce lien n'existe plus.",
  wrong_access_type: "Ce lien ne donne pas accès à cette page.",
};

interface Props {
  reason: keyof typeof REASON_LABEL | string;
}

export function PublicTokenError({ reason }: Props) {
  const message = REASON_LABEL[reason] ?? "Lien invalide.";
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-white via-[#eaf5ff]/40 to-white px-4">
      <Card className="w-full max-w-lg border-border/60">
        <CardHeader>
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#00527a] text-white font-heading text-xs font-bold">
              SA
            </div>
            <span className="font-heading text-sm font-bold uppercase tracking-widest text-[#00527a]">
              Start Academy
            </span>
          </div>
          <CardTitle className="font-heading">Accès impossible</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{message}</p>
          <p className="text-xs text-muted-foreground">
            Contactez votre interlocuteur Start Academy pour obtenir un
            nouveau lien.
          </p>
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Retour à l&apos;accueil
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
