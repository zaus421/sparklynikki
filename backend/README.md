# Customer removal (not deployed)

`worker.mjs` is the user-supplied deployed bundle with the customer-removal patch applied locally. The original bundle references src/pagination.js, src/operations-extension.js, and src/worker.js; those original source files were not in the frontend repository. No Worker was rebuilt or deployed.

The inspected production binding is `DB` → `sparklynikki-business`. Schema inspection was read-only. No production data or schema changes were made. The migration is a proposed, unapplied prerequisite, not an automatic deployment step. Deploying the frontend before the backend would leave removal requests unsupported; keep this change on its feature branch until a coordinated release is authorized.

Removal retains the lead and all foreign-key references. Inquiries and quote_requests have required lead references; jobs and ledger_leads also reference leads. Operations schedules/reminders have textual lead IDs without foreign keys. Historical financial reporting, quotes, payments, schedules and reminders are retained. The removal timestamp filters active CRM/customer lists, exports and new-customer lookups. Existing historical records can still resolve their customer. A repeat removal succeeds without altering the original timestamp.

New inquiries with the same contact information create an active lead instead of modifying a removed customer's history. Historical financial aggregates intentionally continue to include retained records.

Run local verification with `node --test tests/*.test.mjs`. Tests use synthetic records and local SQLite only; they do not verify deployed functionality.
