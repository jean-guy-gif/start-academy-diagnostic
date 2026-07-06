#!/usr/bin/env node

/**
 * Vérifie que la table `training_modules` est seedée sur l'instance
 * Supabase distante.
 *
 * Usage : `npm run check:catalog`
 *
 * Exit codes :
 *   0  → Catalogue OK (count > 0) OU Supabase non configuré (env absent).
 *   1  → Erreur Supabase (réseau, auth refusée, schéma absent…).
 *   2  → Catalogue VIDE — seed à appliquer.
 *
 * Stratégie de clé :
 *   1. SUPABASE_SERVICE_ROLE_KEY si disponible (recommandé : bypass RLS,
 *      donc le script voit la VRAIE valeur même si aucune policy `anon`
 *      n'est ouverte sur `training_modules`).
 *   2. Fallback NEXT_PUBLIC_SUPABASE_ANON_KEY — peut renvoyer 0 si RLS
 *      bloque, ce qui produit un faux négatif. Le script le signale.
 *
 * Aucune valeur de clé n'est imprimée — seul le mode (`service_role` |
 * `anon`) apparaît dans la sortie.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

function loadEnv() {
  const candidates = [
    resolve(projectRoot, ".env.local"),
    resolve(projectRoot, ".env"),
  ];
  const env = { ...process.env };
  for (const file of candidates) {
    if (!existsSync(file)) continue;
    const content = readFileSync(file, "utf8");
    for (const rawLine of content.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in env)) env[key] = value;
    }
  }
  return env;
}

function extractProjectRef(url) {
  try {
    const u = new URL(url);
    const match = u.hostname.match(/^([a-z0-9]+)\.supabase\.co$/i);
    return match ? match[1] : u.hostname;
  } catch {
    return null;
  }
}

function instructionSeed() {
  console.log("");
  console.log("Pour seeder le catalogue après `supabase db push` :");
  console.log("  1. Ouvrir le SQL Editor du projet Supabase.");
  console.log("  2. Copier le contenu de supabase/seed.sql.");
  console.log("  3. Exécuter.");
  console.log(
    "  4. Vérifier dans Table editor → public.training_modules qu'il y a ~79 lignes."
  );
  console.log("");
  console.log("Documentation complète : docs/setup-supabase.md");
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = env.SUPABASE_SERVICE_ROLE_KEY;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url) {
  console.log(
    "ℹ️  NEXT_PUBLIC_SUPABASE_URL absent — Supabase non configuré. Aucun contrôle effectué."
  );
  instructionSeed();
  process.exit(0);
}

const key = serviceRole || anon;
const keyMode = serviceRole ? "service_role" : "anon";

if (!key) {
  console.log(
    "ℹ️  Aucune clé Supabase disponible (.env.local incomplet). Aucun contrôle effectué."
  );
  instructionSeed();
  process.exit(0);
}

const projectRef = extractProjectRef(url);

console.log("Vérification catalogue Supabase");
console.log(`  Project ref : ${projectRef ?? "(inconnu)"}`);
console.log(`  Clé utilisée : ${keyMode}`);
if (keyMode === "anon") {
  console.log(
    "  ⚠️  Mode anon : si RLS ne donne pas SELECT à anon sur training_modules,"
  );
  console.log(
    "      le compte renverra 0 (faux négatif). Préférer SUPABASE_SERVICE_ROLE_KEY."
  );
}
console.log("");

const endpoint = `${url.replace(/\/$/, "")}/rest/v1/training_modules?select=id&limit=1`;

let response;
try {
  response = await fetch(endpoint, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Range: "0-0",
      // Sans `count=exact`, Content-Range vaut `*/<...>` — count introuvable.
      Prefer: "count=exact",
    },
  });
} catch (err) {
  console.error(
    `❌ Erreur réseau : ${err instanceof Error ? err.message : String(err)}`
  );
  process.exit(1);
}

const contentRange = response.headers.get("content-range") ?? "";
console.log(`  HTTP status : ${response.status}`);
console.log(`  Content-Range : ${contentRange || "(absent)"}`);

if (!response.ok && response.status !== 206) {
  // PostgREST renvoie 200 sans rows OU 206 partial pour Range.
  // Tout autre code = erreur réelle. Affiche tout ce que Supabase a
  // remonté (code, message, hint, status) sans interpréter "vide".
  let errorPayload = null;
  try {
    errorPayload = await response.json();
  } catch {
    /* ignore — body pas json */
  }
  console.error("");
  console.error("❌ Supabase a renvoyé une erreur.");
  if (errorPayload && typeof errorPayload === "object") {
    if ("code" in errorPayload)
      console.error(`   code    : ${errorPayload.code}`);
    if ("message" in errorPayload)
      console.error(`   message : ${errorPayload.message}`);
    if ("hint" in errorPayload && errorPayload.hint)
      console.error(`   hint    : ${errorPayload.hint}`);
    if ("status" in errorPayload)
      console.error(`   status  : ${errorPayload.status}`);
  } else {
    console.error(`   body    : ${(await response.text()).slice(0, 300)}`);
  }
  process.exit(1);
}

// Le count exact arrive via Content-Range = `<start>-<end>/<total>`.
// Si `total` vaut `*`, PostgREST n'a pas pu calculer.
const total = (() => {
  const match = contentRange.match(/\/(\d+|\*)$/);
  if (!match) return null;
  if (match[1] === "*") return null;
  return Number(match[1]);
})();

if (total === null) {
  console.warn("");
  console.warn(
    "⚠️  Content-Range absent ou non numérique — Supabase n'a pas calculé le total."
  );
  console.warn(
    "    Cause possible : RLS bloque la lecture (clé anon sans policy)."
  );
  if (keyMode === "anon") {
    console.warn(
      "    Essayer à nouveau avec SUPABASE_SERVICE_ROLE_KEY dans .env.local."
    );
  }
  process.exit(1);
}

console.log(`  Lignes training_modules : ${total}`);
console.log("");

if (total === 0) {
  if (keyMode === "anon") {
    console.error(
      "❌ Count = 0 en mode anon — peut être un FAUX NÉGATIF (RLS)."
    );
    console.error(
      "   Vérifier avec service_role avant de relancer le seed :"
    );
    console.error(
      "   ajouter SUPABASE_SERVICE_ROLE_KEY dans .env.local et relancer."
    );
    process.exit(1);
  }
  console.error("❌ La table training_modules est VIDE.");
  console.error(
    "   `supabase db push` applique les migrations mais N'EXÉCUTE PAS supabase/seed.sql."
  );
  instructionSeed();
  process.exit(2);
}

console.log(`✅ Catalogue Supabase OK : ${total} modules trouvés.`);
process.exit(0);
