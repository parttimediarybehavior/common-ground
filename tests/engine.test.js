import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld, advance, stepWorld, cloneWorld, applyIntervention, findPath} from '../engine.js';

// Catches lost transfers, resources created by sharing, unrecorded deaths/consumption.
function checkAccounting(w) {
  const food = w.cells.reduce((n,c)=>n+(c.resource==='food'?c.stock:0),0)
    + w.agents.reduce((n,a)=>n+a.food,0) + w.settlements.reduce((n,s)=>n+s.food,0);
  const wood = w.cells.reduce((n,c)=>n+(c.resource==='wood'?c.stock:0),0)
    + w.agents.reduce((n,a)=>n+a.wood,0);
  assert.ok(Math.abs(food + w.ledger.consumed + w.ledger.lost - w.ledger.initialFood - w.ledger.produced)<1e-7);
  assert.ok(Math.abs(wood + w.ledger.woodUsed - w.ledger.initialWood - w.ledger.woodProduced)<1e-7);
  for (const a of w.agents) { assert.ok(a.food>=0); assert.ok(a.wood>=0); }
  for (const c of w.cells) { assert.ok(c.stock>=0); assert.ok(c.stock<=c.capacity+1e-9); }
}

test('initial world has inhabitants and independently balanced food and wood',()=>{
  const w=createWorld(42); assert.ok(w.agents.length>=12); checkAccounting(w);
});

// Catches nondeterminism/Date.now and clone sharing mutable state.
test('replay repeats exactly and a cloned experiment cannot change its baseline',()=>{
  const a=createWorld(73), b=createWorld(73); advance(a,90); advance(b,90);
  assert.deepEqual(a,b);
  const branch=cloneWorld(a); applyIntervention(branch,'bridge');
  assert.equal(a.bridge.open,true); assert.equal(branch.bridge.open,false);
});

// Catches paths jumping over water or cutting through a closed bridge.
test('closed bridge disconnects banks and an open bridge connects them with adjacent steps',()=>{
  const w={width:4,height:3,bridge:{x:1,y:1,open:false},cells:[]};
  for(let y=0;y<3;y++)for(let x=0;x<4;x++)w.cells.push({x,y,terrain:x===1||x===2?'water':'land'});
  assert.equal(findPath(w,{x:0,y:1},{x:3,y:1}),null);
  w.bridge.open=true;
  assert.deepEqual(findPath(w,{x:0,y:1},{x:3,y:1}),[{x:1,y:1},{x:2,y:1},{x:3,y:1}]);
});

test('food and wood remain conserved through scarcity, donations, deaths and bridge repairs',()=>{
  const w=createWorld(19); applyIntervention(w,'bridge'); applyIntervention(w,'drought');
  for(let day=0;day<220;day++) {stepWorld(w);checkAccounting(w);}
  assert.ok(w.events.some(e=>e.type==='repair'));
  for(const a of w.agents) for(const m of a.memories) assert.ok(w.events.some(e=>e.id===m.eventId));
});

// Catches secretly ignoring the intervention or fabricating bridge repairs without material.
test('disruption is recorded and recovery consumes the required construction material',()=>{
  const w=createWorld(5); applyIntervention(w,'bridge');
  assert.equal(w.bridge.open,false); assert.ok(w.events.some(e=>e.type==='intervention'));
  const used=w.ledger.woodUsed; advance(w,160);
  assert.equal(w.bridge.open,true); assert.ok(w.ledger.woodUsed-used>=18);
});

test('forgetting removes remembered help and preserves physical resource balances',()=>{
  const w=createWorld(42);w.agents[0].helped={'1':3};
  const before=w.agents.map(a=>[a.food,a.wood]);applyIntervention(w,'forget');
  assert.deepEqual(w.agents[0].helped,{});assert.equal(w.options.memory,false);
  assert.deepEqual(w.agents.map(a=>[a.food,a.wood]),before);checkAccounting(w);
});

test('unrecognized interventions reject without changing the world',()=>{
  const w=createWorld(42), before=cloneWorld(w);
  assert.throws(()=>applyIntervention(w,'invent-food'));assert.deepEqual(w,before);
});

// Catches limitless private hoarding that removes the cost of carrying food.
test('gatherers cannot carry more than fourteen meals and excess remains in the grove',()=>{
  const w=createWorld(7);
  for(let i=0;i<100;i++){stepWorld(w);for(const a of w.agents)assert.ok(a.food<=14+1e-9);checkAccounting(w);}
});

// Catches a broken crossing causing endless walks toward an unreachable pantry.
test('an inhabitant cut off from its home pantry gathers reachable food instead',()=>{
  const w=createWorld(42);applyIntervention(w,'bridge');
  const a=w.agents[0];w.agents=[a];Object.assign(a,{x:15,y:8,food:1});
  stepWorld(w);assert.equal(a.action,'Foraging');
});

// Catches destination thrashing: the old planner reversed each day without arriving.
test('a viable gathering trip retains its destination until arrival',()=>{
  const w=createWorld(42);const a=w.agents[0];w.agents=[a];
  Object.assign(a,{x:9,y:8,food:3,action:'Foraging',target:{x:15,y:8}});
  for(const c of w.cells){c.resource=null;c.stock=0;c.capacity=0;}
  Object.assign(w.cells[8*24+15],{resource:'food',stock:24,capacity:24});
  Object.assign(w.cells[8*24+8],{resource:'food',stock:24,capacity:24});
  stepWorld(w);assert.deepEqual(a.target,{x:15,y:8});assert.equal(a.x,11);
});

// Catches pantry priority sending a hungry person past a nearer full meal.
test('a hungry inhabitant prefers nearby food to a more distant home pantry',()=>{
  const w=createWorld(42),a=w.agents[1];w.agents=[a];
  Object.assign(a,{x:15,y:8,food:1});stepWorld(w);
  assert.equal(a.action,'Foraging');
});
