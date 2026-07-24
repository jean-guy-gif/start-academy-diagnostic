"use client";

import { useEffect } from "react";

import { isLocalFallbackAllowed } from "@/lib/storage/local-fallback";
import { purgeFallbackKeys } from "@/lib/storage/purge-fallback-keys";

/**
 * Composant monté une fois par navigation au root. Purge les 6 clés
 * `sa.*.fallback.v1` du localStorage dès que le mode local n'est PAS
 * autorisé (preprod / production / valeur inattendue).
 *
 * Rendu : null. Aucun effet visible côté user.
 */
export function FallbackPurger(): null {
  useEffect(() => {
    if (!isLocalFallbackAllowed()) purgeFallbackKeys();
  }, []);
  return null;
}
