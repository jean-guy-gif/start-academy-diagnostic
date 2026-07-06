# Start Academy — Plateforme interne

Diagnostic guidé, moteur financement, cockpit et proposition commerciale pour l'équipe Start Academy.

## Workflow Git

Toute modification passe par **branche → PR → CI verte → merge**. Aucun push direct sur `main`.

Après un clone, exécuter **une seule fois** :

```bash
git config core.hooksPath .githooks
```

Cette commande active le hook local `.githooks/pre-push` qui refuse le push direct sur `main`. Bypass volontaire (à documenter) : `git push --no-verify`.

**Protection serveur** : la protection de branche GitHub (rulesets, required status checks) est **indisponible sur le plan Free pour un repo privé**. Elle sera activée avec **GitHub Pro** — payload prêt :

- `required_status_checks: strict` avec contexte `typecheck + test + build`
- `required_linear_history: true`
- `allow_force_pushes: false`, `allow_deletions: false`
- `required_pull_request_reviews.required_approving_review_count: 0` (dev solo)
- `enforce_admins: false` (issue de secours assumée)

En attendant, la discipline PR + le hook local + la CI (verrou logique) tiennent lieu de garde-fous.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
