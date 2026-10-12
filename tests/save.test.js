import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, advance, applyIntervention, cloneWorld } from '../engine.js';
import { validateWorld, validateComparison } from '../save.js';
const saved = () => { const baseline=createWorld(42),experiment=createWorld(42);advance(baseline,80);applyIntervention(experiment,'bridge');applyIntervention(experiment,'drought');advance(experiment,80);return {format:'common-ground-comparison',version:1,baseline,experiment}; };
test('valid saved comparison resumes the same deterministic future',()=>{const data=saved();validateComparison(data);const loaded=JSON.parse(JSON.stringify(data));validateComparison(loaded);advance(loaded.experiment,20);advance(data.experiment,20);assert.deepEqual(loaded.experiment,data.experiment);});
test('rejects invalid physical state and missing decision fields',()=>{const invalid=[w=>delete w.agents[0].gatherRate,w=>w.agents[0].gatherRate=NaN,w=>w.agents[0].willingness=2,w=>w.agents[0].missedMeals=-1,w=>w.agents[0].health=101,w=>w.agents[0].food=-1,w=>w.agents[0].alive=false,w=>w.day=-1,w=>w.day=1.5,w=>w.cells.reverse(),w=>w.settlements.reverse(),w=>w.cells.find(c=>c.resource==='food').stock=25,w=>w.bridge.repair=19,w=>w.options.travelSteps=9,w=>w.agents[0].helped={'1':'a lot'}];for(const mutate of invalid){const world=createWorld(42);mutate(world);assert.throws(()=>validateWorld(world));}});
test('rejects broken event provenance and unsafe evidence values',()=>{const invalid=[w=>w.events[0].id=9,w=>w.events[0].day=1,w=>w.events[0].actor=999,w=>w.events[0].evidence={amount:NaN},w=>w.agents[0].memories=[{day:0,eventId:999,text:'Invented help'}],w=>w.agents[0].memories=[{day:0,eventId:1,text:'Invented help'}]];for(const mutate of invalid){const world=createWorld(42);mutate(world);assert.throws(()=>validateWorld(world));}});
test('rejects changed ledgers and unmatched comparisons without mutation',()=>{const data=saved(),before=cloneWorld(data.baseline);data.experiment.day++;assert.throws(()=>validateComparison(data));assert.deepEqual(data.baseline,before);const w=createWorld(42);w.ledger.initialFood++;assert.throws(()=>validateWorld(w));});
test('knowledge modes round-trip with dated observations and shared reports',()=>{for(const mode of ['oracle','local','reports']){const w=createWorld(5,{knowledge:mode});applyIntervention(w,'drought');advance(w,35);const loaded=JSON.parse(JSON.stringify(w));validateWorld(loaded);advance(w,10);advance(loaded,10);assert.deepEqual(loaded,w);}});
test('rejects missing, malformed, or future knowledge and statistics',()=>{const invalid=[
 w=>delete w.options.knowledge,w=>w.options.knowledge='telepathy',w=>delete w.statistics,
 w=>delete w.statistics.travel,w=>w.statistics.foodGathered=Infinity,w=>w.statistics.emptyArrivals=-1,
 w=>w.statistics.reports=.5,w=>w.statistics.harvests=NaN,w=>w.statistics.travel=1,
 w=>delete w.agents[0].known,w=>delete w.agents[0].seen,
 w=>{const k=Object.keys(w.agents[0].known)[0];w.agents[0].known[k].stock=Infinity;},
 w=>{const k=Object.keys(w.agents[0].known)[0];w.agents[0].known[k].stock=-1;},
 w=>{const k=Object.keys(w.agents[0].known)[0];w.agents[0].known[k].stock=999;},
 w=>{const k=Object.keys(w.agents[0].known)[0];w.agents[0].known[k].seenAt=1;},
 w=>{const k=Object.keys(w.agents[0].known)[0];w.agents[0].known[k].source=999;},
 w=>{const k=Object.keys(w.agents[0].known)[0];w.agents[0].known[k].via=999;},
 w=>{const k=Object.keys(w.agents[0].known)[0];delete w.agents[0].known[k].source;},
 w=>{const k=Object.keys(w.agents[0].known)[0];w.agents[0].known[k].x=0;w.agents[0].known[k].y=0;},
 w=>{const k=Object.keys(w.agents[0].known)[0];w.agents[0].known[0]=w.agents[0].known[k];},
 w=>w.agents[0].seen[0]=1,w=>w.agents[0].seen[999]=0,w=>w.statistics.reports=1,
];for(const mutate of invalid){const w=createWorld(5);mutate(w);assert.throws(()=>validateWorld(w));}});
test('rejects missing and invalid same-day observation sequence fields',()=>{
 const invalid=[
  w=>delete w.statistics.observations,
  w=>w.statistics.observations=-1,
  w=>w.statistics.observations=Infinity,
  w=>w.statistics.observations=.5,
  w=>w.statistics.observations=0,
  w=>{const k=Object.keys(w.agents[0].known)[0];delete w.agents[0].known[k].order;},
  w=>{const k=Object.keys(w.agents[0].known)[0];w.agents[0].known[k].order=0;},
  w=>{const k=Object.keys(w.agents[0].known)[0];w.agents[0].known[k].order=NaN;},
  w=>{const k=Object.keys(w.agents[0].known)[0];w.agents[0].known[k].order=1.5;},
  w=>{const k=Object.keys(w.agents[0].known)[0];w.agents[0].known[k].order=w.statistics.observations+1;},
 ];for(const mutate of invalid){const w=createWorld(5);mutate(w);assert.throws(()=>validateWorld(w));}
});
test('scheduled conversation survives save/load before withholding without changing replay',()=>{
 const baseline=createWorld(19);advance(baseline,25);applyIntervention(baseline,'drought');applyIntervention(baseline,'reports');
 const experiment=cloneWorld(baseline);applyIntervention(experiment,'block-report',{day:30,actor:4,target:14});
 const loaded=JSON.parse(JSON.stringify(experiment));validateWorld(loaded);
 advance(experiment,7);advance(loaded,7);validateWorld(loaded);assert.deepEqual(loaded,experiment);
 assert.equal(loaded.events.filter(e=>e.type==='report-blocked').length,1);
});
test('rejects missing or altered conversation schedules and unmatched blocked events',()=>{
 const invalid=[w=>delete w.blockedReports,w=>w.blockedReports={},
 w=>w.blockedReports[0].day=1001,w=>w.blockedReports[0].day=0,w=>w.blockedReports[0].day=30.5,
 w=>w.blockedReports[0].actor=999,w=>w.blockedReports[0].target=4,
 w=>w.blockedReports.push({...w.blockedReports[0]}),w=>w.blockedReports[0].day=31,
 w=>w.blockedReports=[],w=>w.events.find(e=>e.evidence.intervention==='block-report').evidence.actor=5];
 for(const mutate of invalid){const w=createWorld(19);applyIntervention(w,'block-report',{day:30,actor:4,target:14});mutate(w);assert.throws(()=>validateWorld(w));}
 const w=createWorld(19);advance(w,25);applyIntervention(w,'drought');applyIntervention(w,'reports');applyIntervention(w,'block-report',{day:30,actor:4,target:14});advance(w,7);
 w.events.find(e=>e.type==='report-blocked').target=13;assert.throws(()=>validateWorld(w));
});
test('maximum-horizon comparison saves and reloads under the shared byte limit',async()=>{
 const {serializeComparison,MAX_SAVE_BYTES}=await import('../save.js');
 assert.equal(typeof serializeComparison,'function');
 const baseline=createWorld(19);advance(baseline,25);applyIntervention(baseline,'drought');applyIntervention(baseline,'reports');
 const experiment=cloneWorld(baseline);applyIntervention(experiment,'block-report',{day:30,actor:4,target:14});
 advance(baseline,975);advance(experiment,975);
 const data={format:'common-ground-comparison',version:1,scenario:'one-conversation',baseline,experiment};
 const serialized=serializeComparison(data),bytes=new TextEncoder().encode(serialized).byteLength;
 assert.ok(bytes>20*1024*1024,'fixture must exceed the former importer limit');
 assert.ok(bytes<=MAX_SAVE_BYTES);
 const loaded=JSON.parse(serialized);validateComparison(loaded);
 assert.equal(loaded.baseline.day,1000);assert.equal(loaded.experiment.day,1000);
 assert.deepEqual(loaded.experiment.blockedReports,experiment.blockedReports);
 assert.deepEqual(loaded.experiment.statistics,experiment.statistics);
 assert.deepEqual(loaded.experiment.agents,experiment.agents);
 assert.equal(loaded.experiment.events.length,experiment.events.length);
});

test('repair omissions and helper-memory reconstructions survive save/replay',()=>{
 const base=createWorld(42);advance(base,25);applyIntervention(base,'drought');applyIntervention(base,'bridge');advance(base,12);
 applyIntervention(base,'skip-repair',{day:38,actor:10});const loaded=JSON.parse(JSON.stringify(base));validateWorld(loaded);
 advance(base,2);advance(loaded,2);assert.deepEqual(loaded,base);
 const memory=createWorld(42);advance(memory,25);applyIntervention(memory,'drought');applyIntervention(memory,'bridge');advance(memory,29);
 applyIntervention(memory,'forget-helper',{actor:8,helper:0});validateWorld(memory);
 const copy=JSON.parse(JSON.stringify(memory));advance(memory,1);advance(copy,1);assert.deepEqual(copy,memory);
});

test('altered omitted-repair schedules cannot silently change a saved reconstruction',()=>{
 for(const mutate of [w=>w.omittedRepairs[0].actor=99,w=>w.omittedRepairs[0].day=39,w=>w.omittedRepairs.push({...w.omittedRepairs[0]}),w=>w.omittedRepairs=null,w=>w.omittedRepairs=[]]){
  const w=createWorld(42);applyIntervention(w,'skip-repair',{day:38,actor:10});mutate(w);assert.throws(()=>validateWorld(w));
 }
});

test('gift omission round-trips and preserves its selective workday replay',()=>{
 const w=createWorld(42);advance(w,25);applyIntervention(w,'drought');applyIntervention(w,'bridge');advance(w,29);
 applyIntervention(w,'skip-gift',{day:55,actor:8,target:0});validateWorld(w);
 const loaded=JSON.parse(JSON.stringify(w));advance(w,2);advance(loaded,2);validateWorld(loaded);assert.deepEqual(loaded,w);
 assert.equal(loaded.events.filter(e=>e.type==='gift-omitted').length,1);
 assert.equal(loaded.events.filter(e=>e.type==='gift'&&e.day===56&&e.actor===12&&e.target===8).length,1);
});

test('gift schedules and actual omissions must retain matching provenance',()=>{
 const starting=()=>{const w=createWorld(42);advance(w,25);applyIntervention(w,'drought');applyIntervention(w,'bridge');advance(w,29);applyIntervention(w,'skip-gift',{day:55,actor:8,target:0});return w;};
 for(const mutate of [w=>w.omittedGifts[0].target=8,w=>w.omittedGifts[0].day=56,w=>w.omittedGifts=[],w=>w.omittedGifts=null,w=>w.omittedGifts.push({...w.omittedGifts[0]})]){
  const w=starting();mutate(w);assert.throws(()=>validateWorld(w));
 }
 const w=starting();advance(w,1);w.events.find(e=>e.type==='gift-omitted').target=1;assert.throws(()=>validateWorld(w));
});
