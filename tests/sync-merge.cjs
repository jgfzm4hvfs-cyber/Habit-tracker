const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(process.env.AMULET_TEST_ROOT || path.join(__dirname, '..'));
const context = vm.createContext({ window: {}, Date, Intl, Map, Set, Number, String, Boolean, Object, Array, JSON, Math, Symbol });
vm.runInContext(fs.readFileSync(path.join(root, 'amulet.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(path.join(root, 'sync-merge.js'), 'utf8'), context);
const A = context.window.Amulet;
const copy = value => JSON.parse(JSON.stringify(value));
const merge = (...args) => copy(context.window.HabitSyncMerge.merge(...args));
const day = '2026-10-20';
function state() {
  return { version: 3, habits: [{id:'h1',name:'Read',icon:'R'}], entries: {}, dayNotes: {},
    exercise: { goals:{calories:2500,protein:180}, exercises:[{id:'ex1',name:'Run'}], meals:{}, workouts:{}, weights:{} },
    caffeine:{goalCups:4,entries:{}}, amulet: copy(A.buildTemplate()),
    activeTopTab:'amulet', viewMode:'week', sidebarMode:'daily', cloud:{userId:'test',lastSyncedAt:'base'}, auth:{sessionToken:'local-secret'} };
}
function event(id, type, amountOre, extra={}) { return {id,type,date:day,at:`${day}T12:00:00.000Z`,label:id,amountOre,...extra}; }
function earn(id, habitId='am_read', amount=1000, extra={}) { return event(id,'earn',amount,{habitId,...extra}); }
function wallet(s) { return A.model.ledgerView(s.amulet).balance; }
function safe(base, local, remote) { const result=merge(base,local,remote); assert.equal(result.ok,true,JSON.stringify(result.conflicts)); return result; }
let passed=0;
function test(name, fn) { fn(); passed++; console.log(`ok ${passed} - ${name}`); }

test('disjoint core completions and notes merge',()=>{
  const b=state(),l=copy(b),r=copy(b);
  l.entries.h1={[day]:{completed:true,updatedAt:`${day}T10:00:00Z`}}; r.dayNotes[day]='Remote note';
  const result=safe(b,l,r); assert.equal(result.state.entries.h1[day].completed,true); assert.equal(result.state.dayNotes[day],'Remote note');
});
test('deletion versus unchanged stays deleted, including keyed arrays',()=>{
  const b=state(); b.entries.h1={[day]:{completed:true}}; b.amulet.wishlist=[{id:'wish',name:'Hat',priceOre:2000,createdAt:`${day}T10:00:00Z`}];
  const l=copy(b),r=copy(b); delete l.entries.h1[day]; l.amulet.wishlist=[];
  const result=safe(b,l,r); assert.equal(result.state.entries.h1[day],undefined); assert.equal(result.state.amulet.wishlist.length,0);
});
test('concurrent delete and edit preserves edited record with a recoverable alternate',()=>{
  const b=state(); b.dayNotes[day]='Original'; const l=copy(b),r=copy(b); delete l.dayNotes[day]; r.dayNotes[day]='Edited';
  const result=safe(b,l,r); assert.equal(result.state.dayNotes[day],'Edited'); assert.equal(result.conflicts[0].kind,'delete-edit');
});
test('legacy no-baseline merges additions and uses latest updatedAt for conflicting fields',()=>{
  const l=state(),r=state(); l.entries.h1={[day]:{completed:true,note:'Old',updatedAt:`${day}T10:00:00Z`}};
  r.entries.h1={[day]:{completed:false,note:'New',updatedAt:`${day}T11:00:00Z`}}; r.dayNotes['2026-10-19']='Remote only';
  const result=safe(null,l,r); assert.equal(result.state.entries.h1[day].completed,false); assert.equal(result.state.entries.h1[day].note,'New'); assert.equal(result.state.dayNotes['2026-10-19'],'Remote only');
});
test('ambiguous concurrent scalar edit keeps local and journals remote',()=>{
  const b=state(),l=copy(b),r=copy(b); b.dayNotes[day]='B'; l.dayNotes[day]='L'; r.dayNotes[day]='R';
  const result=safe(b,l,r); assert.equal(result.state.dayNotes[day],'L'); assert.ok(result.conflicts.some(c=>c.remote==='R'));
});
test('local auth configuration and navigation never enter conflict journals',()=>{
  const b=state(),l=copy(b),r=copy(b); r.auth.sessionToken='remote-secret'; r.cloud.userId='remote'; r.activeTopTab='exercise'; r.viewMode='heatmap';
  const result=safe(b,l,r); assert.deepEqual(result.state.auth,l.auth); assert.deepEqual(result.state.cloud,l.cloud); assert.equal(result.state.activeTopTab,'amulet'); assert.equal(result.state.viewMode,'week');
  assert.equal(JSON.stringify(result.conflicts).includes('secret'),false);
});
test('workout move plus concurrent edit merges one global record',()=>{
  const b=state(); b.exercise.workouts[day]=[{id:'wk1',exerciseId:'ex1',weight:50,reps:5,muscleGroups:['legs'],createdAt:`${day}T10:00:00Z`}];
  const l=copy(b),r=copy(b); l.exercise.workouts['2026-10-19']=l.exercise.workouts[day]; delete l.exercise.workouts[day]; r.exercise.workouts[day][0].weight=60;
  const result=safe(b,l,r); assert.equal(result.state.exercise.workouts[day],undefined); assert.equal(result.state.exercise.workouts['2026-10-19'].length,1); assert.equal(result.state.exercise.workouts['2026-10-19'][0].weight,60);
});
test('meal move does not duplicate IDs and independent records union',()=>{
  const b=state(); b.exercise.meals[day]=[{id:'m1',calories:200,protein:20,note:'A'}];
  const l=copy(b),r=copy(b); l.exercise.meals['2026-10-19']=l.exercise.meals[day]; delete l.exercise.meals[day]; r.exercise.meals[day].push({id:'m2',calories:300,protein:30,note:'B'});
  const result=safe(b,l,r); assert.equal(result.state.exercise.meals['2026-10-19'][0].id,'m1'); assert.deepEqual(result.state.exercise.meals[day].map(m=>m.id),['m2']);
});
test('independent caffeine entries and existing entry deletion survive',()=>{
  const b=state(); b.caffeine.entries[day]=[{id:'c1',cups:1}]; const l=copy(b),r=copy(b); delete l.caffeine.entries[day]; r.caffeine.entries[day].push({id:'c2',cups:2});
  const result=safe(b,l,r); assert.deepEqual(result.state.caffeine.entries[day].map(e=>e.id),['c2']);
});
test('Amulet history versions are keyed by from date',()=>{
  const b=state(),l=copy(b),r=copy(b);
  l.amulet.habits[0].versions.push({from:'2026-10-19',name:'Earlier',rewardOre:3000,days:[1,2,3],targetPerWeek:3});
  r.amulet.habits[0].versions.push({from:day,name:'Latest',rewardOre:4000,days:[1,2,3,4],targetPerWeek:4});
  const result=safe(b,l,r); assert.equal(result.state.amulet.habits[0].versions.length,3); assert.equal(result.state.amulet.habits[0].name,'Latest');
});
test('different habits earn independently',()=>{
  const b=state(),l=copy(b),r=copy(b); l.amulet.ledger=[earn('ea')]; r.amulet.ledger=[earn('eb','am_strength',2000)];
  const result=safe(b,l,r); assert.equal(wallet(result.state),3000); assert.equal(result.state.amulet.ledger.length,2);
});
test('duplicate cross-device earning is awarded only once',()=>{
  const b=state(),l=copy(b),r=copy(b); l.amulet.ledger=[earn('ea')]; r.amulet.ledger=[earn('eb')];
  const result=safe(b,l,r); assert.equal(wallet(result.state),1000); assert.equal(result.state.amulet.ledger.length,1); assert.equal(result.aliases.eb,'ea');
});
test('duplicate earning undo remaps its original reference',()=>{
  const b=state(),l=copy(b),r=copy(b); l.amulet.ledger=[earn('ea')]; r.amulet.ledger=[earn('eb'),event('undo','undo-earn',-1000,{habitId:'am_read',refId:'eb'})];
  const result=safe(b,l,r); assert.equal(wallet(result.state),0); assert.equal(result.state.amulet.ledger[1].refId,'ea'); assert.equal(result.state.amulet.ledger.length,2);
});
test('duplicate undo and re-earn preserves legitimate new award generation',()=>{
  const b=state(); b.amulet.ledger=[earn('base')]; const l=copy(b),r=copy(b);
  l.amulet.ledger.push(event('ua','undo-earn',-1000,{habitId:'am_read',refId:'base'}),earn('ra'));
  r.amulet.ledger.push(event('ub','undo-earn',-1000,{habitId:'am_read',refId:'base'}),earn('rb'));
  const result=safe(b,l,r); assert.equal(wallet(result.state),1000); assert.equal(result.state.amulet.ledger.length,3); assert.equal(A.model.ledgerView(result.state.amulet).completions.get(`am_read|${day}`).id,'ra');
});
test('opposite order independent duplicate awards produces no causal cycle',()=>{
  const b=state(),l=copy(b),r=copy(b); l.amulet.ledger=[earn('a1'),earn('a2','am_strength')]; r.amulet.ledger=[earn('b2','am_strength'),earn('b1')];
  const result=safe(b,l,r); assert.equal(wallet(result.state),2000); assert.equal(result.state.amulet.ledger.length,2);
});
test('withdrawal mutation into purchase plus refund is preserved',()=>{
  const b=state(); b.amulet.ledger=[earn('seed','am_read',10000),event('spend','withdraw',-3000)]; const l=copy(b),r=copy(b);
  l.amulet.ledger[1].type='purchase'; l.amulet.ledger[1].itemId='expense'; l.amulet.ledger.push(event('refund','refund',3000,{itemId:'expense',refId:'spend'})); r.amulet.ledger.push(earn('extra','am_strength',1000));
  const result=safe(b,l,r); assert.equal(wallet(result.state),11000); assert.equal(result.state.amulet.ledger.find(e=>e.id==='spend').type,'purchase'); assert.equal(result.state.amulet.ledger.length,4);
});
test('two independently valid spends both survive when combined balance allows',()=>{
  const b=state(); b.amulet.ledger=[earn('seed','am_read',10000)]; const l=copy(b),r=copy(b);
  l.amulet.ledger.push(event('spendA','withdraw',-3000)); r.amulet.ledger.push(event('spendB','purchase',-4000,{itemId:'wishB'}));
  const result=safe(b,l,r); assert.equal(wallet(result.state),3000); assert.equal(result.state.amulet.ledger.length,3);
});
test('concurrent overspending returns recoverable candidate rather than silently dropping spending',()=>{
  const b=state(); b.amulet.ledger=[earn('seed','am_read',10000)]; const l=copy(b),r=copy(b);
  l.amulet.ledger.push(event('spendA','withdraw',-7000)); r.amulet.ledger.push(event('spendB','purchase',-6000,{itemId:'wishB'})); l.dayNotes[day]='Local note'; r.caffeine.entries[day]=[{id:'c1',cups:1}];
  const result=merge(b,l,r); assert.equal(result.ok,false); assert.equal(result.code,'FINANCIAL_CONFLICT'); assert.equal(result.state,null); assert.ok(result.lostEventIds.length); assert.equal(result.candidateState.amulet.ledger.length,3); assert.equal(result.candidateState.dayNotes[day],'Local note'); assert.equal(result.candidateState.caffeine.entries[day][0].cups,1);
});
test('duplicate refunds undo one purchase only once',()=>{
  const b=state(); b.amulet.ledger=[earn('seed','am_read',10000),event('purchase','purchase',-3000,{itemId:'wish'})]; const l=copy(b),r=copy(b);
  l.amulet.ledger.push(event('fa','refund',3000,{refId:'purchase',itemId:'wish'})); r.amulet.ledger.push(event('fb','refund',3000,{refId:'purchase',itemId:'wish'}));
  const result=safe(b,l,r); assert.equal(wallet(result.state),10000); assert.equal(result.state.amulet.ledger.length,3);
});
test('concurrent archive cannot silently erase a later earned record',()=>{
  const b=state(),l=copy(b),r=copy(b); l.amulet.habits.find(h=>h.id==='am_read').archivedOn='2026-10-19'; r.amulet.ledger.push(earn('ea'));
  const result=merge(b,l,r); assert.equal(result.ok,false); assert.ok(result.lostEventIds.includes('ea'));
});
test('inputs remain unchanged and successful merge is idempotent',()=>{
  const b=state(),l=copy(b),r=copy(b); l.amulet.ledger=[earn('ea')]; r.amulet.ledger=[earn('eb')]; const before=JSON.stringify([b,l,r]);
  const result=safe(b,l,r); assert.equal(JSON.stringify([b,l,r]),before); const again=safe(result.state,result.state,result.state); assert.deepEqual(again.state,result.state); assert.equal(again.conflicts.length,0);
});
test('prototype properties are excluded',()=>{
  const b=state(),l=copy(b),r=copy(b); r.dayNotes=JSON.parse('{"__proto__":{"polluted":true},"constructor":{"bad":true},"2026-10-20":"safe"}');
  const result=safe(b,l,r); assert.equal(result.state.dayNotes[day],'safe'); assert.equal(Object.prototype.polluted,undefined); assert.equal(Object.hasOwn(result.state.dayNotes,'__proto__'),false);
});
test('incomplete legacy ledger cannot collapse distinct existing award generations',()=>{
  const l=state(),r=state(); l.amulet.ledger=[earn('e1'),event('u1','undo-earn',-1000,{habitId:'am_read',refId:'e1'}),earn('e2')]; r.amulet.ledger=[earn('e2')];
  const result=merge(null,l,r); assert.equal(result.ok,false); assert.equal(result.code,'FINANCIAL_CONFLICT'); assert.equal(result.candidateState.amulet.ledger.length,3);
});
test('deleting exercise cannot relabel a concurrently logged workout',()=>{
  const b=state(),l=copy(b),r=copy(b); l.exercise.exercises=[]; r.exercise.workouts[day]=[{id:'w1',exerciseId:'ex1',weight:50,reps:5}];
  const result=safe(b,l,r); assert.equal(result.state.exercise.exercises[0].id,'ex1'); assert.equal(result.state.exercise.workouts[day][0].exerciseId,'ex1'); assert.ok(result.conflicts.some(c=>c.kind==='referenced-record-delete'));
});
test('deleting habit cannot hide a concurrently completed day',()=>{
  const b=state(),l=copy(b),r=copy(b); l.habits=[]; r.entries.h1={[day]:{completed:true}};
  const result=safe(b,l,r); assert.equal(result.state.habits[0].id,'h1'); assert.equal(result.state.entries.h1[day].completed,true);
});
test('independent duplicate wishlist purchases need explicit financial review',()=>{
  const b=state(); b.amulet.ledger=[earn('seed','am_read',10000)]; const l=copy(b),r=copy(b);
  l.amulet.ledger.push(event('pa','purchase',-2000,{itemId:'one-wish'})); r.amulet.ledger.push(event('pb','purchase',-2000,{itemId:'one-wish'}));
  const result=merge(b,l,r); assert.equal(result.ok,false); assert.equal(result.candidateState.amulet.ledger.length,3); assert.ok(result.lostEventIds.length);
});
console.log(`${passed} snapshot merge tests passed`);
