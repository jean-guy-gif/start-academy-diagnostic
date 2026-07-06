import { AlertTriangle, Cloud, HardDrive } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getTrainingModules } from "@/lib/modules/get-training-modules";
import type { SourceSheet, TrainingModule } from "@/types";

const SHEETS: SourceSheet[] = ["Conseiller", "Manager", "Assistantes"];

const SHEET_LABEL: Record<SourceSheet, string> = {
  Conseiller: "Conseiller",
  Manager: "Manager",
  Assistantes: "Assistantes",
};

function groupByFamily(modules: TrainingModule[]) {
  const map = new Map<string, TrainingModule[]>();
  for (const m of modules) {
    const list = map.get(m.family) ?? [];
    list.push(m);
    map.set(m.family, list);
  }
  return map;
}

function formatDuration(h: number | null) {
  if (h === null) return "—";
  return Number.isInteger(h) ? `${h} h` : `${h.toFixed(1)} h`;
}

function formatLevel(level: number | null) {
  if (level === null) return "—";
  if (level === 0) return "Base";
  return `Niv. ${level}`;
}

function formatPaying(p: boolean | null) {
  if (p === null) return "—";
  return p ? "Payant" : "Inclus";
}

export default async function ModulesPage() {
  const { modules, source, error } = await getTrainingModules();
  const foundationCount = modules.filter((m) => m.isFoundationModule).length;
  const totalDuration = modules.reduce(
    (sum, m) => sum + (m.durationHours ?? 0),
    0
  );

  const isSupabase = source === "supabase";

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold text-[#00527a]">
            Catalogue de modules
          </h1>
          <p className="text-muted-foreground">
            Catalogue Start Academy importé depuis le fichier Excel officiel.
            Données utilisées par le futur moteur de recommandation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge
            variant="outline"
            className={
              isSupabase
                ? "border-[#3ea9ff]/40 bg-[#eaf5ff] text-[#00527a]"
                : "border-amber-300 bg-amber-50 text-amber-800"
            }
          >
            {isSupabase ? (
              <Cloud className="h-3 w-3" />
            ) : (
              <HardDrive className="h-3 w-3" />
            )}
            Source : {isSupabase ? "Supabase" : "catalogue local"}
          </Badge>
          <Badge variant="secondary" className="bg-[#eaf5ff] text-[#00527a]">
            {modules.length} modules
          </Badge>
          <Badge variant="outline" className="border-[#3ea9ff]/40 text-[#00527a]">
            {foundationCount} socles outils
          </Badge>
          <Badge variant="outline" className="border-[#3ea9ff]/40 text-[#00527a]">
            {formatDuration(totalDuration)} cumulés
          </Badge>
        </div>
      </div>

      {!isSupabase && error && (
        <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-700" />
          <div>
            <p className="font-medium">Fallback sur le catalogue local</p>
            <p className="text-amber-800/80">{error}</p>
          </div>
        </div>
      )}

      {SHEETS.map((sheet) => {
        const sheetModules = modules.filter((m) => m.sourceSheet === sheet);
        if (sheetModules.length === 0) return null;
        const byFamily = groupByFamily(sheetModules);

        return (
          <Card key={sheet} className="border-border/60 bg-white">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CardTitle className="font-heading text-xl text-[#00527a]">
                  {SHEET_LABEL[sheet]}
                </CardTitle>
                <Badge variant="secondary" className="bg-[#eaf5ff] text-[#00527a]">
                  {sheetModules.length} module{sheetModules.length > 1 ? "s" : ""}
                </Badge>
              </div>
              <CardDescription>
                Onglet source : <code className="text-foreground/80">{sheet}</code>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {Array.from(byFamily.entries()).map(([family, modules]) => (
                <section key={family} className="space-y-3">
                  <h3 className="font-heading text-sm font-semibold uppercase tracking-widest text-[#00527a]/80">
                    {family}
                  </h3>
                  <div className="overflow-hidden rounded-lg border border-border/60">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/40">
                          <TableHead className="w-[24%]">Module</TableHead>
                          <TableHead className="w-[8%]">Durée</TableHead>
                          <TableHead className="w-[8%]">Niveau</TableHead>
                          <TableHead className="w-[10%]">Tarif</TableHead>
                          <TableHead className="w-[10%]">Plateforme</TableHead>
                          <TableHead className="w-[10%]">Outils</TableHead>
                          <TableHead className="w-[30%]">Signaux de diagnostic</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {modules.map((m) => (
                          <TableRow key={m.id} className="align-top">
                            <TableCell className="font-medium text-foreground">
                              <div className="flex flex-col gap-1">
                                <span>{m.name}</span>
                                {m.isFoundationModule && (
                                  <Badge
                                    variant="outline"
                                    className="w-fit border-[#3ea9ff] bg-[#eaf5ff] text-[#00527a] text-[10px] font-semibold uppercase tracking-wider"
                                  >
                                    Socle
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatDuration(m.durationHours)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatLevel(m.level)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {formatPaying(m.paying)}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {m.platform ?? "—"}
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {m.tools ?? "—"}
                            </TableCell>
                            <TableCell>
                              {m.diagnosticSignals.length === 0 ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : (
                                <ul className="space-y-1">
                                  {m.diagnosticSignals.slice(0, 3).map((s) => (
                                    <li
                                      key={s}
                                      className="text-xs text-muted-foreground line-clamp-2"
                                    >
                                      · {s}
                                    </li>
                                  ))}
                                  {m.diagnosticSignals.length > 3 && (
                                    <li className="text-xs text-[#00527a]/70">
                                      +{m.diagnosticSignals.length - 3} autres
                                    </li>
                                  )}
                                </ul>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </section>
              ))}
            </CardContent>
          </Card>
        );
      })}

      <p className="text-xs text-muted-foreground">
        Source : <code>Data/catalogue-formations-start-academy.xlsx</code>. La
        régénération est automatisée hors application — toute modification doit
        passer par le fichier Excel puis le script de génération.
      </p>
    </div>
  );
}
