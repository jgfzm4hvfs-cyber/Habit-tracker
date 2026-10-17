const fs=require('fs');
const vm=require('vm');
const assert=require('node:assert/strict');
const BASE=process.env.AMULET_TEST_ROOT || require('node:path').join(__dirname, '..');
function harness(seed={}) {
  const storage=new Map(Object.entries(seed)); const timers=new Map(); let tid=0;
  const localStorage={getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
  const document={getElementById:()=>null,querySelectorAll:()=>[],querySelector:()=>null};
  const setTimeout=(fn,ms)=>{timers.set(++tid,{fn,ms});return tid;};
  const clearTimeout=id=>timers.delete(id);
  const window={localStorage,setTimeout,clearTimeout,setInterval:()=>1,clearInterval:()=>{},confirm:()=>true};
  const context=vm.createContext({window,document,navigator:{},Date,Intl,Map,Set,Math,Number,String,Boolean,Array,Object,JSON,Uint8Array,atob:s=>Buffer.from(s,'base64').toString('binary'),setTimeout,clearTimeout,clearInterval:()=>{},console});
  vm.runInContext(fs.readFileSync(BASE+'/amulet.js','utf8'),context);
  let source=fs.readFileSync(BASE+'/app.js','utf8');
  source=source.replace(/  window\.Amulet\.mount\(\{[\s\S]*?\n  \}\);/,'');
  source=source.replace('  initialize();','  // initialization is intentionally omitted in this isolated sync harness');
  const cut=source.lastIndexOf('})();');
  source=source.slice(0,cut)+`renderAll=()=>{}; renderSyncPanel=()=>{};
    window.__sync={persistState, normalizeState, pushToCloud, pullFromCloud, bootstrapCloudSyncNow, scheduleCloudPush,
      runtime:cloudRuntime,getState:()=>state,setState:s=>{state=normalizeState(s)},setRequest:f=>{requestCloudApi=f},setOnline:f=>{canUseCloudSync=f}};
  `+source.slice(cut);
  vm.runInContext(source,context);
  return {...window.__sync,storage,timers};
}
const KEY='discipline_os_state_v2', PENDING='discipline_os_pending_v1';
const prior='2026-10-16T10:00:00.000Z', uploaded='2026-10-17T10:00:00.000Z';
function addEarning(h,id='e1',amount=1000) {
  const s=h.getState(); s.amulet.ledger.push({id,type:'earn',habitId:'am_read',date:s.amulet.startedOn,at:uploaded,label:'Read',amountOre:amount}); h.persistState();
}
let count=0;
async function test(name,fn) { await fn();count++;console.log('PASS',name); }
(async()=>{
  await test('offline mutations persist pending marker and reload retains it',async()=>{
    const h=harness();h.setOnline(()=>false);addEarning(h);
    assert.equal(h.storage.get(PENDING),'1');assert.equal(h.runtime.hasLocalChanges,true);assert.equal(h.timers.size,0);
    const fresh=harness(Object.fromEntries(h.storage));assert.equal(fresh.runtime.hasLocalChanges,true);assert.equal(fresh.getState().amulet.ledger.length,1);
  });
  await test('local-only tab changes do not mark clean state dirty',async()=>{
    const h=harness();h.getState().activeTopTab='amulet';h.persistState({skipCloud:true});
    assert.equal(h.runtime.hasLocalChanges,false);assert.equal(h.storage.has(PENDING),false);
  });
  await test('successful unchanged upload clears dirty marker',async()=>{
    const h=harness();h.setOnline(()=>true);h.getState().cloud.lastSyncedAt=prior;addEarning(h);h.setRequest(async()=>({updatedAt:uploaded}));
    assert.equal(await h.pushToCloud(),true);assert.equal(h.runtime.hasLocalChanges,false);assert.equal(h.storage.has(PENDING),false);
  });
  await test('edit during upload stays pending and next snapshot carries both changes',async()=>{
    const h=harness();h.setOnline(()=>true);h.getState().cloud.lastSyncedAt=prior;addEarning(h);
    let complete;let snapshot;h.setRequest((_action,payload)=>{snapshot=payload.state;return new Promise(r=>{complete=r});});
    const push=h.pushToCloud();assert.equal(snapshot.amulet.ledger.length,1);addEarning(h,'e2',2000);complete({updatedAt:uploaded});await push;
    assert.equal(h.runtime.hasLocalChanges,true);assert.equal(h.storage.get(PENDING),'1');assert.equal(h.getState().amulet.ledger.length,2);
    h.setRequest(async(_action,payload)=>{assert.equal(payload.state.amulet.ledger.length,2);return{updatedAt:uploaded};});await h.pushToCloud();assert.equal(h.runtime.hasLocalChanges,false);
  });
  await test('local mutation during automatic pull prevents cloud replacement',async()=>{
    const h=harness();h.setOnline(()=>true);h.getState().cloud.lastSyncedAt=prior;
    const remote=JSON.parse(JSON.stringify(h.getState()));let complete;h.setRequest(()=>new Promise(r=>{complete=r}));
    const pull=h.pullFromCloud();addEarning(h);complete({state:remote,updatedAt:uploaded});
    assert.equal(await pull,false);assert.equal(h.getState().amulet.ledger.length,1);assert.equal(h.runtime.hasLocalChanges,true);
  });
  await test('first sync with existing cloud plus local changes requires explicit push',async()=>{
    const h=harness();h.setOnline(()=>true);addEarning(h);let pushes=0;const remote=JSON.parse(JSON.stringify(h.getState()));remote.amulet.ledger=[];
    h.setRequest(async(action)=>{if(action==='push')pushes++;return{state:remote,updatedAt:uploaded};});
    assert.equal(await h.bootstrapCloudSyncNow(),false);assert.equal(h.runtime.lastPullReason,'needs_manual_push');assert.equal(pushes,0);
    assert.equal(await h.pushToCloud({reason:'auto'}),false);assert.equal(pushes,0);assert.equal(h.runtime.hasLocalChanges,true);
  });
  await test('empty cloud first sync explicitly initializes and clears pending marker',async()=>{
    const h=harness();h.setOnline(()=>true);addEarning(h);const actions=[];
    h.setRequest(async(action)=>{actions.push(action);return action==='sync'?{state:null,updatedAt:''}:{updatedAt:uploaded};});
    assert.equal(await h.bootstrapCloudSyncNow(),true);assert.deepEqual(actions,['sync','push']);assert.equal(h.runtime.hasLocalChanges,false);
  });
  await test('manual confirmed pull replaces pending local data and clears marker',async()=>{
    const h=harness();h.setOnline(()=>true);h.getState().cloud.lastSyncedAt=prior;const remote=JSON.parse(JSON.stringify(h.getState()));addEarning(h);
    h.setRequest(async()=>({state:remote,updatedAt:uploaded}));assert.equal(await h.pullFromCloud({interactive:true,force:true}),true);
    assert.equal(h.getState().amulet.ledger.length,0);assert.equal(h.runtime.hasLocalChanges,false);assert.equal(h.storage.has(PENDING),false);
  });
  await test('failed upload keeps dirty marker and schedules a retry',async()=>{
    const h=harness();h.setOnline(()=>true);h.getState().cloud.lastSyncedAt=prior;addEarning(h);h.setRequest(async()=>{throw Error('offline')});
    assert.equal(await h.pushToCloud(),false);assert.equal(h.runtime.hasLocalChanges,true);assert.equal(h.storage.get(PENDING),'1');assert.ok([...h.timers.values()].some(t=>t.ms===15000));
  });
  await test('orphan pending marker without saved state is ignored',async()=>{
    assert.equal(harness({[PENDING]:'1'}).runtime.hasLocalChanges,false);
  });
  console.log(count+'/10 isolated sync regressions passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
