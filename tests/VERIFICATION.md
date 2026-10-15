# Customer removal verification

## Scope

Production was inspected read-only on October 12, 2026: Worker `admin`, binding `DB`, database `sparklynikki-business`. The user supplied the deployed Worker bundle. No production Worker code, D1 schema or records were changed.

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

## Not verified or performed

No live deletion, D1 migration application, Worker deployment, or deployed integration test was performed. Local SQLite verifies SQL and relationship behavior; Cloudflare runtime behavior still needs staging verification before release. The frontend must not be released ahead of the proposed migration and Worker change. The feature branch is for review only.
