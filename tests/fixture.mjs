
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../backend/worker.mjs';

export async function fixture() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../backend/migrations/001_customer_removal.sql', import.meta.url), 'utf8'));
  const DB = {
    prepare(sql) {
      let args = [];
      const statement = {
        bind(...values) { args = values; return statement; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async run() { return { meta: db.prepare(sql).run(...args) }; }
      };
      return statement;
    },
    async batch(statements) {
      db.exec('BEGIN');
      try { const results = []; for (const statement of statements) results.push(await statement.run()); db.exec('COMMIT'); return results; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    }
  };
  const env = { DB, SESSION_SECRET: 'local-test-only-secret-32-characters-long', ADMIN_PASSWORD: 'local-password' };
  let token = '';
  async function call(path, method='GET', body, authenticated=true) {
    return worker.fetch(new Request('https://local.test' + path, { method, headers: { ...(authenticated && token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type':'application/json' }, ...(body ? {body:JSON.stringify(body)} : {}) }), env);
  }
  token = (await (await call('/api/login','POST',{username:'admin',password:env.ADMIN_PASSWORD})).json()).token;
  assert.ok(token);
  db.exec(`INSERT INTO leads(id,name,email,normalized_email,status,quote_amount,revenue) VALUES(1,'Historical customer','old@example.test','old@example.test','Won',125,100),(2,'Active customer','','','New',0,0);
    INSERT INTO inquiries(id,lead_id) VALUES('inquiry-1',1);
    INSERT INTO quote_requests(id,lead_id,amount,status) VALUES('inquiry-1',1,125,'Accepted');
    INSERT INTO jobs(id,lead_id,customer,service,quoted_cents,collected_cents,payment_status,payment_method,job_date) VALUES('11111111-1111-4111-8111-111111111111',1,'Historical customer','Deep cleaning',12500,10000,'Partial','Cash',date('now'));
    INSERT INTO ledger_leads(lead_id,prior_status) VALUES(1,'Won');
    INSERT INTO operations_schedule(id,lead_id,customer,service,job_date) VALUES('schedule-1','1','Historical customer','Deep cleaning',date('now'));
    INSERT INTO operations_reminders(id,lead_id,customer,title,due_date) VALUES('reminder-1','1','Historical customer','Follow up',date('now'));`);
  return {db, DB, call};
}
