# Customer removal

`worker.mjs` is the user-supplied deployed bundle with the customer-removal patch. The original bundle references src/pagination.js, src/operations-extension.js, and src/worker.js; those original source files were not in the frontend repository.

Released with user authorization on October 15, 2026. The production binding is `DB` → `sparklynikki-business`. Migration `001_customer_removal.sql` was applied once, then the patched Worker was deployed as active version `76b53738`, then frontend commit `1baac6025a0b238f64284923af92cd527ca0fe4b` was pushed to main. Do not reapply the migration. All four changed live admin files were compared with the tested source and matched. Existing production records were not modified or removed. See `tests/VERIFICATION.md` for verification limits.

Removal retains the lead and all foreign-key references. Inquiries and quote_requests have required lead references; jobs and ledger_leads also reference leads. Operations schedules/reminders have textual lead IDs without foreign keys. Historical financial reporting, quotes, payments, schedules and reminders are retained. The removal timestamp filters active CRM/customer lists, exports and new-customer lookups. Existing historical records can still resolve their customer. A repeat removal succeeds without altering the original timestamp.

New inquiries with the same contact information create an active lead instead of modifying a removed customer's history. Historical financial aggregates intentionally continue to include retained records.

Run local verification with `node --test tests/*.test.mjs`. Tests use synthetic records and local SQLite only; they do not verify deployed functionality.
