/**
 * Service session formation — côté client.
 *
 * Modèle de persistance :
 *   - Supabase si les variables NEXT_PUBLIC_* sont configurées.
 *     Table cible : `training_sessions` (migration MVP1).
 *   - Sinon fallback localStorage (clé `sa.sessions.fallback.v1`).
 *
 * Particularités :
 *   - Le lien de collecte collaborateurs (`collectionLink`) est dérivé de
 *     l'id : aucune colonne SQL dédiée — pas de migration nécessaire.
 *   - La vue UI (`TrainingSessionViewModel`) compose le client (Supabase),
 *     la proposition et la recommandation (localStorage côté navigateur).
 *   - Aucun statut hors du `CHECK` SQL (PRD §11.3).
 */

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Tables, TablesInsert } from "@/lib/supabase/database.types";
import type {
  SessionStatus,
  TrainingSessionViewModel,
} from "@/types";
import {
  getCachedProposalByDiagnosticId,
  type StoredProposal,
} from "@/lib/proposals/proposal-service";
import { logActivityFromClient } from "@/lib/activity/log-from-client";

// ---------------------------------------------------------------------------
// Types publics
// ---------------------------------------------------------------------------

export type ServiceMode = "supabase" | "local";

export interface ServiceResult<T> {
  data: T;
  mode: ServiceMode;
  error: string | null;
}

export interface CreateTrainingSessionInput {
  diagnosticId: string;
  clientId: string;
  recommendationId?: string | null;
  expectedParticipants?: number | null;
  notes?: string | null;
}

// Vue brute Supabase (snake_case) avant assemblage avec proposition/client.
interface LocalSessionRow {
  id: string;
  clientId: string;
  diagnosticId: string | null;
  recommendationId: string | null;
  status: SessionStatus;
  proposedDates: string[];
  validatedDate: string | null;
  expectedParticipants: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// localStorage store
// ---------------------------------------------------------------------------

const LS_KEY = "sa.sessions.fallback.v1";

interface LocalStore {
  items: LocalSessionRow[];
}

function readLocal(): LocalStore {
  if (typeof window === "undefined") return { items: [] };
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return { items: [] };
    const parsed = JSON.parse(raw) as LocalStore;
    return { items: parsed.items ?? [] };
  } catch {
    return { items: [] };
  }
}

function writeLocal(store: LocalStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch {
    /* quota / storage unavailable */
  }
}

function randomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "Erreur inconnue";
}

function ok<T>(data: T, mode: ServiceMode): ServiceResult<T> {
  return { data, mode, error: null };
}

function fail<T>(data: T, error: string): ServiceResult<T> {
  return { data, mode: "local", error };
}

function collectionLinkFor(sessionId: string): string {
  return `/sessions/${sessionId}/collect`;
}

function fromSupabaseRow(row: Tables<"training_sessions">): LocalSessionRow {
  return {
    id: row.id,
    clientId: row.client_id,
    diagnosticId: row.diagnostic_id,
    recommendationId: row.recommendation_id,
    status: row.status,
    proposedDates: row.proposed_dates,
    validatedDate: row.validated_date,
    expectedParticipants: row.expected_participants,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface AssembleInputs {
  row: LocalSessionRow;
  clientName: string | null;
  proposal: StoredProposal | null;
  source: ServiceMode;
}

function assembleViewModel({
  row,
  clientName,
  proposal,
  source,
}: AssembleInputs): TrainingSessionViewModel {
  const program = proposal?.proposal.trainingProgram ?? null;
  const pricing = proposal?.proposal.pricing ?? null;
  return {
    id: row.id,
    clientId: row.clientId,
    diagnosticId: row.diagnosticId,
    recommendationId: row.recommendationId,
    clientName,
    proposalTitle: proposal?.proposal.proposalTitle ?? null,
    targetAudience: program?.targetAudience ?? null,
    totalDurationHours: program?.totalDurationHours ?? null,
    suggestedFormat: program?.suggestedFormat ?? null,
    participantCount:
      pricing?.participantCount ?? row.expectedParticipants ?? null,
    costPerParticipant: pricing?.costPerParticipant ?? null,
    totalEstimatedCost: pricing?.totalEstimatedCost ?? null,
    status: row.status,
    dates: row.proposedDates,
    validatedDate: row.validatedDate,
    collectionLink: collectionLinkFor(row.id),
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    source,
  };
}

async function resolveClientName(
  clientId: string,
  source: ServiceMode
): Promise<string | null> {
  if (source !== "supabase") return null;
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return null;
  try {
    const { data } = await supabase
      .from("clients")
      .select("company_name")
      .eq("id", clientId)
      .maybeSingle();
    return data?.company_name ?? null;
  } catch {
    return null;
  }
}

async function loadProposalForDiagnostic(
  diagnosticId: string | null
): Promise<StoredProposal | null> {
  if (!diagnosticId) return null;
  const cached = await getCachedProposalByDiagnosticId(diagnosticId);
  return cached.data;
}

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

export async function createTrainingSession(
  input: CreateTrainingSessionInput
): Promise<ServiceResult<TrainingSessionViewModel>> {
  const supabase = createSupabaseBrowserClient();
  if (supabase) {
    try {
      const payload: TablesInsert<"training_sessions"> = {
        client_id: input.clientId,
        diagnostic_id: input.diagnosticId,
        recommendation_id: input.recommendationId ?? null,
        status: "created",
        expected_participants: input.expectedParticipants ?? null,
        notes: input.notes ?? null,
      };
      const { data, error } = await supabase
        .from("training_sessions")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      const row = fromSupabaseRow(data);
      const clientName = await resolveClientName(row.clientId, "supabase");
      const proposal = await loadProposalForDiagnostic(row.diagnosticId);
      logActivityFromClient({
        eventType: "session_created",
        sessionId: row.id,
        diagnosticId: row.diagnosticId,
        clientId: row.clientId,
        metadata: {
          expectedParticipants: row.expectedParticipants,
          source: "supabase",
        },
      });
      return ok(
        assembleViewModel({ row, clientName, proposal, source: "supabase" }),
        "supabase"
      );
    } catch (err) {
      return persistLocally(input, errorMessage(err));
    }
  }
  return persistLocally(input, "Variables Supabase non configurées");
}

async function persistLocally(
  input: CreateTrainingSessionInput,
  error: string
): Promise<ServiceResult<TrainingSessionViewModel>> {
  const store = readLocal();
  const now = new Date().toISOString();
  const row: LocalSessionRow = {
    id: randomId(),
    clientId: input.clientId,
    diagnosticId: input.diagnosticId,
    recommendationId: input.recommendationId ?? null,
    status: "created",
    proposedDates: [],
    validatedDate: null,
    expectedParticipants: input.expectedParticipants ?? null,
    notes: input.notes ?? null,
    createdAt: now,
    updatedAt: now,
  };
  store.items.unshift(row);
  writeLocal(store);
  const proposal = await loadProposalForDiagnostic(row.diagnosticId);
  return fail(
    assembleViewModel({ row, clientName: null, proposal, source: "local" }),
    error
  );
}

export async function getTrainingSessionById(
  sessionId: string
): Promise<ServiceResult<TrainingSessionViewModel | null>> {
  const supabase = createSupabaseBrowserClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("training_sessions")
        .select("*")
        .eq("id", sessionId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return readLocalSession(sessionId, "Session absente côté Supabase");
      const row = fromSupabaseRow(data);
      const clientName = await resolveClientName(row.clientId, "supabase");
      const proposal = await loadProposalForDiagnostic(row.diagnosticId);
      return ok(
        assembleViewModel({ row, clientName, proposal, source: "supabase" }),
        "supabase"
      );
    } catch (err) {
      return readLocalSession(sessionId, errorMessage(err));
    }
  }
  return readLocalSession(sessionId, "Variables Supabase non configurées");
}

async function readLocalSession(
  sessionId: string,
  error: string
): Promise<ServiceResult<TrainingSessionViewModel | null>> {
  const store = readLocal();
  const row = store.items.find((s) => s.id === sessionId);
  if (!row) return fail(null, error);
  const proposal = await loadProposalForDiagnostic(row.diagnosticId);
  return fail(
    assembleViewModel({ row, clientName: null, proposal, source: "local" }),
    error
  );
}

export async function getTrainingSessionByDiagnosticId(
  diagnosticId: string
): Promise<ServiceResult<TrainingSessionViewModel | null>> {
  const supabase = createSupabaseBrowserClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("training_sessions")
        .select("*")
        .eq("diagnostic_id", diagnosticId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        const row = fromSupabaseRow(data);
        const clientName = await resolveClientName(row.clientId, "supabase");
        const proposal = await loadProposalForDiagnostic(row.diagnosticId);
        return ok(
          assembleViewModel({ row, clientName, proposal, source: "supabase" }),
          "supabase"
        );
      }
      return findLocalByDiagnostic(diagnosticId, null);
    } catch (err) {
      return findLocalByDiagnostic(diagnosticId, errorMessage(err));
    }
  }
  return findLocalByDiagnostic(diagnosticId, "Variables Supabase non configurées");
}

async function findLocalByDiagnostic(
  diagnosticId: string,
  error: string | null
): Promise<ServiceResult<TrainingSessionViewModel | null>> {
  const store = readLocal();
  const row = store.items.find((s) => s.diagnosticId === diagnosticId);
  if (!row) {
    return { data: null, mode: "local", error };
  }
  const proposal = await loadProposalForDiagnostic(row.diagnosticId);
  return {
    data: assembleViewModel({ row, clientName: null, proposal, source: "local" }),
    mode: "local",
    error,
  };
}

export async function listTrainingSessions(): Promise<
  ServiceResult<TrainingSessionViewModel[]>
> {
  const supabase = createSupabaseBrowserClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("training_sessions")
        .select("*, client:clients(company_name)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      const items: TrainingSessionViewModel[] = [];
      for (const raw of data ?? []) {
        const { client: clientRow, ...rest } = raw as typeof raw & {
          client: { company_name: string } | null;
        };
        const row = fromSupabaseRow(rest);
        const proposal = await loadProposalForDiagnostic(row.diagnosticId);
        items.push(
          assembleViewModel({
            row,
            clientName: clientRow?.company_name ?? null,
            proposal,
            source: "supabase",
          })
        );
      }
      return ok(items, "supabase");
    } catch (err) {
      return listLocally(errorMessage(err));
    }
  }
  return listLocally("Variables Supabase non configurées");
}

async function listLocally(
  error: string
): Promise<ServiceResult<TrainingSessionViewModel[]>> {
  const store = readLocal();
  const sorted = store.items
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const items: TrainingSessionViewModel[] = [];
  for (const row of sorted) {
    const proposal = await loadProposalForDiagnostic(row.diagnosticId);
    items.push(
      assembleViewModel({ row, clientName: null, proposal, source: "local" })
    );
  }
  return fail(items, error);
}

export async function updateTrainingSessionStatus(
  sessionId: string,
  status: SessionStatus
): Promise<ServiceResult<TrainingSessionViewModel | null>> {
  const supabase = createSupabaseBrowserClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("training_sessions")
        .update({ status })
        .eq("id", sessionId)
        .select("*")
        .single();
      if (error) throw error;
      const row = fromSupabaseRow(data);
      const clientName = await resolveClientName(row.clientId, "supabase");
      const proposal = await loadProposalForDiagnostic(row.diagnosticId);
      return ok(
        assembleViewModel({ row, clientName, proposal, source: "supabase" }),
        "supabase"
      );
    } catch (err) {
      return updateLocally(sessionId, { status }, errorMessage(err));
    }
  }
  return updateLocally(sessionId, { status }, "Variables Supabase non configurées");
}

export async function updateTrainingSessionDates(
  sessionId: string,
  dates: string[]
): Promise<ServiceResult<TrainingSessionViewModel | null>> {
  const supabase = createSupabaseBrowserClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("training_sessions")
        .update({ proposed_dates: dates })
        .eq("id", sessionId)
        .select("*")
        .single();
      if (error) throw error;
      const row = fromSupabaseRow(data);
      const clientName = await resolveClientName(row.clientId, "supabase");
      const proposal = await loadProposalForDiagnostic(row.diagnosticId);
      return ok(
        assembleViewModel({ row, clientName, proposal, source: "supabase" }),
        "supabase"
      );
    } catch (err) {
      return updateLocally(sessionId, { proposedDates: dates }, errorMessage(err));
    }
  }
  return updateLocally(
    sessionId,
    { proposedDates: dates },
    "Variables Supabase non configurées"
  );
}

async function updateLocally(
  sessionId: string,
  patch: Partial<LocalSessionRow>,
  error: string
): Promise<ServiceResult<TrainingSessionViewModel | null>> {
  const store = readLocal();
  const idx = store.items.findIndex((s) => s.id === sessionId);
  if (idx === -1) return fail(null, error);
  store.items[idx] = {
    ...store.items[idx],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  writeLocal(store);
  const row = store.items[idx];
  const proposal = await loadProposalForDiagnostic(row.diagnosticId);
  return fail(
    assembleViewModel({ row, clientName: null, proposal, source: "local" }),
    error
  );
}

// ---------------------------------------------------------------------------
// Participants — collecte collaborateurs
//
// Table cible : `session_participants` (migration ajoutée le 2026-05-22).
// RLS MVP : `authenticated` uniquement. La page publique de collecte
// (sans session authentifiée) bascule donc automatiquement sur
// localStorage tant qu'un mécanisme de lien signé n'est pas ajouté.
// ---------------------------------------------------------------------------

const LS_PARTICIPANTS_KEY = "sa.session-participants.fallback.v1";

export type ProfessionalStatus =
  | "salarie"
  | "agent_commercial_independant"
  | "autre";

export interface ParticipantInput {
  sessionId: string;
  firstName: string;
  lastName: string;
  role: string;
  email: string;
  estimatedLevel: string;
  mainProblem: string;
  personalGoal: string;
  toolsUsed: string[];
  concreteCase: string;
  // Champs administratifs (optionnels — dossier prise en charge formation).
  lastDiploma?: string;
  realEstateExperienceYears?: string;
  professionalStatus?: ProfessionalStatus | null;
}

export interface ParticipantRecord extends ParticipantInput {
  id: string;
  createdAt: string;
}

interface ParticipantsStore {
  items: ParticipantRecord[];
}

function readParticipants(): ParticipantsStore {
  if (typeof window === "undefined") return { items: [] };
  try {
    const raw = window.localStorage.getItem(LS_PARTICIPANTS_KEY);
    if (!raw) return { items: [] };
    const parsed = JSON.parse(raw) as ParticipantsStore;
    return { items: parsed.items ?? [] };
  } catch {
    return { items: [] };
  }
}

function writeParticipants(store: ParticipantsStore): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_PARTICIPANTS_KEY, JSON.stringify(store));
  } catch {
    /* quota / storage unavailable */
  }
}

function participantRowToRecord(row: {
  id: string;
  session_id: string;
  first_name: string;
  last_name: string;
  role: string | null;
  email: string;
  estimated_level: string | null;
  personal_goal: string | null;
  main_problem: string | null;
  tools_used: unknown;
  concrete_case: string | null;
  last_diploma?: string | null;
  real_estate_experience_years?: string | null;
  professional_status?: ProfessionalStatus | null;
  created_at: string;
}): ParticipantRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    firstName: row.first_name,
    lastName: row.last_name,
    role: row.role ?? "",
    email: row.email,
    estimatedLevel: row.estimated_level ?? "",
    personalGoal: row.personal_goal ?? "",
    mainProblem: row.main_problem ?? "",
    toolsUsed: Array.isArray(row.tools_used)
      ? (row.tools_used as string[]).filter((v) => typeof v === "string")
      : [],
    concreteCase: row.concrete_case ?? "",
    lastDiploma: row.last_diploma ?? "",
    realEstateExperienceYears: row.real_estate_experience_years ?? "",
    professionalStatus: row.professional_status ?? null,
    createdAt: row.created_at,
  };
}

/**
 * Insère un participant en Supabase quand possible, sinon le stocke en
 * localStorage. Gère explicitement le doublon (unique session_id, email).
 *
 * Erreurs typiques renvoyées par Supabase qui déclenchent un fallback :
 *   - 42501  : insufficient privilege (RLS / pas authentifié)
 *   - 23505  : duplicate key (déjà inscrit pour cette session)
 *   - 23514  : check violation (email mal formé côté SQL)
 *
 * Aucun throw : la fonction renvoie toujours un `ServiceResult` exploitable.
 */
export async function saveParticipant(
  input: ParticipantInput
): Promise<ServiceResult<ParticipantRecord>> {
  const supabase = createSupabaseBrowserClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("session_participants")
        .insert({
          session_id: input.sessionId,
          first_name: input.firstName,
          last_name: input.lastName,
          role: input.role || null,
          email: input.email,
          estimated_level: input.estimatedLevel || null,
          personal_goal: input.personalGoal || null,
          main_problem: input.mainProblem || null,
          tools_used: input.toolsUsed,
          concrete_case: input.concreteCase || null,
          last_diploma: input.lastDiploma || null,
          real_estate_experience_years: input.realEstateExperienceYears || null,
          professional_status: input.professionalStatus ?? null,
        })
        .select("*")
        .single();
      if (error) {
        // Conflit doublon — on n'écrit PAS en localStorage : c'est un cas
        // métier que l'appelant doit présenter à l'utilisateur.
        if (error.code === "23505") {
          return {
            data: localFallbackParticipant(input),
            mode: "local",
            error:
              "Cette adresse email est déjà enregistrée pour cette session. Réponse conservée en local uniquement.",
          };
        }
        if (error.code === "23514") {
          return {
            data: localFallbackParticipant(input),
            mode: "local",
            error:
              "Email refusé par la base (format invalide). Réponse conservée en local.",
          };
        }
        // RLS / network / autres erreurs → fallback transparent.
        return saveParticipantLocally(input, error.message);
      }
      return ok(participantRowToRecord(data), "supabase");
    } catch (err) {
      return saveParticipantLocally(input, errorMessage(err));
    }
  }
  return saveParticipantLocally(input, "Variables Supabase non configurées");
}

function localFallbackParticipant(input: ParticipantInput): ParticipantRecord {
  return {
    ...input,
    id: randomId(),
    createdAt: new Date().toISOString(),
  };
}

function saveParticipantLocally(
  input: ParticipantInput,
  error: string
): ServiceResult<ParticipantRecord> {
  const store = readParticipants();
  const record = localFallbackParticipant(input);
  store.items.unshift(record);
  writeParticipants(store);
  return fail(record, error);
}

/**
 * Lit les participants depuis Supabase si possible, sinon localStorage.
 * Aucune fusion : la source unique est choisie au moment de l'appel
 * (Supabase prioritaire). Cela évite les doublons d'affichage entre les
 * deux stores.
 */
export async function listParticipantsBySession(
  sessionId: string
): Promise<ServiceResult<ParticipantRecord[]>> {
  const supabase = createSupabaseBrowserClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("session_participants")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: false });
      if (error) {
        return listParticipantsLocally(sessionId, error.message);
      }
      return ok((data ?? []).map(participantRowToRecord), "supabase");
    } catch (err) {
      return listParticipantsLocally(sessionId, errorMessage(err));
    }
  }
  return listParticipantsLocally(sessionId, "Variables Supabase non configurées");
}

function listParticipantsLocally(
  sessionId: string,
  error: string
): ServiceResult<ParticipantRecord[]> {
  const store = readParticipants();
  const items = store.items
    .filter((p) => p.sessionId === sessionId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return fail(items, error);
}
