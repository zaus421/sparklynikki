-- Prepared only; do not run against production without separate deployment approval.
ALTER TABLE leads ADD COLUMN deleted_at TEXT;
CREATE INDEX idx_leads_active ON leads(id DESC) WHERE deleted_at IS NULL;
