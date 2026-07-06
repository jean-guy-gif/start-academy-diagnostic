import { redirect } from "next/navigation";

/**
 * /dashboard est déprécié au profit de /cockpit (cf. PRD interne :
 * docs/internal-cockpit-prd.md).
 *
 * Toute requête vers /dashboard est redirigée — l'auth gate du
 * layout `(app)` s'applique sur la cible /cockpit, qui exige les
 * rôles internes admin/commercial/trainer. Pas de boucle possible :
 * /cockpit n'est pas redirigé.
 */
export default function DashboardDeprecatedRedirect() {
  redirect("/cockpit");
}
