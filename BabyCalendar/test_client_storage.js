// JavaScript storage regression tests without browser/network dependencies.
// Runs BabyCalendar's actual inline script in a simulated DOM on Node 18+.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { once } = require('node:events');

const html = fs.readFileSync(path.join(__dirname, 'BabyCalendar.html'), 'utf8');
const code = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
class Element {
  constructor(tag = 'div') {
    this.tag = tag; this.children = []; this.listeners = {}; this.dataset = {};
    this.value = ''; this.hidden = false; this.style = {};
    this.classList = {toggle() {}, add() {}, remove() {}};
  }
  get textContent() { return this._textContent || ''; }
  set textContent(v) { this._textContent = v; this.children = []; }
  appendChild(c) { this.children.push(c); return c; }
  append(...nodes) { this.children.push(...nodes); }
  addEventListener(name, cb) { this.listeners[name] = cb; }
  reset() { this.value = ''; }
  setAttribute() {}
  focus() {}
  click() {}
  remove() {}
  closest() { return new Element(); }
  getContext() { return {}; }
}
const ids = ['eventForm','eventType','eventTime','eventNotes','saveEventButton','setNowButton',
 'cancelEditButton','eventTypeForm','typeLabel','typeEmoji','saveTypeButton',
 'cancelTypeEditButton','eventTypeList','exportButton','importButton','csvInput',
 'statusText','clearAllButton','babyChart','chartTooltip','selectedValue',
 'statCount','statFeeding','statPee','statPoo','statBusiest','statLatest',
 'storageDescription','storageFooter', 'statSleep24','statLastSleep','statWakeGap','statSleepState'];

function makeClient(base, localData = new Map(), fetchOverride = null) {
  const elems = Object.fromEntries(ids.map(id=>[id,new Element()]));
  const tbody=new Element();
  const ranges=['1d','3d','7d','14d','30d','90d','all'].map(range=>{
    const el=new Element();el.dataset.range=range;return el;
  });
  const dom = {
    getElementById(id) { assert(id in elems, 'missing '+id); return elems[id]; },
    querySelector(selector) {assert.equal(selector,'#historyTable tbody');return tbody;},
    querySelectorAll(selector) {assert.equal(selector,'.range-button');return ranges;},
    createElement(tag) {return new Element(tag);},
    body:new Element('body')
  };
  let exportedBlob=null;
  class MockURL extends URL {}
  MockURL.createObjectURL=(blob)=>{exportedBlob=blob;return 'blob:unit-test';};
  MockURL.revokeObjectURL=()=>{};
  const storage={
    getItem(k) {return localData.has(k)?localData.get(k):null;},
    setItem(k,v) {localData.set(k,String(v));}
  };
  const env={
    document:dom, localStorage:storage,
    window:{crypto:{randomUUID:crypto.randomUUID},location:{href:(base.startsWith("http")?base:"http://localhost")+"/ToolSuite/BabyCalendar.html"},confirm:()=>true,addEventListener(){}},
    fetch:fetchOverride || ((url,opts)=>fetch(base+url,opts)),
    requestAnimationFrame:()=>1,
    URL:MockURL,Blob,FileReader:class{},
    Intl, Date,Math,Number,String,JSON,Array,Map,Set,Object,
    console
  };
  vm.createContext(env);
  vm.runInContext(code, env, {filename:'BabyCalendar.html'});
  return {
    env,elems,tbody,localData,
    exportedBlob:()=>exportedBlob,
    async loaded() {
      for (let n=0;n<500;n++) {
        if(elems.storageDescription.textContent && !elems.storageDescription.textContent.includes('Checking')) return;
        await new Promise(r=>setTimeout(r,10));
      }
      throw new Error('client initialization timed out');
    },
    get(key) {return vm.runInContext(key,env);},
    async submit(text) {
      elems.eventNotes.value=text;
      await elems.eventForm.listeners.submit({preventDefault(){}});
      return elems.statusText.textContent;
    },
    async addType(name) {
      elems.typeLabel.value=name;elems.typeEmoji.value='🦊';
      await elems.eventTypeForm.listeners.submit({preventDefault(){}});
      return elems.statusText.textContent;
    }
  };
}
async function main() {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'baby-client-test-'));
  const appdir=path.join(temp,'ToolSuite');fs.mkdirSync(appdir);
  fs.copyFileSync(path.join(__dirname,'BabyCalendar.html'),path.join(appdir,'BabyCalendar.html'));
  const port=25000+Math.floor(Math.random()*15000);
  const child=cp.spawn(process.execPath,[path.join(__dirname,'server.js')],{
    env:{...process.env,PORT:String(port),WEB_ROOT:temp},
    stdio:['ignore','pipe','pipe']
  });
  try {
    let started=false;
    for(let i=0;i<150;i++) {
      if(child.exitCode!==null)throw new Error('server failed to start');
      try {if((await fetch(`http://127.0.0.1:${port}/healthz`)).ok){started=true;break;}}catch{}
      await new Promise(r=>setTimeout(r,30));
    }
    assert(started,'server ready');
    const base=`http://127.0.0.1:${port}`;
    // The original localStorage content is imported exactly once.
    const firstCache=new Map();
    firstCache.set('toolsuite.babyCalendar.entries.v1',JSON.stringify([
      {id:'legacy-1',timestamp:'2026-10-29T16:00:00.000Z',typeId:'feeding',notes:'legacy 3 oz'}
    ]));
    const first=makeClient(base,firstCache);
    await first.loaded();
    assert.equal(first.get('storageMode'),'server');
    assert.equal(first.get('entries.length'),1);
    assert.match(first.elems.statusText.textContent,/Migrated 1 browser events/);
    assert.equal((await(await fetch(base+'/ToolSuite/api/storage/baby-calendar')).json()).data.entries.length,1);
    assert.equal(await first.submit('new 4 oz'),'Saved event.');
    const other=makeClient(base);
    await other.loaded();
    assert.equal(other.get('entries.length'),2,'new device can read data');
    assert.equal(await first.addType('Bath'),'Added event type.');
    assert.match(await other.submit('conflict from second device'),/changed in another browser/);
    assert.equal(other.get('entries.length'),2,'latest server copy refreshed after conflict');
    assert.equal(await other.submit('second device 5 oz'),'Saved event.');
    assert.equal(first.get('entries.length'),2);
    assert.equal((await(await fetch(base+'/ToolSuite/api/storage/baby-calendar')).json()).data.entries.length,3);
    console.log('PASS: browser-data migration, cross-device persistence, conflicts and retries');
    // Server v1 migration must add the two types without touching legacy events.
    const serverEndpoint=base+'/ToolSuite/api/storage/baby-calendar';
    const previous=await(await fetch(serverEndpoint)).json();
    const oldTypes=[
      {id:'feeding',label:'Feeding',emoji:'🍼'},
      {id:'sleep',label:'Sleep',emoji:'😴'},
      {id:'poo',label:'Poo',emoji:'💩'}
    ];
    const oldEvents=[{id:'existing-sleep',typeId:'sleep',timestamp:'2026-10-28T21:30:00.000Z',notes:'legacy sleep remains'}];
    const setOld=await fetch(serverEndpoint,{
      method:'PUT',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({revision:previous.revision,data:{version:1,eventTypes:oldTypes,entries:oldEvents}})
    });
    assert(setOld.ok,'seed old server version for upgrade regression');
    const upgraded=makeClient(base);
    await upgraded.loaded();
    assert.equal(upgraded.get('entries.length'),1,'legacy record retained');
    assert.equal(upgraded.get('entries[0].typeId'),'sleep');
    assert(upgraded.get('eventTypes.some(t => t.id === "sleep-start")'));
    assert(upgraded.get('eventTypes.some(t => t.id === "sleep-end")'));
    const afterUpgrade=await(await fetch(serverEndpoint)).json();
    assert.equal(afterUpgrade.data.version,2,'v1 was upgraded to v2');
    assert.equal(afterUpgrade.data.entries[0].id,'existing-sleep');
    assert.equal(afterUpgrade.data.eventTypes.filter(t=>t.id.startsWith('sleep-')).length,2);
    console.log('PASS: server v1 migration adds sleep events without altering existing sleep records');
    // Use the actual form handlers to create a sleep session; its duration is
    // derived for display and does not alter the on-disk record schema.
    upgraded.elems.eventType.value='sleep-start';
    upgraded.elems.eventTime.value='2026-10-29T07:15';
    assert.equal(await upgraded.submit('settled quickly'),'Saved event.');
    upgraded.elems.eventType.value='sleep-end';
    upgraded.elems.eventTime.value='2026-10-29T09:00';
    assert.equal(await upgraded.submit('woke happy'),'Saved event.');
    const sleep=upgraded.get('analyzeSleepEntries()');
    assert.equal(sleep.completed.length,1);
    assert.equal(sleep.completed[0].ms,105*60000);
    upgraded.get('updateSleepStats()');
    assert.equal(upgraded.elems.statLastSleep.textContent,'1h 45m');
    assert(upgraded.tbody.children.some(row=>row.children.some(c=>c.textContent.includes('Sleep duration: 1h 45m'))));
    upgraded.elems.exportButton.listeners.click();
    const csv=await upgraded.exportedBlob().text();
    assert(csv.startsWith('timestamp,event_type_id,label,emoji,notes'));
    assert(csv.includes(',sleep-start,') && csv.includes(',sleep-end,'));
    assert(csv.includes('settled quickly') && csv.includes('woke happy'));
    // An unmodified CSV import reproduces the two source events and the
    // duration will recompute from the source timestamps.
    const importedCsv=makeClient('not-used',new Map(),async()=>({status:404,ok:false}));
    await importedCsv.loaded();
    importedCsv.env.importData=csv;
    const imported=importedCsv.get('importCsvText(importData)');
    assert.equal(imported.imported,3,'one legacy event + two sleep events imported');
    assert.equal(importedCsv.get('analyzeSleepEntries().completed[0].ms'),105*60000);
    console.log('PASS: actual UI event creation, sleep duration, CSV export and import roundtrip');
    // The same two new event types are added to old browser-only caches once.
    const oldBrowserData=new Map([
      ['toolsuite.babyCalendar.types.v1',JSON.stringify(oldTypes)],
      ['toolsuite.babyCalendar.entries.v1',JSON.stringify(oldEvents)]
    ]);
    const legacyBrowser=makeClient('not-used',oldBrowserData,async()=>({status:404,ok:false}));
    await legacyBrowser.loaded();
    assert(legacyBrowser.get('eventTypes.some(t=>t.id === "sleep-start")'));
    assert(legacyBrowser.get('eventTypes.some(t=>t.id === "sleep-end")'));
    assert.equal(legacyBrowser.get('entries.length'),1);
    assert.equal(oldBrowserData.get('toolsuite.babyCalendar.sleepTypes.v2'),'1');
    // Migration marker must allow a user to delete an event type intentionally.
    legacyBrowser.get('eventTypes.splice(eventTypes.findIndex(t=>t.id === "sleep-start"),1)');
    oldBrowserData.set('toolsuite.babyCalendar.types.v1',JSON.stringify(legacyBrowser.get('eventTypes')));
    const legacyReload=makeClient('not-used',oldBrowserData,async()=>({status:404,ok:false}));
    await legacyReload.loaded();
    assert.equal(legacyReload.get('eventTypes.some(t=>t.id === "sleep-start")'),false);
    console.log('PASS: browser-only legacy data is upgraded once, without resurrecting deleted event types');
    // Static host fallback (API missing), original localStorage keys unchanged.
    const cached=new Map();
    const fallback=makeClient('not-used',cached,async()=>({status:404,ok:false}));
    await fallback.loaded();
    assert.equal(fallback.get('storageMode'),'browser');
    assert.equal(await fallback.submit('browser event'),'Saved event.');
    assert.equal(JSON.parse(cached.get('toolsuite.babyCalendar.entries.v1'))[0].notes,'browser event');
    console.log('PASS: plain static-host localStorage fallback');
    // Existing API that fails must not silently mutate local-only data.
    const broken=makeClient('not-used',new Map(),async()=>({status:500,ok:false}));
    await broken.loaded();
    assert.equal(broken.get('storageMode'),'error');
    assert.match(await broken.submit('do not save'),/Storage is still busy or unavailable/);
    console.log('PASS: server error blocks accidental browser divergence');
  } finally {
    child.kill('SIGTERM');
    if(child.exitCode===null) await once(child,'exit');
    fs.rmSync(temp,{force:true,recursive:true});
  }
}
main().catch(err=>{console.error(err);process.exitCode=1});
