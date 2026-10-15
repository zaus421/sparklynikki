import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../admin/customer-removal.js',import.meta.url),'utf8');
function ui({confirmed=true,fetch}={}) {
  const events=[], controls=[{disabled:false},{disabled:true}], listeners=new Map();
  const dialog={closed:false,querySelectorAll:()=>controls,addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n),close(){this.closed=true;}};
  const error={textContent:''},window={SPARKLY_ADMIN_CONFIG:{apiBase:'https://local.test'}};
  let confirmations=0;
  vm.runInNewContext(source,{window,confirm:()=>{confirmations++;return confirmed;},fetch,sessionStorage:{getItem:()=> 'test-token'},document:{dispatchEvent:e=>events.push(e)},CustomEvent:class {constructor(type,data){this.type=type;this.detail=data.detail;}}});
  return {action:window.SPARKLY_CUSTOMER_REMOVAL,dialog,error,controls,listeners,events,confirmations:()=>confirmations,args:{id:1,name:'Test',dialog,error}};
}
test('cancel sends no deletion and leaves the dialog unchanged',async()=>{
  const state=ui({confirmed:false,fetch:()=>assert.fail('Unexpected request')});
  await state.action.remove(state.args);
  assert.equal(state.dialog.closed,false);assert.equal(state.events.length,0);
});
test('pending request blocks repeated deletion and closing, then refreshes once',async()=>{
  let resolve,calls=0;
  const state=ui({fetch:()=>{calls++;return new Promise(r=>resolve=r);}});
  const first=state.action.remove(state.args);
  assert.equal(state.action.busy(1),true);
  assert.ok(state.controls.every(c=>c.disabled));
  let prevented=false;state.listeners.get('cancel')({preventDefault(){prevented=true;}});assert.ok(prevented);
  await state.action.remove(state.args);
  assert.equal(calls,1);assert.equal(state.confirmations(),1);
  resolve({ok:true,json:async()=>({ok:true})});await first;
  assert.equal(state.dialog.closed,true);assert.equal(state.events.length,1);
  assert.equal(state.events[0].type,'customer-removed');assert.equal(state.events[0].detail.id,'1');
  assert.equal(state.action.busy(1),false);
  assert.deepEqual(state.controls.map(c=>c.disabled),[false,true]);
});
for(const [name,fetch,message] of [
  ['server failure',async()=>({ok:false,status:500,json:async()=>({error:'Server error'})}),'Server error'],
  ['network failure',async()=>{throw Error('Network unavailable');},'Network unavailable'],
  ['session expiry',async()=>({ok:false,status:401,json:async()=>({})}),'Your session expired. Sign in again.'],
  ['invalid response',async()=>({ok:true,status:200,json:async()=>({})}),'Removal failed (200). Please try again.']
]) test(name+' shows an error without refreshing or closing',async()=>{
  const state=ui({fetch});await state.action.remove(state.args);
  assert.equal(state.error.textContent,message);assert.equal(state.dialog.closed,false);
  assert.equal(state.events.length,0);assert.equal(state.action.busy(1),false);
  assert.deepEqual(state.controls.map(c=>c.disabled),[false,true]);
});
