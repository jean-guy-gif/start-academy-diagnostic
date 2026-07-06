import { Suspense } from "react";
import { redirect } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/get-current-user";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Connexion · Start Academy",
};

export default async function LoginPage() {
  // Si déjà connecté, rediriger directement vers le dashboard pour éviter
  // d'afficher le formulaire à un utilisateur authentifié.
  const user = await getCurrentUser();
  if (user) redirect("/cockpit");

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-white via-[#eaf5ff]/40 to-white px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#00527a] text-white font-heading font-bold">
            SA
          </div>
          <span className="font-heading text-xl font-bold tracking-wide text-[#00527a]">
            START ACADEMY
          </span>
        </div>

        <Card className="border-border/60">
          <CardHeader className="space-y-1">
            <CardTitle className="font-heading">Connexion</CardTitle>
            <CardDescription>
              Accès réservé aux équipes Start Academy.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense fallback={null}>
              <LoginForm />
            </Suspense>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Pas de compte ? Contactez l&apos;administrateur Start Academy.
        </p>
      </div>
    </div>
  );
}
