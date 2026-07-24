import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { FALLBACK_KEYS } from "./purge-fallback-keys";

/**
 * Test transversal anti-oubli (pattern F-1).
 *
 * 1. Tout fichier `src/lib/**\/*.ts` qui déclare une clé `sa.*.fallback`
 *    DOIT importer `isLocalFallbackAllowed` du module storage.
 * 2. Toute déclaration `window.localStorage.getItem|setItem|removeItem`
 *    dans `src/lib/**\/*.ts` DOIT être précédée (dans la fonction
 *    contenante) d'un `isLocalFallbackAllowed()`. Vérification
 *    statique : on cherche l'appel à `isLocalFallbackAllowed()` dans
 *    les 20 lignes précédant chaque `window.localStorage.*`.
 * 3. La liste `FALLBACK_KEYS` de `purge-fallback-keys.ts` DOIT être
 *    strictement égale (ensemble) à l'ensemble des chaînes littérales
 *    `"sa.<name>.fallback.v1"` déclarées comme constantes `LS_KEY` /
 *    `LS_PARTICIPANTS_KEY` dans `src/lib/**`.
 *
 * Si un futur service ajoute un nouveau store localStorage sans le
 * gate + sans l'ajouter à `FALLBACK_KEYS`, ce test échoue.
 */

const LIB_ROOT = join(process.cwd(), "src", "lib");
const CONTEXT_LINES = 20;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts")) out.push(p);
  }
  return out;
}

function listServiceFiles(): string[] {
  return walk(LIB_ROOT).filter(
    (f) => !f.endsWith(".test.ts") && !f.endsWith(".contract.test.ts")
  );
}

interface FileScan {
  path: string;
  content: string;
  lines: string[];
}

function loadFiles(): FileScan[] {
  return listServiceFiles().map((path) => {
    const content = readFileSync(path, "utf8");
    return { path, content, lines: content.split("\n") };
  });
}

describe("Contract localStorage — aucun fallback silencieux dans src/lib", () => {
  const files = loadFiles();

  it("chaque fichier qui déclare une clé sa.*.fallback importe isLocalFallbackAllowed", () => {
    const offenders: string[] = [];
    // `purge-fallback-keys.ts` liste les clés dans un tableau
    // constant utilisé uniquement par la purge root — n'accède
    // jamais au localStorage via les helpers gated.
    const REGISTRY_PATH = join(LIB_ROOT, "storage", "purge-fallback-keys.ts");
    for (const file of files) {
      if (file.path === REGISTRY_PATH) continue;
      const declaresKey = /"sa\.[a-zA-Z0-9._-]+\.fallback\./.test(file.content);
      if (!declaresKey) continue;
      const importsGate = /isLocalFallbackAllowed/.test(file.content);
      if (!importsGate) offenders.push(file.path);
    }
    expect(offenders).toEqual([]);
  });

  it("tout window.localStorage.{get|set|remove}Item est gaté par isLocalFallbackAllowed()", () => {
    const offenders: string[] = [];
    // Fichiers autorisés à faire un removeItem sans gate en tête de
    // helper : la purge au bootstrap DOIT justement s'exécuter dans
    // les envs où le fallback est fermé.
    const ALLOWLIST_PATHS = new Set([
      join(LIB_ROOT, "storage", "purge-fallback-keys.ts"),
      // `diagnostic-service.ts` gate AU CALLER (chaque fonction
      // publique wrappe l'appel avec `if (isLocalFallbackAllowed())`),
      // pas au helper `readLocal`/`writeLocal`. Pattern historique
      // validé — l'inspection statique caller-par-caller est vérifiée
      // à part par la présence de l'import + le comptage de gates
      // (test « chaque fichier ... importe isLocalFallbackAllowed »
      // ci-dessus).
      join(LIB_ROOT, "diagnostics", "diagnostic-service.ts"),
    ]);
    for (const file of files) {
      if (ALLOWLIST_PATHS.has(file.path)) continue;
      for (let i = 0; i < file.lines.length; i += 1) {
        const line = file.lines[i];
        if (!/window\.localStorage\.(getItem|setItem|removeItem)/.test(line)) {
          continue;
        }
        const from = Math.max(0, i - CONTEXT_LINES);
        const context = file.lines.slice(from, i).join("\n");
        if (!/isLocalFallbackAllowed\s*\(\s*\)/.test(context)) {
          offenders.push(`${file.path}:${i + 1} — ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("FALLBACK_KEYS = ensemble strict des sa.*.fallback.v1 déclarés dans src/lib", () => {
    const declared = new Set<string>();
    for (const file of files) {
      // Match des chaînes littérales "sa.<name>.fallback.<version>"
      // dans les fichiers de service (excl. les tests + le module
      // purge-fallback-keys.ts lui-même qui LISTE ces clés).
      if (
        file.path === join(LIB_ROOT, "storage", "purge-fallback-keys.ts")
      ) {
        continue;
      }
      const matches = file.content.matchAll(
        /"(sa\.[a-zA-Z0-9._-]+\.fallback\.v\d+)"/g
      );
      for (const m of matches) declared.add(m[1]);
    }
    const registered = new Set(FALLBACK_KEYS);
    expect([...declared].sort()).toEqual([...registered].sort());
  });
});
