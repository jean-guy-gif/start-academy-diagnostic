import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Accès refusé · Start Academy",
};

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-white via-[#eaf5ff]/40 to-white px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#00527a] text-white font-heading font-bold">
            SA
          </div>
          <span className="font-heading text-xl font-bold tracking-wide text-[#00527a]">
            START ACADEMY
          </span>
        </div>
        <h1 className="font-heading text-2xl font-bold text-[#00527a]">
          Accès refusé
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Votre compte ne dispose pas du rôle nécessaire pour accéder à
          cette section. Contactez l&apos;administrateur Start Academy si
          vous pensez qu&apos;il s&apos;agit d&apos;une erreur.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Retour à l&apos;accueil
          </Link>
          <Link
            href="/login"
            className={cn(
              buttonVariants({ size: "sm" }),
              "bg-[#00527a] text-white hover:bg-[#00527a]/90"
            )}
          >
            Se connecter avec un autre compte
          </Link>
        </div>
      </div>
    </div>
  );
}
