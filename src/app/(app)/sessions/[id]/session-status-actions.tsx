"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SessionStatus } from "@/types";
import {
  getBackwardOptions,
  getNextForwardStatus,
  isIrreversibleTarget,
} from "@/lib/sessions/session-status-transitions";

/**
 * Composant T-8 — actions de transition de statut de session.
 *
 * Rendu à côté du badge de statut dans la fiche session.
 * Deux points d'entrée UX :
 *   • Bouton principal « Passer à l'étape suivante » : rail principal
 *     (transition AVANT de la machine à états).
 *   • Lien discret « Changer manuellement » : dropdown des retours
 *     arrière autorisés depuis le statut courant.
 *
 * Confirmation modale renforcée sur les transitions irréversibles
 * (`delivered`, `report_sent`).
 *
 * Erreurs serveur affichées inline :
 *   • 409 `support_not_validated` (support_ready → delivered sans
 *     validation pédagogique du support) — message explicite.
 *   • 409 `transition_forbidden` — ne devrait jamais atteindre le
 *     client (l'UI ne propose que les transitions autorisées) mais
 *     géré en cas de désynchronisation client/serveur.
 */

const STATUS_LABEL: Record<SessionStatus, string> = {
  created: "Créée",
  awaiting_client_validation: "En attente validation client",
  dates_to_position: "Dates à positionner",
  dates_validated: "Dates validées",
  collection_open: "Collecte ouverte",
  data_collected: "Données collectées",
  support_generating: "Support en génération",
  support_ready: "Support prêt",
  delivered: "Formation réalisée",
  report_sent: "Bilan envoyé",
};

interface Props {
  sessionId: string;
  currentStatus: SessionStatus;
  onStatusChanged: (newStatus: SessionStatus) => void;
}

interface PendingConfirmation {
  target: SessionStatus;
  reason: "irreversible-forward" | "irreversible-manual" | "manual";
}

export function SessionStatusActions({
  sessionId,
  currentStatus,
  onStatusChanged,
}: Props) {
  const nextForward = useMemo(
    () => getNextForwardStatus(currentStatus),
    [currentStatus]
  );
  const backwardOptions = useMemo(
    () => getBackwardOptions(currentStatus),
    [currentStatus]
  );
  const hasManualOptions = nextForward !== null || backwardOptions.length > 0;

  const [showManual, setShowManual] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingConfirmation | null>(null);

  async function applyTransition(target: SessionStatus) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: target }),
      });
      const payload = (await res.json()) as {
        ok: boolean;
        code?: string;
        error?: string;
        to?: SessionStatus;
      };
      if (!res.ok || !payload.ok) {
        setError(
          payload.error ??
            `Échec de la transition (${res.status} ${payload.code ?? "unknown"}).`
        );
        return;
      }
      onStatusChanged(payload.to ?? target);
      setShowManual(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue.");
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  function requestTransition(
    target: SessionStatus,
    source: "forward" | "manual"
  ) {
    if (isIrreversibleTarget(target)) {
      setPending({
        target,
        reason:
          source === "forward" ? "irreversible-forward" : "irreversible-manual",
      });
      return;
    }
    if (source === "manual") {
      setPending({ target, reason: "manual" });
      return;
    }
    applyTransition(target);
  }

  if (nextForward === null && backwardOptions.length === 0) {
    return (
      <p className="mt-2 text-xs text-muted-foreground">
        Statut terminal — aucune transition disponible depuis l'app.
      </p>
    );
  }

  return (
    <div className="mt-2 flex flex-col items-end gap-2">
      {nextForward && (
        <Button
          size="sm"
          onClick={() => requestTransition(nextForward, "forward")}
          disabled={busy}
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowRight className="h-3.5 w-3.5" />
          )}
          Passer à «&nbsp;{STATUS_LABEL[nextForward]}&nbsp;»
        </Button>
      )}

      {hasManualOptions && (
        <button
          type="button"
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={() => setShowManual((v) => !v)}
          disabled={busy}
        >
          Changer manuellement
        </button>
      )}

      {showManual && (
        <div className="rounded-md border bg-background p-2 shadow-sm">
          <label
            htmlFor={`status-select-${sessionId}`}
            className="text-xs font-medium text-muted-foreground"
          >
            Transition autorisée
          </label>
          <select
            id={`status-select-${sessionId}`}
            className="mt-1 block rounded border bg-background px-2 py-1 text-sm"
            defaultValue=""
            onChange={(e) => {
              const value = e.target.value as SessionStatus | "";
              if (!value) return;
              requestTransition(value, "manual");
              e.target.value = "";
            }}
            disabled={busy}
          >
            <option value="">— Choisir —</option>
            {nextForward && (
              <option value={nextForward}>
                {STATUS_LABEL[nextForward]} (étape suivante)
              </option>
            )}
            {backwardOptions.map((opt) => (
              <option key={opt} value={opt}>
                ← {STATUS_LABEL[opt]}
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-1.5 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800">
          <AlertTriangle className="mt-0.5 h-3 w-3 flex-none" />
          <span>{error}</span>
        </div>
      )}

      {pending && (
        <ConfirmDialog
          currentStatus={currentStatus}
          target={pending.target}
          reason={pending.reason}
          busy={busy}
          onConfirm={() => applyTransition(pending.target)}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

interface ConfirmDialogProps {
  currentStatus: SessionStatus;
  target: SessionStatus;
  reason: PendingConfirmation["reason"];
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  currentStatus,
  target,
  reason,
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const isIrreversible = reason.startsWith("irreversible");
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-lg">
        <h2 className="font-heading text-lg font-semibold text-[#00527a]">
          {isIrreversible
            ? "Transition irréversible"
            : "Confirmation du changement de statut"}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Passer la session de «&nbsp;<strong>{STATUS_LABEL[currentStatus]}</strong>
          &nbsp;» à «&nbsp;<strong>{STATUS_LABEL[target]}</strong>&nbsp;».
        </p>
        {isIrreversible && (
          <p className="mt-2 text-sm text-red-700">
            Cette transition est <strong>irréversible</strong> depuis l'app.
            {target === "delivered"
              ? " Elle marque la formation comme réellement dispensée."
              : " Elle scelle l'envoi du bilan au client."}{" "}
            Toute correction ultérieure devra passer par SQL manuel.
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={busy}
          >
            Annuler
          </Button>
          <Button
            size="sm"
            onClick={onConfirm}
            disabled={busy}
            className={
              isIrreversible ? "bg-red-600 hover:bg-red-700" : undefined
            }
          >
            {busy && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Confirmer
          </Button>
        </div>
      </div>
    </div>
  );
}
