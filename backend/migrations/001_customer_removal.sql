-- Applied to production with user authorization on 2026-10-15. Do not rerun.
ALTER TABLE leads ADD COLUMN deleted_at TEXT;
CREATE INDEX idx_leads_active ON leads(id DESC) WHERE deleted_at IS NULL;
