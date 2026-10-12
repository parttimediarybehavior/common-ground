import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,stepWorld,advance,applyIntervention,cloneWorld} from '../engine.js';

// Catches resource knowledge being silently global in a local-observation world.
test('local observers start without knowledge of distant food patches',()=>{
  const w=createWorld(42,{knowledge:'local'}),a=w.agents[0];
  assert.ok(a.known&&Object.values(a.known).every(p=>Math.abs(p.x-a.x)+Math.abs(p.y-a.y)<=2));
  assert.ok(!a.known[3*24+20]);
});

// Catches reporting through arbitrary distances or never transferring observations.
test('nearby reports transfer a dated observation with its original source',()=>{
  const w=createWorld(42,{knowledge:'reports'}),a=w.agents[0],b=w.agents[1];w.agents=[a,b];
  Object.assign(a,{x:4,y:8,food:10});Object.assign(b,{x:5,y:8,food:10});
  a.known={[75]:{x:3,y:3,resource:'food',stock:18,seenAt:0,source:0,via:null}};b.known={};
  stepWorld(w);assert.equal(b.known[75].source,0);assert.equal(b.known[75].via,0);
  assert.equal(b.known[75].seenAt,0);assert.ok(w.events.some(e=>e.type==='report'&&e.target===1));
});

test('local-only mode does not silently exchange reports',()=>{
  const w=createWorld(42,{knowledge:'local'});advance(w,20);
  assert.equal(w.events.filter(e=>e.type==='report').length,0);
});

// Catches forbidding local observers to notice a visibly depleted nearby patch.
test('a local observer checks a visible patch again before acting',()=>{
  const w=createWorld(42,{knowledge:'local'}),a=w.agents[0],b=w.agents[1];w.agents=[a,b];
  for(const person of [a,b])Object.assign(person,{x:3,y:3,food:2.5,known:{},seen:{}});
  w.cells[75].stock=.8;applyIntervention(w,'drought');stepWorld(w);
  assert.equal(w.events.filter(e=>e.type==='empty-arrival').length,0);
});

// Catches silently seeing actual stocks beyond the declared two-cell radius.
test('an unseen patch is approached using an old observation rather than hidden current stock',()=>{
  const w=createWorld(42,{knowledge:'local'}),a=w.agents[0];w.agents=[a];
  Object.assign(a,{x:6,y:3,food:4,action:'Foraging',target:{x:3,y:3},known:{75:{x:3,y:3,resource:'food',stock:18,seenAt:0,order:1,source:0,via:null}}});
  w.cells[75].stock=0;applyIntervention(w,'drought');stepWorld(w);
  assert.deepEqual(a.target,{x:3,y:3});assert.equal(a.x,4);
  assert.ok(a.known[75].stock===18);
});

test('knowledge-mode intervention preserves physical resources and replays exactly',()=>{
  const a=createWorld(42),b=cloneWorld(a);applyIntervention(a,'local');applyIntervention(b,'local');
  assert.equal(a.options.knowledge,'local');advance(a,30);advance(b,30);assert.deepEqual(a,b);
});

test('invalid knowledge modes are rejected before a world can run',()=>{
  assert.throws(()=>createWorld(42,{knowledge:'telepathy'}));
});

// Catches ignoring a newer harvest observation merely because both occurred today.
test('a report after harvesting can supersede another inhabitants morning observation',()=>{
  const w=createWorld(42,{knowledge:'reports'}),a=w.agents[0],b=w.agents[1];w.agents=[a,b];
  for(const person of [a,b])Object.assign(person,{x:3,y:3,food:2.5,known:{},seen:{}});
  w.cells[75].stock=.8;applyIntervention(w,'drought');stepWorld(w);
  assert.equal(w.events.filter(e=>e.type==='empty-arrival').length,0);
  assert.ok(w.events.some(e=>e.type==='report'&&e.evidence.observedOrder>0));
});
