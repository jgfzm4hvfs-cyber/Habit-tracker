const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');

const FIXED = '2026-10-17T10:00:00.000Z';
class TestDate extends Date {
  constructor(...args) { super(...(args.length ? args : [FIXED])); }
  static now() { return new Date(FIXED).getTime(); }
}
const context = vm.createContext({window: {}, Date: TestDate, Intl, Map, Set, Math, Number, String, Boolean, Array, Object, JSON, globalThis: {}});
vm.runInContext(fs.readFileSync(process.env.AMULET_MODULE || require('node:path').join(__dirname, '..', 'amulet.js'), 'utf8'), context);
const {normalize, hasData, model: m} = context.window.Amulet;
const TODAY = '2026-10-17';
const DAYS = [0,1,2,3,4,5,6];
const clone = o => JSON.parse(JSON.stringify(o));
function fixture() {
  const v = {from: '2026-10-01', name: 'Read', rewardOre: 1000, days: DAYS.slice(), targetPerWeek: 7};
  return {version: 1, startedOn: '2026-10-01', habits: [{id:'read', ...v, createdOn:v.from, archivedOn:null, versions:[v]}], ledger:[], wishlist:[]};
}
function event(id, type, extra = {}) { return {id, type, date:TODAY, at:FIXED, label:'Read', ...extra}; }
function earned(id = 'e1', extra = {}) { return event(id, 'earn', {habitId:'read', amountOre:1000, ...extra}); }
function view(raw) { return m.ledgerView(normalize(raw)); }
const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('default rewards and schedules match requested amounts; seed wallet is zero', () => {
  const state = normalize(undefined);
  assert.equal(state.habits.length, 9);
  assert.equal(Array.from(state.habits, h => h.rewardOre).join(','), '2500,1000,2000,1000,3000,5000,2500,4000,4000');
  assert.equal(m.ledgerView(state).balance, 0);
  assert.equal(hasData(state), false);
  assert.equal(m.isScheduled(state.habits.find(h=>h.id==='am_work'), TODAY), false);
  assert.equal(m.isScheduled(state.habits.find(h=>h.id==='am_leave'), TODAY), false);
});
test('KR parsing uses exact ore, rejects zero, fractions beyond ore, negatives and overflow', () => {
  assert.equal(m.parseAmount('12,50'), 1250);
  assert.equal(m.parseAmount('2 000'), 200000);
  assert.equal(m.parseAmount('0.01'), 1);
  assert.equal(m.parseAmount('1\u00a0000,99'), 100099);
  for (const bad of ['0', '-1', 'NaN', '1.001', '1e3', 'Infinity', '1000000.01', '']) assert.equal(m.parseAmount(bad), null, bad);
});
test('replay rejects duplicate daily earnings and duplicate event ids', () => {
  const s=fixture(); s.ledger=[earned(),earned('e2'),earned('e1',{date:'2026-10-16'})];
  const n=normalize(s); assert.equal(n.ledger.length,1); assert.equal(m.ledgerView(n).balance,1000);
});
test('replay rejects malformed, future, orphan and fractional earnings', () => {
  const s=fixture(); s.ledger=[earned('unknown',{habitId:'missing'}),earned('future',{date:'2026-10-18'}),earned('fraction',{amountOre:1.5}),earned('negative',{amountOre:-1}),earned('zero',{amountOre:0})];
  assert.equal(normalize(s).ledger.length,0);
});
test('undo and recheck are reversible once; duplicate undo is ignored', () => {
  const s=fixture(); s.ledger=[earned(),event('u1','undo-earn',{refId:'e1'}),event('u2','undo-earn',{refId:'e1'}),earned('e2',{amountOre:1500})];
  const n=normalize(s); const v=m.ledgerView(n);
  assert.equal(n.ledger.length,3); assert.equal(v.balance,1500); assert.equal(v.completions.size,1); assert.equal(v.earned,1500);
});
test('withdrawals cannot overdraw wallet and preserve exact balance', () => {
  const s=fixture(); s.ledger=[earned(),event('w1','withdraw',{amountOre:-451}),event('w2','withdraw',{amountOre:-550}),event('w3','withdraw',{amountOre:10})];
  const n=normalize(s); assert.equal(n.ledger.length,2); assert.equal(m.ledgerView(n).balance,549);
});
test('purchase and refund are idempotent; original price and label are retained', () => {
  const s=fixture(); s.wishlist=[{id:'wish1',name:'Renamed sweater',priceOre:4000,createdAt:FIXED}];
  s.ledger=[earned(),event('p1','purchase',{itemId:'wish1',amountOre:-900,label:'Original sweater'}),event('p2','purchase',{itemId:'wish1',amountOre:-10}),event('r1','refund',{refId:'p1'}),event('r2','refund',{refId:'p1'})];
  const n=normalize(s); const v=m.ledgerView(n);
  assert.equal(n.ledger.length,3); assert.equal(v.balance,1000); assert.equal(v.purchases.size,0);
  assert.equal(n.ledger[1].label,'Original sweater'); assert.equal(n.ledger[2].amountOre,900);
});
test('spent earnings cannot be undone into a negative wallet', () => {
  const s=fixture(); s.ledger=[earned(),event('p1','purchase',{itemId:'wish1',amountOre:-900}),event('u1','undo-earn',{refId:'e1'})];
  const v=view(s); assert.equal(v.balance,100); assert.equal(v.completions.size,1);
});
test('habit reward changes do not rewrite captured earnings', () => {
  const s=fixture(); s.habits[0].rewardOre=5000; s.habits[0].versions[0].rewardOre=5000; s.ledger=[earned()];
  assert.equal(view(s).balance,1000);
});
test('archiving a habit keeps historical earnings and prevents later scheduling', () => {
  const s=fixture(); s.habits[0].archivedOn='2026-10-16'; s.ledger=[earned('e1',{date:'2026-10-16'})];
  const n=normalize(s); assert.equal(m.ledgerView(n).balance,1000); assert.equal(m.isScheduled(n.habits[0],TODAY),false);
});
test('empty habit list remains empty across normalization', () => {
  const s=fixture(); s.habits=[]; assert.equal(normalize(s).habits.length,0);
});
test('same-day schedule edits keep already earned money after normalization', () => {
  const s=fixture(); s.ledger=[earned()];
  const v={from:TODAY,name:'Read weekdays',rewardOre:2000,days:[1,2,3,4,5],targetPerWeek:5};
  s.habits[0].versions.push(v); Object.assign(s.habits[0],v);
  assert.equal(view(s).balance,1000);
});
test('removed wish stays removed after purchase refund and normalization', () => {
  const s=fixture(); s.wishlist=[]; s.ledger=[earned(),event('p1','purchase',{itemId:'wish1',amountOre:-900}),event('r1','refund',{refId:'p1'})];
  const n=normalize(s); assert.equal(n.wishlist.length,0); assert.equal(m.ledgerView(n).balance,1000);
});
test('progress counts only dates since habit creation, and local calendar arithmetic survives DST', () => {
  const s=fixture(); s.habits[0].createdOn='2026-10-15'; s.habits[0].versions[0].from='2026-10-15'; s.ledger=[earned('e1',{date:'2026-10-16'})];
  const n=normalize(s); const stats=m.goalStats(n,'2026-10-01',TODAY);
  assert.equal(stats.goal,3); assert.equal(stats.done,1); assert.equal(stats.percent,33);
  assert.equal(m.shiftDate('2026-10-25',1),'2026-10-26'); assert.equal(m.shiftDate('2026-03-29',1),'2026-03-30');
});
test('weekly targets allow every completion to earn while capping progress at goal', () => {
  const s=fixture(); s.habits[0].versions[0].targetPerWeek=3;
  s.ledger=[12,13,14,15,16,17].map(d=>earned('e'+d,{date:'2026-10-'+d}));
  const n=normalize(s); const stats=m.goalStats(n,'2026-10-12','2026-10-18');
  assert.equal(stats.goal,3); assert.equal(stats.done,3); assert.equal(stats.percent,100); assert.equal(m.ledgerView(n).balance,6000);
});


test('starter habits begin October 12 and can earn on past scheduled days', () => {
  const n = normalize(undefined);
  assert.equal(n.version, 2);
  assert.equal(n.startedOn, '2026-10-12');
  assert.equal(n.habits.filter(h => m.isScheduled(h, '2026-10-12')).length, 9);
  assert.equal(n.habits.filter(h => m.isScheduled(h, '2026-10-16')).length, 9);
  assert.equal(n.habits.filter(h => m.isScheduled(h, '2026-10-17')).length, 7);
  assert.equal(n.habits.filter(h => m.isScheduled(h, '2026-10-11')).length, 0);
  const work = n.habits.find(h => h.id === 'am_work');
  n.ledger.push(event('backfilled', 'earn', {habitId: work.id, date: '2026-10-12', amountOre: m.versionAt(work, '2026-10-12').rewardOre}));
  assert.equal(view(n).balance, 2000);
});
function oldStarterState() {
  const s = clone(normalize(undefined));
  s.version = 1;
  s.startedOn = TODAY;
  for (const h of s.habits) {
    h.createdOn = TODAY;
    h.versions = [{...h.versions[0], from: TODAY}];
  }
  return s;
}
test('pristine v1 starter history migrates once without becoming customized data', () => {
  const n = normalize(oldStarterState());
  assert.equal(n.version, 2);
  assert.equal(n.startedOn, '2026-10-12');
  assert.equal(n.habits.every(h => h.createdOn === '2026-10-12' && h.versions.length === 1 && h.versions[0].from === '2026-10-12'), true);
  assert.equal(hasData(n), false);
  assert.deepEqual(clone(normalize(n)), clone(n));
});
test('v1 migration preserves edited starter rewards and schedules, custom dates and wallet history', () => {
  const s = oldStarterState();
  const h = s.habits.find(h => h.id === 'am_read');
  h.versions[0] = {...h.versions[0], name:'Read a chapter', rewardOre:3500, days:[1,2,3,4,5], targetPerWeek:3};
  Object.assign(h, h.versions[0]);
  const archived = s.habits.find(h => h.id === 'am_run');
  archived.archivedOn = TODAY;
  s.habits = s.habits.filter(h => h.id !== 'am_strength');
  const customVersion = {from:TODAY, name:'Custom', rewardOre:500, days:DAYS, targetPerWeek:7};
  s.habits.push({id:'amh_custom', ...customVersion, createdOn:TODAY, archivedOn:null, versions:[customVersion]});
  s.wishlist = [{id:'wish1', name:'Sweater', priceOre:700, createdAt:FIXED}];
  s.ledger = [event('seed-earn', 'earn', {habitId:'am_read', amountOre:3500}), event('purchase', 'purchase', {itemId:'wish1', amountOre:-700}), event('spend', 'withdraw', {amountOre:-500})];
  const before = clone(normalize({...s, version:2}));
  const n = normalize(s);
  const read = n.habits.find(h => h.id === 'am_read');
  assert.equal(read.createdOn, '2026-10-12');
  assert.equal(m.versionAt(read, '2026-10-16').name, 'Read');
  assert.equal(m.versionAt(read, '2026-10-16').rewardOre, 1000);
  assert.equal(m.versionAt(read, TODAY).name, 'Read a chapter');
  assert.equal(m.versionAt(read, TODAY).rewardOre, 3500);
  assert.equal(m.versionAt(read, TODAY).targetPerWeek, 3);
  assert.equal(m.isScheduled(read, TODAY), false);
  assert.equal(n.habits.find(h => h.id === 'amh_custom').createdOn, TODAY);
  assert.equal(m.isScheduled(n.habits.find(h => h.id === 'amh_custom'), '2026-10-16'), false);
  assert.equal(n.habits.find(h => h.id === 'am_run').archivedOn, TODAY);
  assert.equal(n.habits.some(h => h.id === 'am_strength'), false);
  assert.deepEqual(clone(n.ledger), before.ledger);
  assert.deepEqual(clone(n.wishlist), before.wishlist);
  assert.equal(m.ledgerView(n).balance, 2300);
  assert.equal(hasData(n), true);
  assert.deepEqual(clone(normalize(n)), clone(n));
});
test('v1 migration preserves later effective edits and never reseeds an empty list', () => {
  const s = oldStarterState();
  const h = s.habits.find(h => h.id === 'am_read');
  h.createdOn = '2026-10-14';
  h.versions = [{...h.versions[0], from:'2026-10-14'}, {...h.versions[0], from:'2026-10-16', rewardOre:2000}, {...h.versions[0], from:TODAY, rewardOre:3000}];
  Object.assign(h, h.versions[2]);
  const n = normalize(s);
  const read = n.habits.find(h => h.id === 'am_read');
  assert.equal(m.versionAt(read, '2026-10-12').rewardOre, 1000);
  assert.equal(m.versionAt(read, '2026-10-15').rewardOre, 1000);
  assert.equal(m.versionAt(read, '2026-10-16').rewardOre, 2000);
  assert.equal(m.versionAt(read, TODAY).rewardOre, 3000);
  s.habits = [];
  assert.equal(normalize(s).habits.length, 0);
  assert.equal(normalize(normalize(s)).habits.length, 0);
});

let failed=0;
for (const [name, fn] of tests) {
  try { fn(); console.log('PASS',name); }
  catch (error) { failed++; console.error('FAIL',name+'\n '+error.message); }
}
console.log(`${tests.length-failed}/${tests.length} pure-model regressions passed`);
if(failed) process.exitCode=1;
