#!/usr/bin/env node
/**
 * scripts/security-smoke.mjs — Registre §13.1.2 automatisable.
 *
 * Rejoue la partie script des tests §5 du plan de stabilisation :
 *   • 5.1 auth (redirections + 401 + 403 client_viewer)
 *   • 5.2 cross-commercial B → ressources A (17 tests API + 1 PostgREST)
 *   • 5.3 tokens publics (invalide, expiré, désactivé, validate-token)
 *   • 5.4 storage (direct object 401 + signed URL 60s)
 *   • 5.5 RLS/anon (grep migrations + PostgREST anon sur table durcie)
 *
 * NON couvert par le script (à faire par Laurent en UI/dashboard) :
 *   • 5.3.5 inspection HTML page publique (aucun token_hash / URL Storage brute)
 *   • 5.4.2 inspection HTML fiche session interne (storage_path masqué)
 *   • 5.5.2 `select polname from pg_policies where polroles::text like '%anon%'`
 *
 * Exécution :
 *   npm run smoke:security                        # utilise l'env courant
 *   node scripts/security-smoke.mjs               # idem
 *
 * Variables d'env obligatoires (le script refuse de démarrer sinon) :
 *   APP_URL                    http://localhost:3000  (dev) ou URL preprod
 *   NEXT_PUBLIC_SUPABASE_URL   URL Supabase preprod
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  anon key
 *   COMMERCIAL_B_EMAIL         email compte Commercial B
 *   COMMERCIAL_B_PASSWORD      mot de passe Commercial B
 *   DIAG_A_ID                  UUID diagnostic créé par Commercial A (§4.2)
 *   SESSION_A_ID               UUID session créée par Commercial A (§4.2)
 *
 * Variables d'env optionnelles (tests skippés / marqués n/a sinon) :
 *   CLIENT_VIEWER_EMAIL, CLIENT_VIEWER_PASSWORD  → 5.1.4
 *   DATE_OPTION_A_ID           → 5.2.9
 *   PUBLIC_TOKEN_EXPIRED       → 5.3.2
 *   PUBLIC_TOKEN_DISABLED      → 5.3.3
 *   PUBLIC_TOKEN_VALID         → 5.4.3 (pour générer signed URL)
 *   STORAGE_OBJECT_PATH        → 5.4.1 (path relatif dans le bucket)
 *
 * Aucun secret n'est loggué. Les mots de passe ne sont jamais imprimés,
 * les JWT sont tronqués à 12 caractères dans les logs éventuels.
 *
 * Politique :
 *   • Aucune écriture nulle part.
 *   • Ne suppose PAS de service_role — utilise l'anon key + JWTs users.
 *   • Sortie non-nulle si au moins 1 test en ❌ (utilisable en CI).
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

// ─────────────────────────────────────────────────────────────────
// Config + validation env
// ─────────────────────────────────────────────────────────────────

const REQUIRED_ENV = [
  "APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "COMMERCIAL_B_EMAIL",
  "COMMERCIAL_B_PASSWORD",
  "DIAG_A_ID",
  "SESSION_A_ID",
];

const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error("❌ Variables d'env manquantes :");
  for (const k of missing) console.error("   -", k);
  console.error(
    "\nRéférence : cf. en-tête du script pour la liste complète et la sémantique."
  );
  process.exit(2);
}

const APP_URL = process.env.APP_URL.replace(/\/$/, "");
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const B_EMAIL = process.env.COMMERCIAL_B_EMAIL;
const B_PASSWORD = process.env.COMMERCIAL_B_PASSWORD;
const CLIENT_VIEWER_EMAIL = process.env.CLIENT_VIEWER_EMAIL ?? null;
const CLIENT_VIEWER_PASSWORD = process.env.CLIENT_VIEWER_PASSWORD ?? null;
const DIAG_A_ID = process.env.DIAG_A_ID;
const SESSION_A_ID = process.env.SESSION_A_ID;
const DATE_OPTION_A_ID = process.env.DATE_OPTION_A_ID ?? null;
const PUBLIC_TOKEN_EXPIRED = process.env.PUBLIC_TOKEN_EXPIRED ?? null;
const PUBLIC_TOKEN_DISABLED = process.env.PUBLIC_TOKEN_DISABLED ?? null;
const PUBLIC_TOKEN_VALID = process.env.PUBLIC_TOKEN_VALID ?? null;
const STORAGE_OBJECT_PATH = process.env.STORAGE_OBJECT_PATH ?? null;

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

/** @typedef {{ id: string; description: string; expected: string; obtained: string; verdict: "✅"|"❌"|"⚠️"|"n/a" }} TestResult */

/** @type {TestResult[]} */
const results = [];

function record(id, description, expected, obtained, verdict) {
  results.push({ id, description, expected, obtained, verdict });
}

function skip(id, description, reason) {
  record(id, description, "—", `skipped (${reason})`, "n/a");
}

async function login(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Login échoué pour ${email} : HTTP ${res.status} — ${body.slice(0, 200)}`
    );
  }
  // La réponse contient toute la session : access_token, refresh_token,
  // token_type, expires_in, expires_at, user. On la garde entière pour
  // pouvoir construire le cookie @supabase/ssr côté Next.js.
  return await res.json();
}

// ─────────────────────────────────────────────────────────────────
// Cookies @supabase/ssr — les routes Next.js lisent l'identité via
// `createServerClient` de @supabase/ssr, PAS via un header Bearer.
// Le cookie posé côté browser s'appelle `sb-<projectRef>-auth-token`
// et vaut `base64-<base64(JSON.stringify(session))>`. Si le payload
// dépasse ~3180 bytes, @supabase/ssr chunke en `.0`, `.1`, etc.
// Le smoke reproduit ce format à partir de la session retournée par
// `POST /auth/v1/token?grant_type=password`.
// ─────────────────────────────────────────────────────────────────

const PROJECT_REF = new URL(SUPABASE_URL).hostname.split(".")[0];
const COOKIE_NAME_BASE = `sb-${PROJECT_REF}-auth-token`;
const COOKIE_CHUNK_MAX = 3180;

function sessionToCookies(session) {
  const raw =
    "base64-" +
    Buffer.from(JSON.stringify(session), "utf8").toString("base64");
  if (raw.length <= COOKIE_CHUNK_MAX) {
    return [`${COOKIE_NAME_BASE}=${raw}`];
  }
  const parts = [];
  for (let i = 0, idx = 0; i < raw.length; i += COOKIE_CHUNK_MAX, idx++) {
    parts.push(`${COOKIE_NAME_BASE}.${idx}=${raw.slice(i, i + COOKIE_CHUNK_MAX)}`);
  }
  return parts;
}

function cookieHeader(session) {
  return sessionToCookies(session).join("; ");
}

/**
 * Test HTTP standard. Vérifie que le code de retour est dans
 * `expectedStatuses`. Renvoie la description obtenue (HTTP + éventuel
 * fragment de body).
 */
async function testHttp({
  id,
  description,
  method,
  url,
  headers = {},
  body = null,
  expectedStatuses,
  expectedText,
  redirectExpected = false,
}) {
  try {
    const init = {
      method,
      headers,
      redirect: "manual",
    };
    if (body !== null) {
      init.body = typeof body === "string" ? body : JSON.stringify(body);
      init.headers["Content-Type"] =
        init.headers["Content-Type"] ?? "application/json";
    }
    const res = await fetch(url, init);
    const status = res.status;
    let bodyText = "";
    if (!redirectExpected) {
      try {
        bodyText = (await res.text()).slice(0, 240);
      } catch {
        bodyText = "";
      }
    }
    const statusOk = expectedStatuses.includes(status);
    const textOk =
      expectedText === undefined ? true : bodyText.includes(expectedText);
    const verdict = statusOk && textOk ? "✅" : "❌";
    const obtained = `HTTP ${status}${
      bodyText ? ` · body: ${bodyText.replace(/\s+/g, " ")}` : ""
    }`;
    record(
      id,
      description,
      `status ∈ {${expectedStatuses.join(",")}}${
        expectedText ? ` + contains "${expectedText}"` : ""
      }`,
      obtained,
      verdict
    );
  } catch (err) {
    record(
      id,
      description,
      `status ∈ {${expectedStatuses.join(",")}}`,
      `exception: ${err.message}`,
      "❌"
    );
  }
}

// ─────────────────────────────────────────────────────────────────
// Auth commune
// ─────────────────────────────────────────────────────────────────

/** @type {any} */
let SESSION_B;
try {
  SESSION_B = await login(B_EMAIL, B_PASSWORD);
} catch (err) {
  console.error("❌ Login Commercial B impossible :", err.message);
  process.exit(2);
}
const JWT_B = SESSION_B.access_token;
const COOKIE_B = cookieHeader(SESSION_B);

/** @type {any} */
let SESSION_VIEWER = null;
if (CLIENT_VIEWER_EMAIL && CLIENT_VIEWER_PASSWORD) {
  try {
    SESSION_VIEWER = await login(CLIENT_VIEWER_EMAIL, CLIENT_VIEWER_PASSWORD);
  } catch (err) {
    console.error(
      "⚠️  Login client_viewer échoué (5.1.4 sera skippé) :",
      err.message
    );
  }
}
const COOKIE_VIEWER = SESSION_VIEWER ? cookieHeader(SESSION_VIEWER) : null;

// Header pour PostgREST direct (5.2.1, 5.2.2, 5.5.3) — le bon canal
// d'auth pour /rest/v1/ est bien Bearer + apikey, PAS le cookie ssr.
const B_AUTH = { Authorization: `Bearer ${JWT_B}`, apikey: ANON_KEY };

// ─────────────────────────────────────────────────────────────────
// §5.1 Auth
// ─────────────────────────────────────────────────────────────────

await testHttp({
  id: "5.1.1",
  description: "GET /cockpit anon → redirection login",
  method: "GET",
  url: `${APP_URL}/cockpit`,
  expectedStatuses: [302, 307, 308],
  redirectExpected: true,
});

await testHttp({
  id: "5.1.2",
  description: "GET /diagnostics anon → redirection login",
  method: "GET",
  url: `${APP_URL}/diagnostics`,
  expectedStatuses: [302, 307, 308],
  redirectExpected: true,
});

await testHttp({
  id: "5.1.3",
  description: "GET /api/diagnostics anon → 401 unauthenticated",
  method: "GET",
  url: `${APP_URL}/api/diagnostics`,
  expectedStatuses: [401],
  expectedText: "unauthenticated",
});

if (COOKIE_VIEWER) {
  // Si le status est une redirection, on vérifie manuellement que
  // Location pointe vers une page « refus » (/login, /forbidden) et
  // pas vers une page interne — sinon c'est un finding sécurité.
  // Cookie @supabase/ssr utilisé — pas de header Bearer (Next.js SSR
  // lit exclusivement le cookie côté createServerClient).
  try {
    const res = await fetch(`${APP_URL}/cockpit`, {
      method: "GET",
      headers: { Cookie: COOKIE_VIEWER },
      redirect: "manual",
    });
    const status = res.status;
    const location = res.headers.get("location") ?? "";
    const isRedirect = [302, 307, 308].includes(status);
    const isRefusalPage =
      isRedirect &&
      (/\/login(\?|$)/.test(location) ||
        /\/forbidden(\?|$)/.test(location));
    let verdict = "❌";
    let obtained = `HTTP ${status}${location ? ` · Location: ${location}` : ""}`;
    if (status === 403) {
      verdict = "✅";
    } else if (isRedirect && isRefusalPage) {
      verdict = "✅";
    } else if (isRedirect && !isRefusalPage) {
      // Location pointe vers une page interne — client_viewer y arrive.
      verdict = "❌";
      obtained = `FINDING SÉCURITÉ : redirection vers page interne (${location})`;
    }
    record(
      "5.1.4",
      "GET /cockpit avec client_viewer → 403 ou redirection vers /login|/forbidden",
      "403 OU 3xx vers /login|/forbidden",
      obtained,
      verdict
    );
  } catch (err) {
    record(
      "5.1.4",
      "GET /cockpit avec client_viewer",
      "403 OU 3xx vers /login|/forbidden",
      `exception: ${err.message}`,
      "❌"
    );
  }
} else {
  skip("5.1.4", "GET /cockpit avec client_viewer", "compte non fourni");
}

// ─────────────────────────────────────────────────────────────────
// §5.2 Cross-commercial (Commercial B sur ressources A)
// ─────────────────────────────────────────────────────────────────

// 5.2.1 : PostgREST filtré sur session_A_id avec JWT B → RLS masque → 0 ligne
{
  const url = `${SUPABASE_URL}/rest/v1/training_sessions?id=eq.${encodeURIComponent(
    SESSION_A_ID
  )}&select=id`;
  const res = await fetch(url, { headers: B_AUTH });
  const body = await res.text();
  let obtained = `HTTP ${res.status} · body: ${body.slice(0, 200)}`;
  let verdict = "❌";
  if (res.ok) {
    let arr = [];
    try {
      arr = JSON.parse(body);
    } catch {
      /* keep verdict ❌ */
    }
    if (Array.isArray(arr) && arr.length === 0) {
      obtained = `HTTP 200 · [] (0 ligne)`;
      verdict = "✅";
    } else {
      obtained = `HTTP 200 · ${arr.length} ligne(s) visibles`;
    }
  }
  record(
    "5.2.1",
    "PostgREST training_sessions?id=eq.<sessionA> avec JWT B",
    "HTTP 200 + tableau vide (RLS masque)",
    obtained,
    verdict
  );
}

// 5.2.2 : idem sur diagnostics
{
  const url = `${SUPABASE_URL}/rest/v1/diagnostics?id=eq.${encodeURIComponent(
    DIAG_A_ID
  )}&select=id`;
  const res = await fetch(url, { headers: B_AUTH });
  const body = await res.text();
  let obtained = `HTTP ${res.status} · body: ${body.slice(0, 200)}`;
  let verdict = "❌";
  if (res.ok) {
    let arr = [];
    try {
      arr = JSON.parse(body);
    } catch {
      /* keep ❌ */
    }
    if (Array.isArray(arr) && arr.length === 0) {
      obtained = `HTTP 200 · [] (0 ligne)`;
      verdict = "✅";
    } else {
      obtained = `HTTP 200 · ${arr.length} ligne(s) visibles`;
    }
  }
  record(
    "5.2.2",
    "PostgREST diagnostics?id=eq.<diagA> avec JWT B",
    "HTTP 200 + tableau vide (RLS masque)",
    obtained,
    verdict
  );
}

async function api403(id, description, method, path, body = null) {
  // Cookie SSR au lieu de Bearer : les routes Next.js utilisent
  // createServerClient (@supabase/ssr) qui reconnaît l'utilisateur via
  // le cookie sb-<projectRef>-auth-token, jamais via un header
  // Authorization. Avec un Bearer seul, elles voient l'appelant
  // comme anonyme et renvoient 401 unauthenticated → verdict ❌ faux
  // positif. C'est ce qu'a montré la 1re passe de Laurent (17 ❌
  // dont 15 par ce mécanisme).
  await testHttp({
    id,
    description,
    method,
    url: `${APP_URL}${path}`,
    headers: { Cookie: COOKIE_B },
    body,
    expectedStatuses: [403],
    expectedText: "forbidden",
  });
}

await api403(
  "5.2.3",
  "GET documents session A",
  "GET",
  `/api/sessions/${SESSION_A_ID}/documents`
);
await api403(
  "5.2.4",
  "POST generate-training-support session A",
  "POST",
  `/api/generate-training-support`,
  { sessionId: SESSION_A_ID }
);
await api403(
  "5.2.5",
  "POST design-training-support session A",
  "POST",
  `/api/design-training-support`,
  { sessionId: SESSION_A_ID }
);
await api403(
  "5.2.6",
  "POST create-access-link session A",
  "POST",
  `/api/sessions/${SESSION_A_ID}/create-access-link`,
  { accessType: "client_session_view" }
);
await api403(
  "5.2.7",
  "GET date-options session A",
  "GET",
  `/api/sessions/${SESSION_A_ID}/date-options`
);
await api403(
  "5.2.8",
  "POST date-options session A",
  "POST",
  `/api/sessions/${SESSION_A_ID}/date-options`,
  { startsAt: "2026-12-31T09:00:00Z" }
);
if (DATE_OPTION_A_ID) {
  await api403(
    "5.2.9",
    "DELETE date-option de A",
    "DELETE",
    `/api/sessions/${SESSION_A_ID}/date-options/${DATE_OPTION_A_ID}`
  );
} else {
  skip("5.2.9", "DELETE date-option de A", "DATE_OPTION_A_ID non fourni");
}
await api403(
  "5.2.10",
  "GET activity session A",
  "GET",
  `/api/sessions/${SESSION_A_ID}/activity`
);
await api403(
  "5.2.11",
  "POST activity/log session A",
  "POST",
  `/api/activity/log`,
  {
    sessionId: SESSION_A_ID,
    eventType: "note_added",
  }
);
await api403(
  "5.2.12",
  "POST analyze-training-need diagnostic A",
  "POST",
  `/api/analyze-training-need`,
  { diagnosticId: DIAG_A_ID }
);
await api403(
  "5.2.13",
  "POST generate-training-proposal diagnostic A",
  "POST",
  `/api/generate-training-proposal`,
  { diagnosticId: DIAG_A_ID }
);

// 5.2.14 : historiquement suspect — on rapporte le status quel qu'il soit.
// Cookie SSR (pas Bearer) pour que Next.js reconnaisse bien B.
{
  const url = `${APP_URL}/api/diagnostics/${DIAG_A_ID}/summary`;
  const res = await fetch(url, { headers: { Cookie: COOKIE_B } });
  const body = (await res.text()).slice(0, 240);
  const verdict = res.status === 403 ? "✅" : "❌";
  const prefix = res.status === 200 ? "FINDING SÉCURITÉ : " : "";
  const obtained = `${prefix}HTTP ${res.status} · body: ${body.replace(/\s+/g, " ")}`;
  record(
    "5.2.14",
    "GET diagnostics/<diagA>/summary avec JWT B",
    "403 (attendu) — 200 = finding à ouvrir",
    obtained,
    verdict
  );
}

await api403(
  "5.2.15",
  "GET post-training-review session A",
  "GET",
  `/api/sessions/${SESSION_A_ID}/post-training-review`
);
await api403(
  "5.2.16",
  "PUT post-training-review session A",
  "PUT",
  `/api/sessions/${SESSION_A_ID}/post-training-review`,
  { status: "completed" }
);
await api403(
  "5.2.17",
  "GET support-quality session A",
  "GET",
  `/api/sessions/${SESSION_A_ID}/support-quality`
);
await api403(
  "5.2.18",
  "PUT support-quality session A",
  "PUT",
  `/api/sessions/${SESSION_A_ID}/support-quality`,
  { status: "validated" }
);

// ─────────────────────────────────────────────────────────────────
// §5.3 Tokens publics
// ─────────────────────────────────────────────────────────────────

// Marqueurs texte alignés sur le composant `PublicTokenError`
// (src/app/public/_components/public-token-error.tsx) :
//   • malformed / not_found → fallback "Lien invalide."
//   • expired               → "Ce lien a expiré."
//   • disabled              → "Ce lien a été désactivé par Start Academy."
// Titre commun toutes variantes : "Accès impossible".
// Le token "invalide-de-toutes-facons" (23 chars) passe la check de
// longueur (≥ 16 dans validatePublicToken) puis n'est pas trouvé en
// DB → reason "not_found" → message rendu spécifique
// "Lien introuvable ou révoqué." (cf. REASON_LABEL dans
// src/app/public/_components/public-token-error.tsx). Marqueur
// robuste : "introuvable" (mot distinctif du case not_found, sûr
// contre variations typographiques d'apostrophes / tirets).
await testHttp({
  id: "5.3.1",
  description: "GET /public/session/<token_invalide>",
  method: "GET",
  url: `${APP_URL}/public/session/invalide-de-toutes-facons`,
  expectedStatuses: [200, 404, 410, 400],
  expectedText: "introuvable",
});

if (PUBLIC_TOKEN_EXPIRED) {
  await testHttp({
    id: "5.3.2",
    description: "GET /public/session/<token_expiré>",
    method: "GET",
    url: `${APP_URL}/public/session/${PUBLIC_TOKEN_EXPIRED}`,
    expectedStatuses: [200, 404, 410, 400],
    // Marqueur strict "Ce lien a expiré." (message dédié `expired`).
    expectedText: "expiré",
  });
} else {
  skip("5.3.2", "GET /public/session/<token_expiré>", "token expiré non fourni");
}

if (PUBLIC_TOKEN_DISABLED) {
  await testHttp({
    id: "5.3.3",
    description: "GET /public/session/<token_désactivé>",
    method: "GET",
    url: `${APP_URL}/public/session/${PUBLIC_TOKEN_DISABLED}`,
    expectedStatuses: [200, 404, 410, 400],
    // Marqueur strict "Ce lien a été désactivé par Start Academy." —
    // distinct de "Lien invalide" (fallback) et "Ce lien a expiré"
    // (case `expired`). Si l'app affiche à la place le message
    // générique, ce test échoue et signale un downgrade UX à corriger.
    expectedText: "désactivé",
  });
} else {
  skip(
    "5.3.3",
    "GET /public/session/<token_désactivé>",
    "token désactivé non fourni"
  );
}

await testHttp({
  id: "5.3.4",
  description: "POST /api/public/validate-token { token: <fake> }",
  method: "POST",
  url: `${APP_URL}/api/public/validate-token`,
  body: { token: "manifestement-faux" },
  expectedStatuses: [200],
  expectedText: '"valid":false',
});

skip("5.3.5", "Inspection HTML page publique (aucun token_hash)", "UI Laurent");

// ─────────────────────────────────────────────────────────────────
// §5.4 Storage
// ─────────────────────────────────────────────────────────────────

if (STORAGE_OBJECT_PATH) {
  await testHttp({
    id: "5.4.1",
    description: "GET direct storage object sans auth",
    method: "GET",
    url: `${SUPABASE_URL}/storage/v1/object/session-documents/${STORAGE_OBJECT_PATH}`,
    expectedStatuses: [400, 401, 403, 404],
  });
} else {
  skip("5.4.1", "GET direct storage object sans auth", "STORAGE_OBJECT_PATH non fourni");
}

skip(
  "5.4.2",
  "Inspection HTML fiche session interne (storage_path masqué)",
  "UI Laurent"
);

// 5.4.3 : signed URL expire ≤ 60s.
// Approche : Commercial B ne peut pas générer d'URL signée sur la
// session de A (RLS), donc ce test doit être fait avec un JWT qui a
// le droit — typiquement Commercial A. Le script actuel n'a pas
// COMMERCIAL_A_PASSWORD (on ne veut pas exposer A). On skip et on
// laisse à Laurent (ou une extension future du script).
skip(
  "5.4.3",
  "Signed URL /api/sessions/<A>/documents expire ≤ 60s",
  "nécessite JWT Commercial A — hors périmètre B-only"
);

// ─────────────────────────────────────────────────────────────────
// §5.5 RLS / policies anon
// ─────────────────────────────────────────────────────────────────

// 5.5.1 : scan Node local sur migrations. Un simple `grep "to anon"`
// matche aussi les commentaires SQL (`-- Pas de policy to anon...`) —
// c'est ce qu'a montré la 1re passe. On lit les fichiers ligne par
// ligne, on ignore les lignes commentées, et on ne retient que les
// vraies clauses de policy contenant `to anon`.
//
// Heuristique retenue :
//   • Ignorer les lignes dont le PREMIER caractère non-blanc est `--`.
//   • Sur les autres lignes, matcher \bto anon\b (mot entier).
//   • Rapporter les matches (fichier:ligne + extrait).
{
  const __filename = fileURLToPath(import.meta.url);
  const repoRoot = path.resolve(path.dirname(__filename), "..");
  const migrationsDir = path.join(repoRoot, "supabase", "migrations");
  const commentRe = /^\s*--/;
  const anonRe = /\bto\s+anon\b/;
  const matches = [];
  try {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();
    for (const f of files) {
      const abs = path.join(migrationsDir, f);
      const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (commentRe.test(line)) continue;
        if (anonRe.test(line)) {
          matches.push(`${f}:${i + 1}: ${line.trim().slice(0, 120)}`);
        }
      }
    }
    const verdict = matches.length === 0 ? "✅" : "❌";
    const obtained =
      matches.length === 0
        ? "0 clause `to anon` en policy active (commentaires exclus)"
        : `${matches.length} match(es) : ${matches.slice(0, 3).join(" | ")}`;
    record(
      "5.5.1",
      "scan migrations : clause `to anon` en policy active (hors commentaires)",
      "0 occurrence",
      obtained,
      verdict
    );
  } catch (err) {
    record(
      "5.5.1",
      "scan migrations : clause `to anon` en policy active",
      "0 occurrence",
      `exception: ${err.message}`,
      "❌"
    );
  }
}

skip(
  "5.5.2",
  "SQL brut pg_policies where 'anon' = any(polroles)",
  "UI Laurent — déjà validé 2026-07-07"
);

// 5.5.3 : anon PostgREST sur table durcie
{
  const url = `${SUPABASE_URL}/rest/v1/training_sessions?select=id&limit=5`;
  const res = await fetch(url, { headers: { apikey: ANON_KEY } });
  const body = await res.text();
  let verdict = "❌";
  let obtained = `HTTP ${res.status} · body: ${body.slice(0, 200)}`;
  if (res.ok) {
    let arr = [];
    try {
      arr = JSON.parse(body);
    } catch {
      /* keep ❌ */
    }
    if (Array.isArray(arr) && arr.length === 0) {
      verdict = "✅";
      obtained = `HTTP 200 · [] (RLS bloque)`;
    } else {
      obtained = `HTTP 200 · ${arr.length} ligne(s) visibles — RLS trouée`;
    }
  } else if ([401, 403].includes(res.status)) {
    verdict = "✅";
    obtained = `HTTP ${res.status} · RLS bloque explicitement`;
  }
  record(
    "5.5.3",
    "curl anon PostgREST sur training_sessions",
    "HTTP 200 + [] OU 401/403",
    obtained,
    verdict
  );
}

// ─────────────────────────────────────────────────────────────────
// Rapport final
// ─────────────────────────────────────────────────────────────────

const okCount = results.filter((r) => r.verdict === "✅").length;
const koCount = results.filter((r) => r.verdict === "❌").length;
const warnCount = results.filter((r) => r.verdict === "⚠️").length;
const skipCount = results.filter((r) => r.verdict === "n/a").length;

console.log("");
console.log(
  "=============================================================================="
);
console.log(
  "Registre §13.1.2 — smoke sécurité §5 (script)                                    "
);
console.log(
  "=============================================================================="
);
console.log("");

const idW = 6;
const descW = 60;
const expW = 40;
const obtW = 60;

function pad(s, w) {
  if (s.length >= w) return s.slice(0, w - 1) + "…";
  return s + " ".repeat(w - s.length);
}

console.log(
  `${pad("Id", idW)} | ${pad("Test", descW)} | ${pad("Attendu", expW)} | ${pad(
    "Obtenu",
    obtW
  )} | Verdict`
);
console.log(
  `${"-".repeat(idW)}-+-${"-".repeat(descW)}-+-${"-".repeat(
    expW
  )}-+-${"-".repeat(obtW)}-+--------`
);
for (const r of results) {
  console.log(
    `${pad(r.id, idW)} | ${pad(r.description, descW)} | ${pad(
      r.expected,
      expW
    )} | ${pad(r.obtained, obtW)} | ${r.verdict}`
  );
}

console.log("");
console.log(
  `Résumé : ✅ ${okCount} · ❌ ${koCount} · ⚠️ ${warnCount} · n/a ${skipCount}`
);
console.log("");

if (koCount > 0) {
  console.error(
    `❌ ${koCount} test(s) en échec — chaque ligne ❌ génère un ticket §11.2.`
  );
  process.exit(1);
}
console.log("✅ Aucun test en échec côté script. Reste : lignes n/a à faire par Laurent.");
