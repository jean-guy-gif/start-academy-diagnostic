"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DOCUMENT_CATEGORIES,
  type DocumentCategory,
  validateFileUpload,
  MAX_FILE_SIZE_BYTES,
} from "@/lib/documents/document-types";

const CATEGORY_OPTIONS: Array<{
  value: DocumentCategory;
  label: string;
  help?: string;
}> = [
  { value: "cni", label: "Carte d'identité (CNI)" },
  { value: "rib", label: "RIB" },
  {
    value: "cfp_urssaf",
    label: "Attestation CFP / URSSAF",
    help: "Pour obtenir votre attestation CFP : connectez-vous à votre espace auto-entrepreneur / URSSAF, rubrique attestations, puis téléchargez l'attestation de contribution à la formation professionnelle si disponible.",
  },
  { value: "support_actuel", label: "Support actuel" },
  { value: "cas_client", label: "Cas client" },
  { value: "export_crm", label: "Export CRM" },
  { value: "statistiques", label: "Statistiques commerciales" },
  { value: "autre", label: "Autre document utile" },
];

interface Uploaded {
  fileName: string;
  category: DocumentCategory;
  createdAt: string;
}

interface UploadingState {
  kind: "idle" | "uploading" | "error";
  error?: string;
}

interface Props {
  token: string;
  participantEmail: string;
}

export function ParticipantDocumentsUpload({ token, participantEmail }: Props) {
  const [category, setCategory] = useState<DocumentCategory>("cni");
  const [status, setStatus] = useState<UploadingState>({ kind: "idle" });
  const [uploaded, setUploaded] = useState<Uploaded[]>([]);

  const currentCategory = CATEGORY_OPTIONS.find((c) => c.value === category);

  async function onFileChosen(file: File | null) {
    if (!file) return;
    const validation = validateFileUpload({
      size: file.size,
      type: file.type,
      name: file.name,
    });
    if (!validation.ok) {
      setStatus({ kind: "error", error: validation.message });
      return;
    }

    setStatus({ kind: "uploading" });

    try {
      const form = new FormData();
      form.set("token", token);
      form.set("participantEmail", participantEmail);
      form.set("documentCategory", category);
      form.set("file", file);

      const res = await fetch("/api/public/upload-document", {
        method: "POST",
        body: form,
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        document?: {
          fileName: string;
          category: DocumentCategory;
          createdAt: string;
        };
      };

      if (!res.ok || !json.ok || !json.document) {
        setStatus({
          kind: "error",
          error: json.error ?? "Téléversement impossible.",
        });
        return;
      }

      setUploaded((prev) => [...prev, json.document!]);
      setStatus({ kind: "idle" });
    } catch {
      setStatus({
        kind: "error",
        error: "Connexion impossible. Réessayez.",
      });
    }
  }

  return (
    <div className="rounded-md border border-border/60 bg-white p-4">
      <p className="font-heading text-sm font-semibold text-[#00527a]">
        Pièces utiles à déposer (optionnel)
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Ces documents sont utilisés uniquement pour préparer votre
        dossier et la formation. Ils ne sont pas publics. Taille max{" "}
        {Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))} Mo par fichier.
      </p>

      <div className="mt-4 space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="documentCategory">Type de document</Label>
          <select
            id="documentCategory"
            value={category}
            onChange={(e) => setCategory(e.target.value as DocumentCategory)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            {CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {currentCategory?.help ? (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {currentCategory.help}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="documentFile">Fichier</Label>
          <Input
            id="documentFile"
            type="file"
            disabled={status.kind === "uploading"}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              void onFileChosen(f);
              // reset le champ pour pouvoir re-uploader le même fichier
              e.target.value = "";
            }}
            accept={Object.values({
              pdf: ".pdf",
              img: ".jpg,.jpeg,.png,.webp,.heic,.heif",
              doc: ".doc,.docx",
              xls: ".xls,.xlsx",
              csv: ".csv,.txt",
            }).join(",")}
          />
        </div>

        {status.kind === "uploading" ? (
          <p className="text-xs text-muted-foreground">
            Envoi en cours…
          </p>
        ) : null}
        {status.kind === "error" ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          >
            {status.error}
          </p>
        ) : null}
      </div>

      {uploaded.length > 0 ? (
        <div className="mt-4 border-t border-border/60 pt-3">
          <p className="text-xs font-medium text-foreground/80">
            Pièces envoyées
          </p>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {uploaded.map((u, idx) => (
              <li key={`${u.fileName}-${idx}`} className="flex gap-2">
                <span className="text-emerald-700">✓</span>
                <span>{u.fileName}</span>
                <span className="text-[10px] uppercase tracking-wider text-foreground/50">
                  {u.category}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-3 text-[10px] text-muted-foreground">
        Catégories acceptées :{" "}
        {DOCUMENT_CATEGORIES.length} types — CNI, RIB, attestation
        CFP/URSSAF, support actuel, cas client, export CRM, statistiques,
        autre.
      </p>
    </div>
  );
}
