# SpendSense

A personal USD transaction workspace built with DeepSpace 0.34, React, TypeScript, and Cloudflare Workers. CSV/PDF/receipt/description input → reviewed records → dashboard → category review → approval history.

## Local development

Use Node 24 and npm 11.6+ (see the supported versions in `package.json`).

```sh
npm ci
npx deepspace auth login
npx deepspace dev start --port 5180
```

Vite stages pinned OCR assets into ignored `public/ocr/` automatically; `npm run ocr:assets` can also stage them directly. English recognition uses the compact integer model. OCR downloads its runtime on first use and is limited to one receipt per operation.

Open http://localhost:5180/home and sign in. The public introduction is at `/`.

## Scope

- Private transactions with manual create/edit/delete and inclusive filters.
- CSV mapping and review: up to 200 rows and 2 MB, date formats, amount conventions, exclusion, duplicate-file protection, and resumable partial imports. Only reviewed rows are stored.
- Text-based PDF import with Mozilla [PDF.js](https://mozilla.github.io/pdf.js/): browser extraction, editable extracted text, skipped-line inspection, explicit completeness/USD confirmation, and the same row review. Up to 10 MB and 20 pages. PDF files and extracted text are not uploaded; only approved rows and their file fingerprint are saved.
- Receipt photos: browser-based English OCR with [Tesseract.js](https://github.com/naptha/tesseract.js), locally hosted worker/core/language assets, editable receipt text, final-total/date suggestions, and mandatory reviewed USD approval. PNG/JPEG/WebP, up to 10 MB and 12 megapixels. Missing or conflicting totals/dates stay blank. Raw photos and receipt text are never uploaded; only approved transaction fields and fingerprints are stored.
- Natural-language quick entry: a small deterministic parser for “Spent $12.50 at Starbucks yesterday” and “Received $2500 from Employer on 2026-10-01”. Supports today/yesterday/full ISO dates, with browser-local today as an explained default. Unsupported descriptions are rejected. Both receipt and description saves are idempotent and use the existing owner-scoped import review snapshot. No AI credits required.
- Confirmed USD totals calculated in integer cents: spending, income, net cash flow, category shares, and recent transactions. Net cash flow is not a bank balance.
- Shared assistant tools for date context, financial summaries, transaction lookup, and category previews. No generic database write or approval tools are available to the model.
- User-controlled category approvals: immutable reviewed snapshots, ownership checks, stale/expired review rejection, serialized execution, retry progress, and persistent decision history.
- Reviews support up to 100 changes and expire after 24 hours. A storage failure can leave an approved batch partially applied; the Actions page displays progress and supports retry. Cancellation is available before application starts.

Live AI returned **Payment Required**. Model-generated answers and proposals remain **unverified** until an account has DeepSpace AI credits. Financial tools and the manual approval workflow were tested against the real backend. No simulated AI response is shown to users.

PDF layout support is deliberately narrow: full ISO or slash dates with a year, merchant text, and a single amount, optionally followed by CR/DR. Balance lines, multiple amounts, and two-date rows are skipped and shown for inspection. Scanned and password-protected PDFs are unsupported; use a CSV export or correct the extracted text. AI layout normalization and saved categorization rules are future work.

## Verification

```sh
npm run type-check
npm run lint
npm run test:unit
npx deepspace test run all
```

The browser suite runs sequentially because the sign-out test invalidates an SDK-cached account session shared by other tests.

Financial browser tests use DeepSpace test-account fixtures and real backend records. Existing integration-catalog debug tests intercept HTTP responses for loading/error states. The live AI check records a `live-ai-unverified` annotation on the credit refusal; that does not verify a generated answer.

Live model calls are opt-in via `SPENDSENSE_LIVE_AI=true`; the default suite verifies financial tools and skips model generation as requested.

The development session's ignored `.deepspace/module2-playwright.config.ts` uses installed Chromium and the running server at port 5180 when browser downloads are unavailable. The checked-in configuration starts its own server.

## Deployment

```sh
git add .
git commit -m "Prepare SpendSense demo release"
npx deepspace deploy
```

DeepSpace is the app's default source authority. Local and deployed data are separate: importing locally does not populate the deployed app. Secrets belong in DeepSpace's secrets store, never source control.

See [DEMO.md](DEMO.md) for the recording sequence and expected totals.
