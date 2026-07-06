/**
 * Service diagnostic — utilisé depuis les composants clients.
 *
 * Stratégie (Phase 2B préparation) :
 *   1. **Toujours appeler les routes API internes** (`/api/diagnostics/*`)
 *      qui sont gated par `requireApiRole(INTERNAL_APP_ROLES)` et
 *      utilisent service_role côté serveur pour écrire avec
 *      `created_by` correctement renseigné.
 *   2. En cas d'échec API (réseau, 5xx, 503), bascule sur localStorage
 *      uniquement si `isLocalFallbackAllowed()` (mode dev / démo).
 *   3. En preprod/prod (`APP_ENV=preprod|production`), le fallback est
 *      interdit : on renvoie un `ServiceResult` avec
 *      `mode: "unavailable"` + `error` explicite, et `data` = null.
 *      Les composants doivent vérifier `error`/`data` avant de
 *      poursuivre.
 *
 * `createSupabaseBrowserClient` n'est plus utilisé directement ici —
 * on passe systématiquement par l'API qui détient le service_role.
 * Une fois la Phase 2B durcie (RLS par `created_by`), c'est la seule
 * voie qui restera sûre.
 */

import type { AnswerCategory, ProfileTarget } from "@/types";
import { logActivityFromClient } from "@/lib/activity/log-from-client";
import { isLocalFallbackAllowed } from "@/lib/storage/local-fallback";

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

export type ServiceMode = "supabase" | "local" | "unavailable";

export interface ServiceResult<T> {
  data: T | null;
  mode: ServiceMode;
  error: string | null;
}

export type DiagnosticMode = "guided" | "transcript" | "hybrid";

export type DiagnosticStatus =
  | "draft"
  | "in_progress"
  | "transcript_uploaded"
  | "ai_analyzed"
  | "to_review"
  | "validated";

// v1.0 — `AnswerCategory` est désormais défini dans `src/types/index.ts`
// et couvre les 11 chapitres du référentiel diagnostic (en plus des 4
// valeurs MVP1 conservées). Ré-export ici pour compat des imports
// historiques (`import { AnswerCategory } from "@/lib/diagnostics/diagnostic-service"`).
export type { AnswerCategory };

export interface CreateClientInput {
  companyName: string;
  director: string | null;
  email: string | null;
  phone: string | null;
  collaboratorsCount: number | null;
  teamTypology: ProfileTarget[];
}

export interface CreateDiagnosticInput {
  clientId: string;
  mode: DiagnosticMode;
  declaredGoal: string | null;
  profilesInScope: ProfileTarget[];
  expectedParticipants: number | null;
  notes: string | null;
}

export interface SaveAnswerInput {
  diagnosticId: string;
  questionId: string;
  questionText: string;
  category: AnswerCategory | null;
  answer: string | null;
  note: string | null;
  isWeakSignal: boolean;
  isSkipped: boolean;
}

export interface ClientRecord {
  id: string;
  companyName: string;
  director: string | null;
  email: string | null;
  phone: string | null;
  collaboratorsCount: number | null;
  teamTypology: ProfileTarget[];
  createdAt: string;
}

export interface DiagnosticRecord {
  id: string;
  clientId: string;
  mode: DiagnosticMode;
  status: DiagnosticStatus;
  declaredGoal: string | null;
  profilesInScope: ProfileTarget[];
  expectedParticipants: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnswerRecord {
  id: string;
  diagnosticId: string;
  questionId: string;
  questionText: string;
  category: AnswerCategory | null;
  answer: string | null;
  note: string | null;
  isWeakSignal: boolean;
  isSkipped: boolean;
  createdAt: string;
}

export interface DiagnosticSummary {
  diagnostic: DiagnosticRecord;
  client: ClientRecord | null;
  answers: AnswerRecord[];
  stats: {
    answered: number;
    skipped: number;
    weakSignals: number;
  };
}

export interface DiagnosticListItem {
  diagnostic: DiagnosticRecord;
  client: ClientRecord | null;
  answerCount: number;
}

// ---------------------------------------------------------------------------
// localStorage fallback store — usage strictement dev / démo
// ---------------------------------------------------------------------------

const LS_KEY = "sa.diagnostics.fallback.v1";

interface LocalStore {
  clients: ClientRecord[];
  diagnostics: DiagnosticRecord[];
  answers: AnswerRecord[];
}

const emptyStore = (): LocalStore => ({
  clients: [],
  diagnostics: [],
  answers: [],
});

function readLocal(): LocalStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw) as LocalStore;
    return {
      clients: parsed.clients ?? [],
      diagnostics: parsed.diagnostics ?? [],
      answers: parsed.answers ?? [],
    };
  } catch {
    return emptyStore();
  }
}

function writeLocal(store: LocalStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch {
    // quota dépassé ou storage indisponible : on ignore en silence.
  }
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// ---------------------------------------------------------------------------
// Helpers transverses
// ---------------------------------------------------------------------------

function ok<T>(data: T, mode: ServiceMode = "supabase"): ServiceResult<T> {
  return { data, mode, error: null };
}

function localResult<T>(data: T, error: string): ServiceResult<T> {
  return { data, mode: "local", error };
}

function unavailable<T>(error: string): ServiceResult<T | null> {
  return { data: null, mode: "unavailable", error };
}

interface ApiOkBody {
  ok: true;
  [key: string]: unknown;
}
interface ApiErrBody {
  ok: false;
  code?: string;
  error?: string;
}
type ApiBody = ApiOkBody | ApiErrBody;

/**
 * Appelle une route API interne avec credentials cookie. Lève une
 * erreur typée si la réponse n'est pas 2xx, OU si le payload renvoie
 * `{ ok: false, ... }`.
 */
async function callApi(
  path: string,
  init?: RequestInit
): Promise<{ ok: true; body: ApiOkBody } | { ok: false; status: number; error: string }> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "Réseau injoignable.",
    };
  }
  let body: ApiBody | null = null;
  try {
    body = (await res.json()) as ApiBody;
  } catch {
    // pas de JSON parsable
  }
  if (!res.ok || (body && body.ok === false)) {
    const bodyError =
      body && body.ok === false && typeof body.error === "string"
        ? body.error
        : null;
    const error = bodyError ?? `Requête échouée (HTTP ${res.status}).`;
    return { ok: false, status: res.status, error };
  }
  if (!body || body.ok !== true) {
    return {
      ok: false,
      status: res.status,
      error: "Réponse inattendue de l'API.",
    };
  }
  return { ok: true, body };
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

export async function createClient(
  input: CreateClientInput
): Promise<ServiceResult<ClientRecord | null>> {
  const apiRes = await callApi("/api/diagnostics/create-client", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (apiRes.ok) {
    const client = apiRes.body.client as ClientRecord;
    return ok(client);
  }
  if (isLocalFallbackAllowed()) {
    return saveClientLocally(input, apiRes.error);
  }
  return unavailable<ClientRecord>(apiRes.error);
}

function saveClientLocally(
  input: CreateClientInput,
  error: string
): ServiceResult<ClientRecord | null> {
  const store = readLocal();
  const record: ClientRecord = {
    id: randomId(),
    companyName: input.companyName,
    director: input.director,
    email: input.email,
    phone: input.phone,
    collaboratorsCount: input.collaboratorsCount,
    teamTypology: input.teamTypology,
    createdAt: new Date().toISOString(),
  };
  store.clients.unshift(record);
  writeLocal(store);
  return localResult(record, error);
}

export async function createDiagnostic(
  input: CreateDiagnosticInput
): Promise<ServiceResult<DiagnosticRecord | null>> {
  const apiRes = await callApi("/api/diagnostics/create", {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (apiRes.ok) {
    const diagnostic = apiRes.body.diagnostic as DiagnosticRecord;
    // L'activité est déjà logguée côté serveur (route /create). On
    // garde un log supplémentaire côté client pour preserver la
    // compat des dashboards en cours de migration — best-effort.
    logActivityFromClient({
      eventType: "diagnostic_created",
      diagnosticId: diagnostic.id,
      clientId: diagnostic.clientId,
      metadata: {
        mode: diagnostic.mode,
        profilesInScope: diagnostic.profilesInScope,
        expectedParticipants: diagnostic.expectedParticipants,
      },
    });
    return ok(diagnostic);
  }
  if (isLocalFallbackAllowed()) {
    return saveDiagnosticLocally(input, apiRes.error);
  }
  return unavailable<DiagnosticRecord>(apiRes.error);
}

function saveDiagnosticLocally(
  input: CreateDiagnosticInput,
  error: string
): ServiceResult<DiagnosticRecord | null> {
  const store = readLocal();
  const now = new Date().toISOString();
  const record: DiagnosticRecord = {
    id: randomId(),
    clientId: input.clientId,
    mode: input.mode,
    status: "in_progress",
    declaredGoal: input.declaredGoal,
    profilesInScope: input.profilesInScope,
    expectedParticipants: input.expectedParticipants,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  };
  store.diagnostics.unshift(record);
  writeLocal(store);
  return localResult(record, error);
}

export async function saveDiagnosticAnswer(
  input: SaveAnswerInput
): Promise<ServiceResult<AnswerRecord | null>> {
  const apiRes = await callApi(
    `/api/diagnostics/${encodeURIComponent(input.diagnosticId)}/answers`,
    {
      method: "POST",
      body: JSON.stringify({
        questionId: input.questionId,
        questionText: input.questionText,
        category: input.category,
        answer: input.answer,
        note: input.note,
        isWeakSignal: input.isWeakSignal,
        isSkipped: input.isSkipped,
      }),
    }
  );
  if (apiRes.ok) {
    return ok(apiRes.body.answer as AnswerRecord);
  }
  if (isLocalFallbackAllowed()) {
    return saveAnswerLocally(input, apiRes.error);
  }
  return unavailable<AnswerRecord>(apiRes.error);
}

function saveAnswerLocally(
  input: SaveAnswerInput,
  error: string
): ServiceResult<AnswerRecord | null> {
  const store = readLocal();
  const record: AnswerRecord = {
    id: randomId(),
    diagnosticId: input.diagnosticId,
    questionId: input.questionId,
    questionText: input.questionText,
    category: input.category,
    answer: input.answer,
    note: input.note,
    isWeakSignal: input.isWeakSignal,
    isSkipped: input.isSkipped,
    createdAt: new Date().toISOString(),
  };
  store.answers = store.answers.filter(
    (a) => !(a.diagnosticId === input.diagnosticId && a.questionId === input.questionId)
  );
  store.answers.push(record);
  writeLocal(store);
  return localResult(record, error);
}

export async function updateDiagnosticStatus(
  diagnosticId: string,
  status: DiagnosticStatus
): Promise<ServiceResult<DiagnosticRecord | null>> {
  const apiRes = await callApi(
    `/api/diagnostics/${encodeURIComponent(diagnosticId)}/status`,
    { method: "PATCH", body: JSON.stringify({ status }) }
  );
  if (apiRes.ok) {
    const diagnostic = apiRes.body.diagnostic as DiagnosticRecord;
    if (status === "validated" || status === "ai_analyzed") {
      logActivityFromClient({
        eventType: "diagnostic_completed",
        diagnosticId: diagnostic.id,
        clientId: diagnostic.clientId,
        metadata: { status: diagnostic.status, mode: diagnostic.mode },
      });
    }
    return ok(diagnostic);
  }
  if (isLocalFallbackAllowed()) {
    return updateDiagnosticStatusLocally(diagnosticId, status, apiRes.error);
  }
  return unavailable<DiagnosticRecord>(apiRes.error);
}

function updateDiagnosticStatusLocally(
  diagnosticId: string,
  status: DiagnosticStatus,
  error: string
): ServiceResult<DiagnosticRecord | null> {
  const store = readLocal();
  const idx = store.diagnostics.findIndex((d) => d.id === diagnosticId);
  if (idx === -1) {
    return localResult(null, error);
  }
  store.diagnostics[idx] = {
    ...store.diagnostics[idx],
    status,
    updatedAt: new Date().toISOString(),
  };
  writeLocal(store);
  return localResult(store.diagnostics[idx], error);
}

export async function getDiagnosticSummary(
  diagnosticId: string
): Promise<ServiceResult<DiagnosticSummary | null>> {
  const apiRes = await callApi(
    `/api/diagnostics/${encodeURIComponent(diagnosticId)}/summary`,
    { method: "GET" }
  );
  if (apiRes.ok) {
    return ok(apiRes.body.summary as DiagnosticSummary);
  }
  if (isLocalFallbackAllowed()) {
    return getSummaryLocally(diagnosticId, apiRes.error);
  }
  return unavailable<DiagnosticSummary>(apiRes.error);
}

function getSummaryLocally(
  diagnosticId: string,
  error: string
): ServiceResult<DiagnosticSummary | null> {
  const store = readLocal();
  const diagnostic = store.diagnostics.find((d) => d.id === diagnosticId);
  if (!diagnostic) {
    return localResult(null, error);
  }
  const client =
    store.clients.find((c) => c.id === diagnostic.clientId) ?? null;
  const answers = store.answers.filter((a) => a.diagnosticId === diagnosticId);
  return localResult(
    { diagnostic, client, answers, stats: computeStats(answers) },
    error
  );
}

function computeStats(answers: AnswerRecord[]): DiagnosticSummary["stats"] {
  return {
    answered: answers.filter((a) => !a.isSkipped).length,
    skipped: answers.filter((a) => a.isSkipped).length,
    weakSignals: answers.filter((a) => a.isWeakSignal).length,
  };
}

export async function listDiagnostics(): Promise<
  ServiceResult<DiagnosticListItem[]>
> {
  const apiRes = await callApi("/api/diagnostics", { method: "GET" });
  if (apiRes.ok) {
    return ok((apiRes.body.items as DiagnosticListItem[]) ?? []);
  }
  if (isLocalFallbackAllowed()) {
    return listDiagnosticsLocally(apiRes.error);
  }
  // En unavailable, on renvoie un tableau vide (mode unavailable) +
  // error explicite. Les listes vides + bandeau d'erreur sont déjà
  // gérées côté UI.
  return { data: [], mode: "unavailable", error: apiRes.error };
}

function listDiagnosticsLocally(
  error: string
): ServiceResult<DiagnosticListItem[]> {
  const store = readLocal();
  const items = store.diagnostics
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map<DiagnosticListItem>((diagnostic) => ({
      diagnostic,
      client: store.clients.find((c) => c.id === diagnostic.clientId) ?? null,
      answerCount: store.answers.filter((a) => a.diagnosticId === diagnostic.id)
        .length,
    }));
  return { data: items, mode: "local", error };
}
