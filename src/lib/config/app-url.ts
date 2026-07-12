import "server-only";

/**
 * URL absolue publique de l'application, servant de base pour construire
 * tout lien envoyé à un utilisateur externe (dirigeant, participant,
 * formateur) via `public_access_tokens`.
 *
 * Source de vérité UNIQUE — importée uniquement par la route
 * `POST /api/sessions/[id]/create-access-link`. Les composants clients
 * NE construisent JAMAIS d'URL absolue eux-mêmes (l'appel historique à
 * `window.location.origin` renvoyait l'URL de déploiement instable
 * Vercel, invalide dans un mail à un dirigeant externe — cause du fix
 * de cette PR).
 *
 * Politique :
 *   • Production (`NODE_ENV === 'production'`) : `NEXT_PUBLIC_APP_URL`
 *     est OBLIGATOIRE. Un lien pointant vers `localhost` ou vers l'URL
 *     de déploiement instable dans un email à un dirigeant est un
 *     échec invisible inacceptable → throw explicite, la route
 *     `create-access-link` remontera l'erreur (500 `generate_failed`)
 *     et l'incident sera visible immédiatement.
 *   • Développement local : fallback silencieux sur
 *     `http://localhost:3000` (comportement `npm run dev`).
 */

const DEV_FALLBACK = "http://localhost:3000";

export function absoluteAppUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL;
  if (raw && raw.trim().length > 0) {
    return raw.replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_APP_URL manquante en production. " +
        "Elle est requise pour construire les liens publics envoyés " +
        "aux utilisateurs externes (dirigeants, participants, formateurs). " +
        "Configurer la variable côté Vercel (Production, Preview, Development) " +
        "avec l'URL stable de l'application (ex: https://start-academy-diagnostic.vercel.app)."
    );
  }
  return DEV_FALLBACK;
}
