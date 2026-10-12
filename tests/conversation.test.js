import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advance,cloneWorld,applyIntervention,summarize} from '../engine.js';

// Catches ignoring the scheduled, single transmission block or blocking unrelated conversations.
test('withholding one report changes Orins route and next harvest without changing earlier physical state',()=>{
 const baseline=createWorld(19);advance(baseline,25);applyIntervention(baseline,'drought');applyIntervention(baseline,'reports');
 const experiment=cloneWorld(baseline);applyIntervention(experiment,'block-report',{day:30,actor:4,target:14});
 advance(baseline,4);advance(experiment,4);
 const physical=w=>w.agents.map(a=>[a.x,a.y,a.food,a.wood,a.health,a.alive]);
 assert.deepEqual(physical(baseline),physical(experiment));
 advance(baseline,3);advance(experiment,3);
 const harvest=w=>w.events.find(e=>e.day===32&&e.type==='gather'&&e.actor===14);
 assert.ok(Math.abs(harvest(baseline).evidence.amount-5.311118507)<1e-8);
 assert.ok(Math.abs(harvest(experiment).evidence.amount-.751892490)<1e-8);
 assert.equal(experiment.events.filter(e=>e.type==='report-blocked').length,1);
 assert.equal(experiment.events.filter(e=>e.day===30&&e.type==='report'&&e.actor===4&&e.target===14).length,0);
 for(const w of[baseline,experiment]){assert.ok(Math.abs(summarize(w).foodBalanceError)<1e-7);assert.ok(Math.abs(summarize(w).woodBalanceError)<1e-7);}
});

test('invalid scheduled conversations reject without changing the world',()=>{
 for(const block of[{day:0,actor:4,target:14},{day:30,actor:4,target:4},{day:30,actor:999,target:14}]){
  const w=createWorld(19),before=cloneWorld(w);assert.throws(()=>applyIntervention(w,'block-report',block));assert.deepEqual(w,before);
 }
});
