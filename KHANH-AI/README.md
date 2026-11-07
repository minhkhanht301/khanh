# KHANH AI – Cloudflare Workers starter

This is a public-beta starter, not a production-audited service. It uses:
- Cloudflare Workers for the API and static website
- Cloudflare D1 for user profiles and chat history
- Cloudflare Workers AI for text chat
- Google Identity Services for Google sign-in

## Before you begin
Ask a parent/guardian to help manage the Cloudflare and Google developer accounts and review the applicable age, privacy, and service terms. Do not collect sensitive personal information from users. Publish a privacy notice and contact channel before inviting the public.

## 1. Create a D1 database
In Cloudflare Dashboard: **Storage & databases → D1 SQL Database → Create**.
Name it `khanh-ai-db`. Copy its database ID into `wrangler.toml`, replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`.

## 2. Create Google OAuth web client
In Google Cloud Console, configure the OAuth consent screen and create an OAuth Client ID of type **Web application**.
Add your final website origin to **Authorized JavaScript origins** (for example `https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev`).
Copy the Client ID. Replace `REPLACE_WITH_GOOGLE_OAUTH_CLIENT_ID` in both:
- `wrangler.toml` (`GOOGLE_CLIENT_ID`)
- `public/app.js` (`CLIENT_ID`)
Never put a Google client secret in frontend code. This app uses Google Identity Services ID tokens.

## 3. Apply the database migration
Install Node.js only if you choose the command-line deployment route. From this project folder:
```bash
npm install
npx wrangler d1 migrations apply khanh-ai-db --remote
```

## 4. Enable Workers AI
In Cloudflare Dashboard, open Workers & Pages → AI / Workers AI and confirm your account has access to Workers AI. The worker uses `@cf/meta/llama-3.1-8b-instruct`. Model availability and pricing/quotas depend on Cloudflare's current offering.

## 5. Deploy
From the project folder:
```bash
npx wrangler login
npx wrangler deploy
```
Alternatively, connect this repository to Cloudflare Workers Builds/Git integration and configure the build command `npm install` and deploy command `npx wrangler deploy`.

## 6. Verify
Open your `workers.dev` URL. Check `/api/health`, then test Google sign-in, save a profile, send a short chat message, and verify that a second Google account cannot see the first account's history.

## Important limitations before public launch
- This starter has not undergone an independent security audit or load test.
- Add a published privacy policy, support contact, abuse reporting, monitoring, stronger rate limiting, and backup/restore procedures before public launch.
- The sample has a daily per-user message cap, but it is not a full anti-abuse system.
- Image understanding and voice input/output are not implemented in this starter.
- Google token verification fetches Google's public signing keys on each API request; optimize with safe caching before scaling.
- Review current Cloudflare and Google terms, age requirements, and data protection obligations for your audience.
