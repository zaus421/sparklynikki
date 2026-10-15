import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './fixture.mjs';

for (const route of ['/api/leads/1', '/api/operations/customers/1']) {
  test(`${route}: removal preserves all history, financial totals, references and repeat safety`, async () => {
    const {db,call} = await fixture();
    const tables = ['inquiries','quote_requests','jobs','ledger_leads','operations_schedule','operations_reminders'];
    const before = Object.fromEntries(tables.map(table => [table, db.prepare('SELECT * FROM '+table).all()]));
    const totals = (await (await call('/api/dashboard?days=all')).json()).businessSummary;
    assert.equal((await call(route,'DELETE')).status,200);
    const timestamp = db.prepare('SELECT deleted_at FROM leads WHERE id=1').get().deleted_at;
    assert.ok(timestamp);
    assert.equal((await call(route,'DELETE')).status,200);
    assert.equal(db.prepare('SELECT deleted_at FROM leads WHERE id=1').get().deleted_at,timestamp);
    for (const table of tables) assert.deepEqual(db.prepare('SELECT * FROM '+table).all(),before[table],table);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
    for (const table of ['operations_schedule','operations_reminders']) assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${table} c LEFT JOIN leads l ON l.id=c.lead_id WHERE c.lead_id IS NOT NULL AND l.id IS NULL`).get().n,0);
    for (const query of ['', '?status=Won', '?lookup=1', '?lookup=1&q=Historical']) assert.ok(!(await (await call('/api/leads'+query)).json()).leads.some(l=>l.id===1));
    assert.ok(!(await (await call('/api/export/leads.csv')).text()).includes('Historical customer'));
    const dashboard = await (await call('/api/dashboard?days=all')).json();
    assert.deepEqual(dashboard.businessSummary,totals);
    assert.ok(!dashboard.recentLeads.some(l=>l.id===1));
    assert.equal((await (await call('/api/leads/1')).json()).lead.name,'Historical customer');
    assert.equal((await call('/api/leads/1','PATCH',{status:'Won'})).status,404);
    assert.equal((await call('/api/operations/customers/1','PATCH',{name:'Changed'})).status,404);
    db.close();
  });
}
test('authorization, missing records, database failure leave the customer intact', async () => {
  const {db,DB,call}=await fixture();
  assert.equal((await call('/api/leads/1','DELETE',null,false)).status,401);
  assert.equal((await call('/api/leads/999','DELETE')).status,404);
  const prepare=DB.prepare;
  DB.prepare=sql=> {if(sql.startsWith('UPDATE leads SET deleted_at')) throw Error('Database unavailable');return prepare(sql);};
  assert.equal((await call('/api/leads/1','DELETE')).status,500);
  assert.equal(db.prepare('SELECT deleted_at FROM leads WHERE id=1').get().deleted_at,null);
  db.close();
});
test('new inquiries and manually added customers do not reuse removed customer history',async()=>{
  const {db,call}=await fixture();
  await call('/api/leads/1','DELETE');
  const r=await call('/api/event','POST',{event:'form_submit',event_id:crypto.randomUUID(),page:'/',form:'quote-form',lead:{name:'Returning customer',email:'old@example.test',service:'Deep cleaning'}});
  assert.equal(r.status,200,await r.text());
  assert.equal(db.prepare('SELECT name FROM leads WHERE id=1').get().name,'Historical customer');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM leads WHERE normalized_email='old@example.test' AND deleted_at IS NULL").get().n,1);
  const id=db.prepare("SELECT id FROM leads WHERE normalized_email='old@example.test' AND deleted_at IS NULL").get().id;
  await call('/api/leads/'+id,'DELETE');
  const manual=await call('/api/operations/customers','POST',{request_id:crypto.randomUUID(),name:'Manual returning customer',email:'old@example.test'});
  assert.equal(manual.status,201,await manual.text());
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  db.close();
});
test('historical jobs, schedules and reminders remain editable; new removed-customer links rejected',async()=>{
  const {db,call}=await fixture();
  await call('/api/leads/1','DELETE');
  for (const [kind,id,body] of [
    ['schedule','schedule-1',{customer:'Historical customer',service:'Deep cleaning',job_date:'2026-10-12',status:'Completed'}],
    ['reminders','reminder-1',{title:'Follow up',due_date:'2026-10-12',completed:true}]
  ]) {
    const edit=await call('/api/operations/'+kind+'/'+id,'PATCH',{...body,lead_id:'1'});
    assert.equal(edit.status,200,await edit.text());
    assert.equal((await call('/api/operations/'+kind,'POST',{...body,lead_id:'1'})).status,400);
  }
  const body={lead_id:1,customer:'Historical customer',service:'Deep cleaning',amount_quoted:125,amount_collected:125,payment_status:'Paid',payment_method:'Cash',job_date:'2026-10-12'};
  const edit=await call('/api/jobs/11111111-1111-4111-8111-111111111111','PATCH',body);
  assert.equal(edit.status,200,await edit.text());
  const rejected=await call('/api/jobs','POST',{...body,id:crypto.randomUUID()});
  assert.equal(rejected.status,400);
  assert.equal((await rejected.json()).error,'Linked lead not found');
  const unlinkedId=crypto.randomUUID();
  const unlinked=await call('/api/jobs','POST',{...body,lead_id:null,id:unlinkedId});
  assert.equal(unlinked.status,200,await unlinked.text());
  assert.equal(db.prepare('SELECT lead_id FROM jobs WHERE id=?').get(unlinkedId).lead_id,null);
  assert.ok(db.prepare('SELECT deleted_at FROM leads WHERE id=1').get().deleted_at);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  db.close();
});

test('legacy quote and revenue remain intact, unrelated leads stay active',async()=>{
  const {db,call}=await fixture();
  db.exec("UPDATE leads SET quote_amount=75,revenue=25 WHERE id=2");
  const before=(await (await call('/api/dashboard?days=all')).json()).businessSummary;
  const results=await Promise.all([call('/api/leads/2','DELETE'),call('/api/operations/customers/2','DELETE')]);
  assert.ok(results.every(r=>r.status===200));
  const row=db.prepare('SELECT quote_amount,revenue,status FROM leads WHERE id=2').get();
  assert.equal(row.quote_amount,75);assert.equal(row.revenue,25);assert.equal(row.status,'New');
  assert.deepEqual((await (await call('/api/dashboard?days=all')).json()).businessSummary,before);
  assert.deepEqual((await (await call('/api/leads')).json()).leads.map(l=>l.id),[1]);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);
  db.close();
});
