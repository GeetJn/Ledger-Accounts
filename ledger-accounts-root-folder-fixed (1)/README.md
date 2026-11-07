# Ledger Accounts

A Next.js + TypeScript business billing application scaffold using Supabase Auth and PostgreSQL. It is organized for GitHub and Vercel deployment and uses a restrained off-white/charcoal interface.

> **Delivery status:** This is a working foundation, not yet a finished production accounting suite. The core database-backed billing flow, sequential invoice allocator, draft save, PDF download, payment recording, private revision workflow, records pages, reports summary, and AI integration path are included. Some features in the master specification remain incomplete; see **Known gaps before production** below. Do not use it as the sole accounting record system until the remaining items and security tests are completed.

## Included

- Supabase email/password authentication, Google OAuth and phone OTP UI (Google and SMS providers must be configured in Supabase).
- Shop/profile creation from an Auth signup trigger.
- Product, customer and expense records scoped through PostgreSQL Row Level Security.
- Draft bills stored in PostgreSQL. Empty drafts are allowed; empty finalization is rejected.
- Per-shop, database-allocated sequential invoice numbers. The allocation is transactional and occurs only when a draft is finalized; no application-level bill quota is implemented.
- Numeric monetary columns (`NUMERIC`) and server-side bill calculations.
- Customer PDF endpoint that does not include private revision history; default footer is “Thank You!” and “Have a Nice Day!”.
- Payment entries and outstanding-balance calculation; payment amount cannot exceed outstanding balance.
- Finalized-bill revisions that preserve before/after JSON snapshots and revision timestamps. A fresh 10-minute server-checked verification is required to revise or view alteration history.
- Emergency Password stored as a bcrypt hash by a server route; normal and Emergency Password verification are supported for sensitive bill actions.
- Read-only Ledger AI endpoint using an OpenAI-compatible chat-completions provider, plus persistent chat history and browser speech recognition.
- Basic business summary RPC, CSV export of the recent bill list, starter PWA manifest and network fallback.

## Stack

- Next.js App Router, React, TypeScript
- Supabase Auth and PostgreSQL
- Row Level Security (RLS) and PostgreSQL `SECURITY DEFINER` functions for bill writes
- `jspdf` for PDF creation
- `libphonenumber-js` for E.164 phone validation
- A generated ISO country registry (249 country/territory entries) for searchable registration country selection
- Browser Web Speech API where available

## Requirements

- Node.js 20.9+ (Node 22 LTS recommended)
- A Supabase project
- Vercel account for hosted deployment
- Optional AI provider key for Ledger AI

## Local setup

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local` and fill in:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server only; never use a `NEXT_PUBLIC_` prefix)
   - AI variables only if Ledger AI is required.
3. In Supabase **SQL Editor**, run `supabase/migrations/0001_initial_schema.sql` against a new project.
4. In Supabase **Authentication → Providers**, enable Email. Configure Google OAuth and Phone/SMS only if those login options will be used. Set the authorized redirect URL to `http://localhost:3000/auth/callback` for local development and your production `/auth/callback` URL for Vercel.
5. For one-step signup with an Emergency Password created immediately, configure Supabase email confirmation so `signUp` returns a session. If email confirmation is required, a new user must verify email, sign in, and set the Emergency Password in **Settings** before using protected editing/history. This onboarding edge still needs a polished recovery/setup handoff.
6. Install dependencies and run the application:

   ```bash
   npm install
   npm run dev
   ```

7. Open `http://localhost:3000`.

## GitHub → Vercel

1. Create a GitHub repository named `ledger-accounts`.
2. Upload the contents of this folder (the `package.json` must be at the repository root).
3. In Vercel, import the GitHub repository. Framework preset should be **Next.js**; root directory should be `.`.
4. Add the same environment variables from `.env.local` in Vercel Project Settings → Environment Variables. Add them for Preview and Production as needed.
5. Deploy. Later pushes to the connected GitHub branch trigger new Vercel deployments.
6. In Supabase Authentication settings, add your production `https://YOUR_DOMAIN/auth/callback` URL to the redirect allow list.
7. Apply future SQL migrations before deploying code that depends on them. Never roll a database back to an older incompatible schema without a reviewed migration plan.

## Important environment variables

| Variable | Client/server | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | Supabase browser/server session client |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only** | Emergency credential verification and short-lived owner verification records |
| `AI_PROVIDER_API_KEY` | **Server only** | Enables Ledger AI |
| `AI_PROVIDER_BASE_URL` | Server only | OpenAI-compatible provider base URL |
| `AI_PROVIDER_MODEL` | Server only | Configured AI model name |
| `NEXT_PUBLIC_APP_URL` | Public | Optional app URL for deployment metadata |

## Security model notes

- Ordinary bill reads and all customer/item/expense access are filtered by `current_shop_id()` RLS policies.
- The app does not grant client-side insert/update/delete privileges on finalized bills, bill items, or payments. Those writes go through database functions.
- Invoice allocation uses a shop counter row and an atomic `INSERT … ON CONFLICT … UPDATE … RETURNING` inside the finalization transaction.
- Bill revisions are stored separately. Direct table grants are revoked for `bill_revision_history`, `emergency_credentials`, `owner_verifications`, `security_logs`, and `invoice_counters`.
- Sensitive verification creates an opaque random token, stores only its SHA-256 hash in PostgreSQL, and returns the token only in an HTTP-only, Secure-in-production, SameSite=Strict cookie with a 10-minute lifetime.
- Emergency Password values are bcrypt-hashed on the server. The database hash is not included in user metadata or sent to the browser.
- Customer PDFs use the current customer-facing bill state only; they do not query or render revision snapshots.
- Ledger AI does not receive revision history and is read-only. No AI call is made if the provider key is absent.

**Review the SQL and add automated RLS / penetration / concurrency tests before production.** A client-side page guard is not an authorization boundary; the database policies and server endpoints must remain the security boundary.

## Tests and checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The included automated tests currently cover pure bill arithmetic only. They do not constitute a complete verification of database concurrency, RLS tenant isolation, authentication recovery or production deployment.

## Known gaps before production

These items were specified in the master request but are not fully implemented in this foundation release:

1. **International country data:** a generated ISO registry includes 249 country/territory entries and international dialing metadata from `libphonenumber-js`. It is a versioned snapshot, not a live-maintained feed; verify currency and time-zone defaults (especially multi-zone countries) for each business. Customer and shop settings still need a broader regional preference editor.
2. **Localization:** the language preference can be stored (English/Hindi), but the interface is still displayed in English. Full application-wide Hindi translations, RTL layout, the other requested languages and PDF font embedding are not implemented. The selector explicitly labels Hindi as translation-incomplete.
3. **Customer detail ledger:** the current customer page is a searchable customer register; full customer-wise bill statements, balances, payment timeline and downloadable statements still need completion.
4. **Inventory:** optional stock movement records, low-stock alerts and stock deduction/reversal workflows are not yet implemented.
5. **Payments:** payment receipts, reversal/adjustment UI, full payment ledger and immutable correction workflow need completion. The current payment function supports adding receipts but not reversal.
6. **Bill lifecycle:** cancellation/archival reasons, bill duplication, due-date reminders and customer-facing public invoice links are not implemented. There is intentionally no public invoice URL.
7. **Revision UI:** the owner-only history page displays preserved JSON snapshots and timeline entries. A polished field-by-field comparison, richer original-date presentation and complete revision filter tools remain to be built.
8. **PDFs:** current PDF is a basic text invoice. Shop logo, customer photo, robust multi-page table headers/footers, script-specific fonts and country-specific invoice layouts are not finished.
9. **WhatsApp:** the app opens WhatsApp with a prepared message and opens the PDF separately. The owner must attach/send the file manually. No automated WhatsApp Business API delivery is implemented.
10. **Files/storage:** Supabase Storage upload flows for logos, customer photos and receipts are not implemented yet.
11. **Reports:** database summary metrics are aggregated server-side, but custom daily/weekly/monthly/yearly charts, customer/item ranking, full CSV/PDF export and richer filters remain incomplete.
12. **Ledger AI:** headline totals use the shop-scoped summary RPC, while detail context is a bounded recent data sample (not the entire lifetime ledger). Follow-up context across chat turns is limited; it does not execute business actions.
13. **Backups/export:** a complete full-account export/restore flow and in-app backup download are not included. Use Supabase backups until this is implemented and tested.
14. **Security administration:** the security audit screen, active-session controls, account deletion workflow and recovery event review need additional work. Emergency Password currently authorizes protected bill actions and can be changed after verification; it does not independently reset a forgotten Supabase sign-in password.
15. **Automated testing:** included tests cover the pure bill calculation helpers. There are no integration tests against a live Supabase project for simultaneous finalization, cross-shop access denial, emergency-password rate limits, revision immutability or API authorization.
16. **Regional formatting:** the PDF uses the shop currency and locale; most dashboard and list screens currently default to INR/en-IN rather than reading the saved shop currency/locale. Multi-currency display needs to be connected across all screens.
17. **Discounts and tax defaults:** item and bill discounts currently accept fixed amounts; percentage discount modes and configurable customer-facing discount presentation are not complete. Tax rate can be entered per bill, but the shop default is not yet prefilled automatically.
18. **Registration and recovery:** registration currently uses email/password; mobile OTP is available at sign-in after Supabase Phone Auth is configured. Emergency Password verifies protected bill operations but does not independently recover the normal Supabase login.
19. **Accounting compliance:** configure appropriate taxes, local invoice requirements, tax rules and document-retention procedures with a qualified professional for the jurisdictions in which the shop operates.

## Reference design

The uploaded specification included written style guidance but no attached visual reference screenshots. The interface therefore follows the requested minimal visual direction: light neutral background, white cards, charcoal text, restrained borders, subtle shadow and Inter/system sans-serif typography.

## Implementation note

The UI uses reusable components and a small custom CSS design system rather than Tailwind utility classes in this foundation release. The requirements that depend on external providers (Google OAuth, SMS OTP, AI) remain inactive until configured in Supabase or the relevant provider. No screenshots were present in the uploaded specification, so the styling follows its written visual guidance.
