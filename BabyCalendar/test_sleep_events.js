// Sleep-logic regression tests against the actual BabyCalendar inline JavaScript.
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const html=fs.readFileSync(path.join(__dirname,'BabyCalendar.html'),'utf8');
const script=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
// The extract includes only the pure sleep processing helpers; all work is
// tested from the real HTML source so the tests can't diverge from the app.
const first=script.indexOf('      function formatDuration(');
const last=script.indexOf('      function countByType(',first);
assert(first>=0 && last>first);
const code=script.slice(first,last);
const context={Date, Math, Map, Set, Number, String, Array};
vm.createContext(context);
vm.runInContext(code,context);
const entry=(id,typeId,timestamp)=>({id,typeId,timestamp,notes:''});
const testData=[
  entry('start1','sleep-start','2026-10-28T23:15:00.000Z'),
  entry('feed','feeding','2026-10-28T23:30:00.000Z'),
  entry('end1','sleep-end','2026-10-29T01:00:00.000Z'),
  entry('start2','sleep-start','2026-10-29T03:10:00.000Z'),
  entry('end2','sleep-end','2026-10-29T04:00:00.000Z'),
  entry('legacy','sleep','2026-10-29T05:00:00.000Z')
];
let calc=context.analyzeSleepEntries(testData);
assert.equal(calc.completed.length,2);
assert.equal(calc.endDurations.get('end1'),105*60000,'midnight crossing');
assert.equal(calc.endDurations.get('end2'),50*60000);
assert.equal(calc.wakeGaps.length,1);
assert.equal(calc.wakeGaps[0].ms,130*60000);
assert.equal(context.formatDuration(105*60000),'1h 45m');
assert.equal(context.formatDuration(50*60000),'50m');
console.log('PASS: midnight-spanning sessions, durations, wake windows, legacy sleep unchanged');
calc=context.analyzeSleepEntries([
  entry('orphan','sleep-end','2026-10-29T08:00:00.000Z'),
  entry('one','sleep-start','2026-10-29T08:15:00.000Z'),
  entry('two','sleep-start','2026-10-29T08:30:00.000Z'),
  entry('finish','sleep-end','2026-10-29T09:00:00.000Z'),
  entry('orphan2','sleep-end','2026-10-29T09:30:00.000Z'),
  entry('open','sleep-start','2026-10-29T10:00:00.000Z')
]);
assert.equal(calc.completed.length,1);
assert.equal(calc.completed[0].startId,'two','latest Start takes precedence');
assert.equal(calc.endDurations.has('orphan'),false);
assert.equal(calc.endDurations.get('finish'),30*60000);
assert.equal(calc.activeStart.id,'open');
console.log('PASS: orphan end, repeated start, ongoing sleep');
let actual=JSON.parse(JSON.stringify(testData));
// Editing or deleting an event just recalculates from the new event list.
actual=actual.filter(e=>e.id!=='start1');
calc=context.analyzeSleepEntries(actual);
assert.equal(calc.completed.length,1);
assert.equal(calc.endDurations.has('end1'),false);
const csvHeader=['timestamp','event_type_id','label','emoji','notes'];
assert(html.includes('const header = '+JSON.stringify(csvHeader).replaceAll('"', '"')) ||
  /const header = \["timestamp", "event_type_id", "label", "emoji", "notes"\]/.test(html));
assert(html.includes('button class="btn btn--sm" id="exportButton"'));
assert(html.includes('button class="btn btn--sm" id="importButton"'));
console.log('PASS: recalculation after event deletion; original CSV export/import controls and schema intact');
// Fixed-clock summary: 24h totals must clip sessions crossing the window
// boundary and omit an unfinished session until an End is recorded.
class FixedDate extends Date { static now() { return Date.parse('2026-10-29T12:00:00.000Z'); } }
context.Date=FixedDate;
context.DAY_MS=86400000;
context.entries=[
  entry('s1','sleep-start','2026-10-28T11:00:00.000Z'),
  entry('e1','sleep-end', '2026-10-28T13:00:00.000Z'),
  entry('s2','sleep-start','2026-10-29T08:00:00.000Z'),
  entry('e2','sleep-end', '2026-10-29T10:00:00.000Z'),
  entry('s3','sleep-start','2026-10-29T11:00:00.000Z')
];
for(const key of ['statSleep24','statLastSleep','statWakeGap','statSleepState']) context[key]={textContent:''};
context.formatShortDate=(d)=>d;
context.updateSleepStats();
assert.equal(context.statSleep24.textContent,'3h 00m','completed sessions clipped to 24h window');
assert.equal(context.statLastSleep.textContent,'2h 00m');
assert.equal(context.statWakeGap.textContent,'10h 00m'); // average of 19h and 1h
assert.match(context.statSleepState.textContent,/Sleeping since/);
console.log('PASS: 24h boundary clipping, incomplete sessions excluded, wake-gap average');
