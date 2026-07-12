# Registre — Rotations de secrets §9

Journal daté des rotations de secrets décrites dans
`docs/preprod-stabilization-plan.md` §9 et `docs/operations-runbook.md` §6.

- Le **runbook §6** décrit *comment* faire tourner une clé (procédure de
  référence).
- Le **plan de stabilisation §9** définit *quels critères* valident une
  rotation.
- Ce **log** enregistre *quand, par qui, avec quel résultat* chaque
  rotation a été effectivement jouée. Il sert de preuve datée pour la
  décision d'ouverture pilote et de traçabilité en cas d'incident.

Format aligné sur `docs/restore-test-log.md`. Une section par rotation.
À remplir immédiatement après une rotation complète, succès ou échec.

---

## 2026-07-12 — `SUPABASE_SERVICE_ROLE_KEY` (rotation préventive, dernier geste avant ouverture pilote)

- **Opérateur** : Laurent
- **Clé rotée** : `SUPABASE_SERVICE_ROLE_KEY` (projet Supabase préprod `shhcefbojixjhgefcbyn`)
- **Type** : rotation préventive (pas de suspicion active de fuite)
- **Motif** : dernier geste avant ouverture pilote. La clé avait transité
  pendant les manipulations §5 (smoke sécurité — export dans subshells pour
  curl authentifiés), §7 (restore test — chargée en env pour la commande
  `supabase db dump`), §8 (audit Storage — sourcée pour lister le bucket
  et télécharger les 4 blobs). Aucune fuite constatée (les scripts
  filtraient les valeurs, `.env*` reste gitignoré), mais posture prudente
  avant d'ouvrir à un utilisateur externe.
- **Incident supplémentaire de la journée** : lors du pré-audit Vercel
  (`vercel link --project start-academy-diagnostic --yes`), le CLI Vercel
  a proposé un « overwrite `.env.local` » qui a effectivement écrasé le
  fichier local. `.env.local` a été reconstruit depuis la Timeline
  VS Code (récupération sans perte). Cet incident renforce le motif de
  rotation : la clé a été manipulée hors de son emplacement habituel
  pendant la restauration, autant repartir sur une valeur propre. Voir
  la section « Leçons » en fin d'entrée.

### Inventaire des endroits stockant la clé (confirmé avant Roll)

| # | Endroit | Statut | Mise à jour |
|---|---|---|:-:|
| 1 | `~/Projects/Start Proposition/.env.local` (fichier local, symlinké depuis `start-academy-diagnostic/.env.local`) | 219 chars avant rotation | **OUI** |
| 2 | Vercel env vars — projet `start-academy-diagnostic` | **0 var provisionnée** (`vercel env ls` → « No Environment Variables found ») | **NON** |
| 3 | GitHub Actions `.github/workflows/ci.yml:21` | Placeholder littéral `SUPABASE_SERVICE_ROLE_KEY: placeholder-service-role-key`, commentaire explicite « Les VRAIES clés vivent en Vercel / preprod, JAMAIS ici » | **NON** |
| 4 | `.env.example` | Ligne `SUPABASE_SERVICE_ROLE_KEY=` (valeur vide), gitignoré | **NON** |
| 5 | `.env.restore-test` | Fichier supprimé du poste post-§7 (registre `docs/restore-test-log.md`), projet Supabase test dédié détruit | **NON** |

Consommateurs applicatifs (porte unique) : `src/lib/supabase/server.ts:74`
`createSupabaseAdminClient()` lit `process.env.SUPABASE_SERVICE_ROLE_KEY`.
Les 35 routes/services indirects (via `createSupabaseAdminClient`)
héritent automatiquement de la nouvelle valeur au restart du serveur.

Scripts qui consomment la clé indirectement (via `.env.local`) :
`scripts/check-catalog-seed.mjs`. Aucun autre. `security-smoke.mjs` et
`restore-test.sh` n'utilisent PAS `SUPABASE_SERVICE_ROLE_KEY` (vérifié
par grep).

### Séquence exécutée

1. Backup préalable préprod (3 dumps) horodaté avant rotation.
2. Dashboard Supabase → Settings → API → Service role → Roll → nouvelle
   clé copiée (affichée une seule fois).
3. `.env.local` mis à jour avec la nouvelle valeur (fichier racine
   parent). Sauvegarde.
4. `npm run dev` redémarré depuis `start-academy-diagnostic/`.

### Résultats — checklist §9.6 (§9.1 étape 6 du plan)

| Critère | Attendu | Observé | ✅ / ❌ |
|---|---|---|---|
| Ancienne clé révoquée par Supabase | Immédiate au Roll | Immédiate | ✅ |
| `.env.local` recharge propre | Une seule ligne modifiée | 1 ligne | ✅ |
| `npm run dev` boot sans failfast | Ready in Xms, 0 log erreur | Ready OK | ✅ |
| Cockpit charge avec la nouvelle clé | HTTP 200 + KPI + activité | 200 + KPI + activité | ✅ |
| Ancienne clé ne fonctionne plus | 401 côté Supabase | Test non joué (ancienne clé perdue par nature) | n/a |
| Aucun log `SUPABASE_SERVICE_ROLE_KEY manquante` | 0 occurrence | 0 | ✅ |

### Décision

- [x] ✅ Rotation validée — §3.2 clôturé, dernier bloquant pilote levé.
- [ ] ⚠️ Rotation partielle — à décrire si un endroit oublié.
- [ ] ❌ Rotation échouée — à décrire, plan d'action.

### Leçons apprises (à intégrer à l'ops runbook si pattern se répète)

1. **`vercel link` peut écraser `.env.local` sans avertissement suffisant.**
   Lors de cette rotation, le pré-audit Vercel (link + `env ls`) a écrasé
   `.env.local`. Reconstruction via Timeline VS Code (heureusement
   disponible). **Règle à observer** : ne jamais accepter l'overwrite
   `.env.local` proposé par `vercel link` ; répondre `no` à ce prompt, ou
   sauvegarder le fichier ailleurs juste avant. À documenter comme
   avertissement en tête de la procédure §6 du runbook si on
   institutionnalise le lien Vercel.
2. **Vercel n'a aucune env var provisionnée**. Le déploiement
   `https://start-academy-diagnostic.vercel.app` est fonctionnellement
   cassé côté runtime (toute route serveur qui appelle
   `createSupabaseAdminClient` failfast). Le fix PR #19 `force-dynamic`
   au layout `(app)/` rend le **build** vert mais pas le runtime.
   **Question de fond ouverte** : quand le pilote utilisera une URL
   publique (Vercel ou autre), il faudra provisionner les env vars
   Vercel avec la clé rotée du jour + les autres secrets
   (`OPENROUTER_API_KEY`, etc.). Non bloquant tant que le pilote tourne
   en local / démo. Tracé au backlog post-stabilisation §3.3 (nouveau).
3. **Rotation cohérente avec la posture globale** : puisque la clé
   n'existait qu'à un endroit stockable (`.env.local`), la rotation est
   restée simple et sans fenêtre de préprod down publique. Si le
   pilote passe sur URL publique, la prochaine rotation devra couvrir
   `.env.local` **ET** Vercel env vars en parallèle — retour au plan
   initial (2 endroits).

### Post-actions

- [x] Ancienne clé révoquée (par Supabase, automatique au Roll).
- [x] `.env.local` restauré + mis à jour avec la nouvelle valeur.
- [x] Cockpit vérifié fonctionnel.
- [x] Registre rempli (ce document).
- [ ] Backup préprod du jour à archiver / chiffrer selon procédure §6
      du plan de stabilisation (hors scope de ce log — cf.
      `docs/preprod-stabilization-plan.md` §6.2).
