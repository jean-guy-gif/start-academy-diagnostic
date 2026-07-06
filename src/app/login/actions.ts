"use server";

import "server-only";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createSupabaseRouteHandlerClient } from "@/lib/supabase/server";

const LoginSchema = z.object({
  email: z.string().email("Adresse email invalide."),
  password: z.string().min(1, "Mot de passe requis."),
});

export interface LoginFormState {
  error: string | null;
  email: string;
}

const NEXT_PATH_PATTERN = /^\/[A-Za-z0-9/_\-?=&%.~+:]*$/;

function resolveNext(rawNext: FormDataEntryValue | null): string {
  // On n'accepte que des chemins relatifs internes (pas de redirect vers
  // un domaine externe). Si le `next` est suspect, on bascule sur le
  // dashboard.
  if (typeof rawNext !== "string") return "/cockpit";
  if (!NEXT_PATH_PATTERN.test(rawNext)) return "/cockpit";
  if (rawNext.startsWith("//")) return "/cockpit";
  return rawNext;
}

export async function signInAction(
  _previousState: LoginFormState,
  formData: FormData
): Promise<LoginFormState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  const email =
    typeof formData.get("email") === "string"
      ? (formData.get("email") as string)
      : "";

  if (!parsed.success) {
    const firstError =
      parsed.error.issues[0]?.message ?? "Identifiants invalides.";
    return { error: firstError, email };
  }

  const supabase = await createSupabaseRouteHandlerClient();
  if (!supabase) {
    return {
      error:
        "Authentification indisponible : Supabase n'est pas configuré. En développement, utilisez le mode local (sans login).",
      email,
    };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return {
      error:
        error.message === "Invalid login credentials"
          ? "Email ou mot de passe incorrect."
          : "Connexion impossible. Réessayez plus tard.",
      email,
    };
  }

  const next = resolveNext(formData.get("next"));
  redirect(next);
}

export async function signOutAction(): Promise<void> {
  const supabase = await createSupabaseRouteHandlerClient();
  if (supabase) {
    await supabase.auth.signOut();
  }
  redirect("/login");
}
