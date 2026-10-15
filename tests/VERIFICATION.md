# Customer removal verification

## Scope

Production was initially inspected read-only on October 12, 2026: Worker `admin`, binding `DB`, database `sparklynikki-business`. The user supplied the deployed Worker bundle. Release was subsequently authorized and performed on October 15, 2026 as recorded below.

## Automated checks

On October 15, 2026, `node --test tests/*.test.mjs` passed all 12 tests using Node 24 and in-memory SQLite with foreign keys enabled. `tests/schema.sql` contains the inspected table definitions, unique event index and summary-cache triggers; unrelated non-unique performance indexes and Cloudflare's internal table are omitted.

Coverage includes both authenticated removal endpoints, retry and simultaneous removal requests, missing records, authorization and database errors, retained quotes/payments/inquiries/ledger/schedules/reminders, unchanged financial totals, active-list/search/export filtering, returning inquiries and manual customers, historical editing, rejection of new links to removed customers, and foreign-key/orphan checks. UI controller tests cover confirmation cancellation, duplicate-click suppression, pending controls, completion notification, network/server/session errors and malformed responses.

Syntax checks passed for the changed JavaScript and Worker files. `git diff --check` passed.

## Browser checks

On October 12, 2026, both workflows were exercised at `http://127.0.0.1:8788/admin/` against synthetic data:

- CRM Edit exposed Remove Customer; cancelling confirmation kept the dialog/customer; confirmed removal closed the dialog and removed the row.
- Operations Customers no longer displayed the customer removed from CRM; its scheduled job remained visible.
- Add Existing Customer did not expose removal. Editing a newly created synthetic customer did expose it, using the existing danger-button styling.
- Removal from Operations cleared its customer list; switching to CRM confirmed that customer was absent there too.

The local server uses a fixture session and is not an authentication/security test server. Automated tests exercise Worker authorization separately.

## Production release, October 15, 2026

- Captured a D1 recovery bookmark before the additive migration, then successfully applied the `deleted_at` column and active-lead index individually.
- Compared the full Cloudflare editor content with the tested Worker source, then deployed it. Cloudflare showed version `76b53738` as Active/Latest (previous version `0ed376f6`).
- Pushed tested commit `1baac6025a0b238f64284923af92cd527ca0fe4b` to main. Live `admin/index.html`, `customer-removal.js`, `app.js`, and `operations.js` each returned HTTP 200 and matched the local source after newline normalization.
- Before and after release, production retained 4 leads, 1 job, 4 inquiries and 3 quote requests. No leads were marked removed. Foreign-key errors, schedule orphans and reminder orphans were all zero.
- An unauthenticated live `/api/health` request returned HTTP 401 with `Unauthorized`, as expected.

## Remaining verification limit

The live admin opened at its sign-in form. No authenticated live deletion or end-to-end production removal was performed. Both removal workflows were exercised locally as described above; this is not a claim that live deletion has been verified. No existing production customer was removed for testing.
