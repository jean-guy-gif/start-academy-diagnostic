import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from "./document-types";

/**
 * Test de contrat F-1 (§8 durcissement Storage, 2026-07-12) — alignement
 * code JS ↔ bucket Supabase Storage.
 *
 * La migration `20260712140000_extend_bucket_session_documents_limits.sql`
 * pose `file_size_limit` et `allowed_mime_types` au niveau du bucket
 * `session-documents`. Ces valeurs DOIVENT rester alignées sur les
 * constantes `ALLOWED_MIME_TYPES` et `MAX_FILE_SIZE_BYTES` de
 * `document-types.ts`, qui gouvernent la validation côté route publique.
 *
 * On parse le fichier SQL de migration (source unique côté DB) et on le
 * compare aux constantes JS (source unique côté route). Toute divergence
 * fait planter le test — leçon T-3 (answer categories) et T-4 (source
 * check_constraint) : les listes dupliquées silencieusement dérivent.
 */

const MIGRATION_PATH = join(
  process.cwd(),
  "supabase/migrations/20260712140000_extend_bucket_session_documents_limits.sql"
);

function readMigration(): string {
  // Strip les commentaires SQL (lignes commençant par `--`) pour éviter
  // qu'un regex capture accidentellement des valeurs de commentaire
  // (ex: « = 10 Mo » qui matcherait `= 10`).
  return readFileSync(MIGRATION_PATH, "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

function extractMigrationMimes(sql: string): string[] {
  // Capture le bloc `allowed_mime_types = array[ ... ]` puis extrait les
  // littéraux simple-quote entre les crochets.
  const match = sql.match(/allowed_mime_types\s*=\s*array\[([\s\S]*?)\]/i);
  if (!match) throw new Error("Bloc `allowed_mime_types = array[...]` introuvable dans la migration");
  const inner = match[1];
  const literals = Array.from(inner.matchAll(/'([^']+)'/g)).map((m) => m[1]);
  if (literals.length === 0) throw new Error("Aucun MIME extrait de la migration");
  return literals;
}

function extractMigrationFileSizeLimit(sql: string): number {
  // Ancré sur `set file_size_limit` (contexte UPDATE) pour éviter le bruit.
  const match = sql.match(/set\s+file_size_limit\s*=\s*(\d+)/i);
  if (!match) throw new Error("`set file_size_limit = <n>` introuvable dans la migration");
  return Number.parseInt(match[1], 10);
}

describe("Bucket session-documents — contract JS ⇄ SQL (F-1)", () => {
  it("la liste MIME de la migration correspond EXACTEMENT à ALLOWED_MIME_TYPES", () => {
    const sql = readMigration();
    const sqlMimes = extractMigrationMimes(sql);
    const jsMimes = Object.keys(ALLOWED_MIME_TYPES);

    // Ensembles pour ignorer l'ordre mais capturer toute différence.
    const sqlSet = new Set(sqlMimes);
    const jsSet = new Set(jsMimes);

    const missingInSql = jsMimes.filter((m) => !sqlSet.has(m));
    const missingInJs = sqlMimes.filter((m) => !jsSet.has(m));

    expect(
      missingInSql,
      `MIME présents dans document-types.ts mais absents de la migration : ${missingInSql.join(", ") || "(aucun)"}`
    ).toEqual([]);
    expect(
      missingInJs,
      `MIME présents dans la migration mais absents de document-types.ts : ${missingInJs.join(", ") || "(aucun)"}`
    ).toEqual([]);
    expect(sqlMimes.length).toBe(jsMimes.length);
  });

  it("file_size_limit de la migration correspond à MAX_FILE_SIZE_BYTES", () => {
    const sql = readMigration();
    const sqlLimit = extractMigrationFileSizeLimit(sql);
    expect(sqlLimit).toBe(MAX_FILE_SIZE_BYTES);
  });

  it("MAX_FILE_SIZE_BYTES reste à 10 Mo (invariant produit)", () => {
    // Sécurité supplémentaire : si un développeur monte MAX_FILE_SIZE_BYTES
    // dans document-types.ts sans écrire une migration additive pour lever
    // aussi le file_size_limit du bucket, l'assertion précédente casse ET
    // celle-ci verrouille l'attendu métier (10 Mo).
    expect(MAX_FILE_SIZE_BYTES).toBe(10 * 1024 * 1024);
  });
});
