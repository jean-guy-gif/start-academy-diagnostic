import Link from "next/link";
import { ArrowRight, ClipboardList, CalendarDays, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

const quickStats = [
  { label: "Diagnostics en cours", value: "0" },
  { label: "Propositions envoyées", value: "0" },
  { label: "Sessions validées", value: "0" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-[#eaf5ff]/40 to-white">
      <header className="border-b border-border/60 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#00527a] text-white font-heading font-bold">
              SA
            </div>
            <span className="font-heading text-lg font-bold tracking-wide text-[#00527a]">
              START ACADEMY
            </span>
          </div>
          <nav className="hidden gap-2 md:flex">
            <Link
              href="/diagnostics"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Diagnostics
            </Link>
            <Link
              href="/sessions"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Sessions
            </Link>
            <Link
              href="/cockpit"
              className={buttonVariants({ variant: "ghost", size: "sm" })}
            >
              Cockpit
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        <section className="flex flex-col items-start gap-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#3ea9ff]/30 bg-[#eaf5ff] px-3 py-1 text-xs font-semibold uppercase tracking-widest text-[#00527a]">
            <Sparkles className="h-3.5 w-3.5" />
            Plateforme interne Start Academy
          </span>

          <h1 className="font-heading text-4xl font-bold leading-tight tracking-tight text-[#00527a] md:text-6xl">
            Transformer un rendez-vous client
            <br />
            en parcours de formation personnalisé.
          </h1>

          <p className="max-w-2xl text-lg text-muted-foreground">
            Une plateforme unique pour qualifier le besoin, recommander les
            modules pertinents, générer la proposition et créer la session
            formation. Sans repartir de zéro à chaque rendez-vous.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/diagnostics/new"
              className={cn(
                buttonVariants({ size: "lg" }),
                "bg-[#3ea9ff] text-white hover:bg-[#3ea9ff]/90 px-5 h-11"
              )}
            >
              Nouveau diagnostic
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/diagnostics"
              className={cn(
                buttonVariants({ size: "lg", variant: "outline" }),
                "border-[#00527a]/20 text-[#00527a] hover:bg-[#eaf5ff] px-5 h-11"
              )}
            >
              <ClipboardList className="h-4 w-4" />
              Voir les diagnostics
            </Link>
            <Link
              href="/sessions"
              className={cn(
                buttonVariants({ size: "lg", variant: "ghost" }),
                "text-[#00527a] hover:bg-[#eaf5ff] px-5 h-11"
              )}
            >
              <CalendarDays className="h-4 w-4" />
              Sessions
            </Link>
          </div>
        </section>

        <section className="mt-16 grid gap-4 sm:grid-cols-3">
          {quickStats.map((stat) => (
            <Card key={stat.label} className="border-border/60 bg-white">
              <CardHeader className="pb-2">
                <CardDescription className="font-medium text-muted-foreground">
                  {stat.label}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="font-heading text-4xl font-bold text-[#00527a]">
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="mt-16 grid gap-6 md:grid-cols-3">
          <Card className="border-border/60 bg-white">
            <CardHeader>
              <CardTitle className="font-heading text-xl text-[#00527a]">
                1. Diagnostiquer
              </CardTitle>
              <CardDescription>
                Questions guidées, transcription, ou mode hybride. Aucun besoin
                client oublié.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-border/60 bg-white">
            <CardHeader>
              <CardTitle className="font-heading text-xl text-[#00527a]">
                2. Recommander
              </CardTitle>
              <CardDescription>
                L&apos;IA identifie les modules pertinents, vérifie les
                prérequis et calcule la durée.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="border-border/60 bg-white">
            <CardHeader>
              <CardTitle className="font-heading text-xl text-[#00527a]">
                3. Proposer
              </CardTitle>
              <CardDescription>
                Mail dirigeant, guide initial, package communication et fiche
                session, prêts à envoyer.
              </CardDescription>
            </CardHeader>
          </Card>
        </section>
      </main>

      <footer className="border-t border-border/60 bg-white/80">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-6 py-6 text-xs text-muted-foreground md:flex-row">
          <span>© Start Academy — Plateforme interne v0.1</span>
          <span className="font-heading tracking-widest uppercase text-[#00527a]/60">
            Diagnostic · Recommandation · Session
          </span>
        </div>
      </footer>
    </div>
  );
}
