import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advance,cloneWorld,applyIntervention,summarize} from '../engine.js';

const crisis=day=>{const w=createWorld(42);advance(w,25);applyIntervention(w,'drought');applyIntervention(w,'bridge');advance(w,day-25);return w;};
const balanced=w=>{const s=summarize(w);assert.ok(Math.abs(s.foodBalanceError)<1e-7);assert.ok(Math.abs(s.woodBalanceError)<1e-7);};

// Omitting labor must not discard the worker's material or invent a different repair.
test('one omitted repair retains timber and delays the crossing by one day',()=>{
 const base=crisis(37),fork=cloneWorld(base);
 assert.equal(base.bridge.repair,15);assert.equal(base.agents[10].wood,3);
 applyIntervention(fork,'skip-repair',{day:38,actor:10});
 advance(base,1);advance(fork,1);
 assert.equal(base.bridge.open,true);assert.equal(fork.bridge.open,false);
 assert.equal(fork.agents[10].wood,3);assert.equal(fork.bridge.repair,15);
 assert.equal(fork.events.filter(e=>e.type==='repair-omitted').length,1);
 advance(fork,1);assert.equal(fork.bridge.open,true);
 assert.equal(fork.events.find(e=>e.type==='bridge-open').day,39);balanced(base);balanced(fork);
});

// Clearing one gratitude association must leave inventory and everyone else's memory intact.
test('forgetting one helper changes the gift while preserving physical starting conditions',()=>{
 const base=crisis(54),fork=cloneWorld(base),before=fork.agents.map(a=>[a.food,a.wood,a.x,a.y,a.health]);
 const otherMemories=base.agents.filter(a=>a.id!==8).map(a=>[a.helped,a.memories]);
 applyIntervention(fork,'forget-helper',{actor:8,helper:0});
 assert.deepEqual(fork.agents.map(a=>[a.food,a.wood,a.x,a.y,a.health]),before);
 assert.deepEqual(fork.agents.filter(a=>a.id!==8).map(a=>[a.helped,a.memories]),otherMemories);
 advance(base,1);advance(fork,1);
 assert.ok(Math.abs(base.agents[0].food-4)<1e-8);assert.ok(Math.abs(fork.agents[0].food-1.2)<1e-8);
 assert.deepEqual([base.agents[0].x,base.agents[0].y],[15,4]);assert.deepEqual([fork.agents[0].x,fork.agents[0].y],[15,4]);
 assert.equal(fork.events.filter(e=>e.day===55&&e.type==='gift'&&e.actor===8&&e.target===0).length,0);
 balanced(base);balanced(fork);
});

test('invalid causal controls reject before mutating the world',()=>{
 for(const [type,details] of [['skip-repair',{day:0,actor:10}],['skip-repair',{day:38,actor:99}],['forget-helper',{actor:8,helper:8}],['forget-helper',{actor:8,helper:99}]]){
  const w=createWorld(42),before=cloneWorld(w);assert.throws(()=>applyIntervention(w,type,details));assert.deepEqual(w,before);
 }
});

test('omitting a gift retains its food and workday, unlike replacing sharing with gathering',()=>{
 const base=crisis(54),omitted=cloneWorld(base),forgotten=cloneWorld(base);
 applyIntervention(omitted,'skip-gift',{day:55,actor:8,target:0});
 applyIntervention(forgotten,'forget-helper',{actor:8,helper:0});
 assert.deepEqual(omitted.agents,base.agents);
 advance(base,1);advance(omitted,1);advance(forgotten,1);
 const gift=w=>w.events.filter(e=>e.day===55&&e.type==='gift'&&e.actor===8&&e.target===0);
 assert.equal(gift(base).length,1);assert.equal(gift(omitted).length,0);
 assert.ok(Math.abs(omitted.agents[8].food-(6.5934334424688785-.9))<1e-8);
 assert.ok(Math.abs(omitted.agents[0].food-1.2)<1e-8);
 assert.equal(omitted.events.filter(e=>e.day===55&&e.type==='gather'&&e.actor===8).length,0);
 const harvest=w=>w.events.find(e=>e.day===55&&e.type==='gather'&&e.actor===12).evidence.amount;
 assert.ok(Math.abs(harvest(omitted)-6.378926289081574)<1e-8);
 assert.ok(Math.abs(harvest(forgotten)-1.01978531359397)<1e-8);
 assert.equal(omitted.events.filter(e=>e.type==='gift-omitted').length,1);
 for(const w of[base,omitted,forgotten])advance(w,1);
 const later=w=>w.events.some(e=>e.day===56&&e.type==='gift'&&e.actor===12&&e.target===8);
 assert.equal(later(base),true);assert.equal(later(omitted),true);assert.equal(later(forgotten),false);
 for(const w of[base,omitted,forgotten])balanced(w);
});

test('invalid or duplicate gift schedules reject without changing anything',()=>{
 for(const details of [{day:0,actor:8,target:0},{day:55,actor:8,target:8},{day:55,actor:99,target:0},{day:55,actor:8,target:99},{day:1001,actor:8,target:0}]){
  const w=crisis(54),before=cloneWorld(w);assert.throws(()=>applyIntervention(w,'skip-gift',details));assert.deepEqual(w,before);
 }
 const w=crisis(54);applyIntervention(w,'skip-gift',{day:55,actor:8,target:0});const before=cloneWorld(w);
 assert.throws(()=>applyIntervention(w,'skip-gift',{day:55,actor:8,target:0}));assert.deepEqual(w,before);
});

test('copied before-action snapshots expose ordered eligibility without changing replay',()=>{
 const w=crisis(54),plain=cloneWorld(w),frames=[];
 advance(w,2,frame=>frames.push(frame));advance(plain,2);
 assert.deepEqual(w,plain);assert.equal(frames.length,32);
 const choice=frames.find(f=>f.day===56&&f.actor===12);
 assert.equal(choice.phase,'before-action');
 assert.ok(Math.abs(choice.agents.find(a=>a.id===8).food-1.9934334424688784)<1e-8);
 assert.ok(choice.agents.find(a=>a.id===12).food>4.8);
 const mutated=crisis(54),reference=cloneWorld(mutated);
 advance(mutated,1,frame=>{frame.agents[0].food=-100;frame.cells[0].stock=-100;});advance(reference,1);
 assert.deepEqual(mutated,reference);
 const before=cloneWorld(reference);assert.throws(()=>advance(reference,1,'invalid observer'));assert.deepEqual(reference,before);
});
