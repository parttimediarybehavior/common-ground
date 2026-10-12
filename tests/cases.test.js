import test from 'node:test';
import assert from 'node:assert/strict';
import {createCaseBook,judgeCase} from '../cases.js';
import {advance,summarize} from '../engine.js';
import {validateComparison} from '../save.js';

test('casebook offers observation, material/travel and help-memory investigations',()=>{
 assert.deepEqual(createCaseBook().map(c=>c.id),['detour','crossing','meal','harvest','window']);
});

test('case comparisons reproduce the independently checked physical consequences',()=>{
 const book=createCaseBook();assert.equal(book.length,5);
 for(const c of book){const data=c.getComparison();validateComparison(data);
  const physical=w=>w.agents.map(a=>[a.x,a.y,a.food,a.wood,a.health]);
  assert.deepEqual(physical(data.baseline),physical(data.experiment));
  const days=c.id==='detour'?3:c.id==='harvest'?2:c.id==='window'?4:1;
  advance(data.baseline,days);advance(data.experiment,days);
  if(c.id==='detour'){
   const harvest=w=>w.events.find(e=>e.day===32&&e.type==='gather'&&e.actor===14).evidence.amount;
   assert.ok(Math.abs(harvest(data.baseline)-5.311118507)<1e-8);assert.ok(Math.abs(harvest(data.experiment)-.751892490)<1e-8);
  }else if(c.id==='crossing'){
   assert.equal(data.baseline.bridge.open,true);assert.equal(data.experiment.bridge.open,false);assert.equal(data.experiment.agents[10].wood,3);
  }else if(c.id==='window'){assert.ok(data.baseline.agents[7].food>data.experiment.agents[7].food);}
  else if(c.id==='harvest'){assert.equal(data.experiment.events.some(e=>e.day===55&&e.type==='gift'&&e.actor===8&&e.target===0),false);assert.equal(data.experiment.events.some(e=>e.day===56&&e.type==='gift'&&e.actor===12&&e.target===8),true);}
  else{assert.ok(Math.abs(data.baseline.agents[0].food-4)<1e-8);assert.ok(Math.abs(data.experiment.agents[0].food-1.2)<1e-8);}
  for(const w of[data.baseline,data.experiment]){const s=summarize(w);assert.ok(Math.abs(s.foodBalanceError)<1e-7);assert.ok(Math.abs(s.woodBalanceError)<1e-7);}
 }
});

test('answers require a cause, relevant evidence and a tested consequence prediction',()=>{
 const book=createCaseBook();assert.equal(book.length,5);
 for(const c of book){const a={hypothesis:c.solution.hypothesis,prediction:c.solution.prediction,evidence:c.solution.evidencePairs[0],tested:true,testId:c.solution.requiredTests[0],testedIds:c.solution.requiredTests};
  assert.equal(judgeCase(c,a).correct,true);
  for(const altered of[{...a,hypothesis:'unknown'},{...a,prediction:'unknown'},{...a,evidence:[]},{...a,tested:false}])assert.equal(judgeCase(c,altered).correct,false);
 }
});

test('players can compare selective causes with retained-state controls',()=>{
 const expected={detour:['withhold-report','retain-report'],crossing:['omit-kit','omit-ada','omit-dara','rain-only'],meal:['forget-ivo','forget-ada','retain-memory'],harvest:['omit-gift-workday','forget-ivo-ada','forget-ada-ivo','retain-history'],window:['through-40','through-39']};
 for(const c of createCaseBook()){
  assert.deepEqual(c.reconstruction.options?.map(o=>o.id),expected[c.id]);
  for(const option of c.reconstruction.options){
   const pair=c.getComparison(option.id);validateComparison(pair);
   advance(pair.experiment,c.id==='detour'?3:c.id==='harvest'?2:c.id==='window'?4:1);
   if(c.id==='detour')assert.deepEqual(pair.experiment.events.find(e=>e.type==='destination'&&e.day===30&&e.actor===14).evidence.site,{x:option.id==='withhold-report'?5:8,y:option.id==='withhold-report'?4:6});
   if(c.id==='crossing')assert.equal(pair.experiment.bridge.open,option.id!=='omit-kit');
   if(c.id==='meal')assert.ok(Math.abs(pair.experiment.agents[0].food-(option.id==='forget-ivo'?1.2:4))<1e-8);
   const s=summarize(pair.experiment);assert.ok(Math.abs(s.foodBalanceError)<1e-7);assert.ok(Math.abs(s.woodBalanceError)<1e-7);
  }
 }
});

test('retaining a possible cause alone cannot establish its causal effect',()=>{
 const c=createCaseBook().find(c=>c.id==='meal');
 const a={hypothesis:'memory',prediction:'same',evidence:['receipt','transfer'],tested:true,testId:'retain-memory',testedIds:['retain-memory']};
 assert.equal(judgeCase(c,a).correct,false);
 assert.equal(judgeCase(c,{...a,testedIds:['forget-ivo','retain-memory']}).correct,true);
 assert.equal(judgeCase(c,{...a,testId:'forget-ivo',testedIds:['forget-ivo'],prediction:'less'}).correct,true);
 assert.equal(judgeCase(c,{...a,testId:'forget-ivo',testedIds:['forget-ivo'],prediction:'uncertain'}).correct,false);
});

test('testing the wrong carrier gives a contradiction rather than denying the selective experiment',()=>{
 const c=createCaseBook().find(c=>c.id==='crossing');
 const verdict=judgeCase(c,{hypothesis:'ada',prediction:'same',evidence:['roster','paths'],tested:true,testId:'omit-ada',testedIds:['omit-ada']});
 assert.equal(verdict.correct,false);
 assert.match(verdict.feedback,/one-day travel limit/);
 assert.doesNotMatch(verdict.feedback,/retained-state replay alone/);
});

test('replay frames expose actual daily movement and conserved supplies after a chosen test',()=>{
 for(const c of createCaseBook())for(const option of c.reconstruction.options){
  const visual=option.result.visual;
  assert.ok(visual,'selected test provides inspectable physical replay frames');
  const pair=c.getComparison(option.id), actor=c.id==='detour'?14:c.id==='crossing'?10:c.id==='harvest'?12:c.id==='window'?7:0;
  for(const [branch,key] of [['recorded','baseline'],['replay','experiment']]){
   const frames=visual[branch];assert.equal(frames[0].day,pair[key].day);
   for(const frame of frames){
    advance(pair[key],frame.day-pair[key].day);
    const a=pair[key].agents[actor];assert.deepEqual([frame.x,frame.y,frame.food,frame.wood],[a.x,a.y,a.food,a.wood]);
    assert.equal(frame.bridgeOpen,pair[key].bridge.open);
   }
  }
 }
});

test('player clue records omit answer-bearing event reasons and hidden source IDs',()=>{
 const book=createCaseBook();assert.equal(book.length,5);
 for(const c of book){assert.ok(c.clues.length>=3);assert.equal(new Set(c.clues.map(e=>e.id)).size,c.clues.length);
  for(const clue of c.clues){assert.ok(typeof clue.body==='string');assert.ok(Number.isInteger(clue.day));
   assert.equal('solution'in clue,false);assert.equal('actor'in clue,false);assert.equal('via'in clue,false);assert.equal('reason'in clue,false);
  }
 }
});

test('two interrupted first gifts yield different delayed transfers with ordered stocks',()=>{
 const c=createCaseBook().find(c=>c.id==='harvest');assert.ok(c);
 for(const [id,later] of [['omit-gift-workday',true],['forget-ivo-ada',false]]){
  const pair=c.getComparison(id);advance(pair.experiment,2);
  assert.equal(pair.experiment.events.some(e=>e.day===55&&e.type==='gift'&&e.actor===8&&e.target===0),false);
  assert.equal(pair.experiment.events.some(e=>e.day===56&&e.type==='gift'&&e.actor===12&&e.target===8),later);
  const option=c.reconstruction.options.find(o=>o.id===id);
  const choice=option.result.ordered[1].steps.find(s=>s.heading==='Day 56 · before Moss chooses');assert.ok(choice);
  assert.equal(choice.rows.find(r=>r.label==='Ivo').value.startsWith(later?'2.10':'7.45'),true);
  assert.equal(choice.rows.find(r=>r.label==='Moss').value.startsWith(later?'8.39':'3.03'),true);
 }
});

test('necessity grading asks for the missing comparison without revealing an unseen outcome',()=>{
 const c=createCaseBook().find(c=>c.id==='harvest');assert.ok(c);
 const a={hypothesis:'transfer',prediction:'absent',evidence:['first-receipt','grove'],tested:true,testId:'forget-ivo-ada',testedIds:['forget-ivo-ada']};
 const incomplete=judgeCase(c,a);assert.equal(incomplete.correct,false);assert.match(incomplete.feedback,/cannot by itself prove/);assert.doesNotMatch(incomplete.feedback,/yet Moss still gives/);
 assert.equal(judgeCase(c,{...a,hypothesis:'activity'}).correct,false);
 assert.equal(judgeCase(c,{...a,hypothesis:'activity',testId:'omit-gift-workday',prediction:'remains',testedIds:['forget-ivo-ada','omit-gift-workday']}).correct,true);
 const disproved=judgeCase(c,{...a,testId:'omit-gift-workday',prediction:'remains',testedIds:['forget-ivo-ada','omit-gift-workday']});
 assert.equal(disproved.correct,false);assert.match(disproved.feedback,/counterexample/);
});

test('a later arrival reverses the exact-date food comparison without a permanent benefit claim',()=>{
 const c=createCaseBook().find(c=>c.id==='window');assert.ok(c);
 for(const [id,day,reportAhead] of [['through-39',39,false],['through-40',40,true]]){
  const pair=c.getComparison(id);assert.equal(pair.measurementDay,day);advance(pair.baseline,day-36);advance(pair.experiment,day-36);
  assert.equal(pair.baseline.agents[7].food>pair.experiment.agents[7].food,reportAhead);
  const o=c.reconstruction.options.find(o=>o.id===id);assert.equal(o.result.visual.recorded.at(-1).day,day);
  assert.equal(o.result.visual.recorded.at(-1).food,pair.baseline.agents[7].food);
  assert.match(o.result.orderedNote,/end-of-day/);
 }
 const a={hypothesis:'persistent',prediction:'withheld-ahead',tested:true,testId:'through-39',testedIds:['through-39'],evidence:['early-tally','trip']};
 const before=judgeCase(c,a);assert.equal(before.correct,false);assert.doesNotMatch(before.feedback,/has more private food/);
 assert.equal(judgeCase(c,{...a,hypothesis:'window'}).correct,false);
 assert.equal(judgeCase(c,{...a,hypothesis:'window',testedIds:['through-39','through-40']}).correct,true);
});

test('partial harvest feedback never reveals the uninspected interruption activity',()=>{
 const c=createCaseBook().find(c=>c.id==='harvest');
 for(const id of ['omit-gift-workday','forget-ada-ivo','retain-history'])for(const h of c.hypotheses){
  const option=c.reconstruction.options.find(o=>o.id===id);
  const result=judgeCase(c,{hypothesis:h.id,prediction:option.correctPrediction,tested:true,testId:id,testedIds:[id],evidence:['first-receipt','grove']});
  assert.equal(result.correct,false);
  assert.doesNotMatch(result.feedback,/replace sharing with gathering|makes Ivo gather|memory replay changes the next activity|leaving Moss only|1\.02/);
 }
});

test('early-window feedback requests the later observation without predicting arrival',()=>{
 const c=createCaseBook().find(c=>c.id==='window');
 for(const h of c.hypotheses){
  const result=judgeCase(c,{hypothesis:h.id,prediction:'withheld-ahead',tested:true,testId:'through-39',testedIds:['through-39'],evidence:['early-tally','trip']});
  assert.equal(result.correct,false);
  assert.doesNotMatch(result.feedback,/before the longer trip is complete|completes the longer trip|has more private food|5\.96|12\.76/);
 }
});

test('help association changes day-55 gift timing without prohibiting day-56 giving',()=>{
 const c=createCaseBook().find(c=>c.id==='meal'),pair=c.getComparison('forget-ivo');
 advance(pair.experiment,1);
 assert.equal(pair.experiment.agents[8].helped[0]??0,0);
 assert.equal(pair.experiment.events.some(e=>e.type==='gift'&&e.day===55&&e.actor===8&&e.target===0),false);
 advance(pair.experiment,1);
 const later=pair.experiment.events.find(e=>e.type==='gift'&&e.day===56&&e.actor===8&&e.target===0);
 assert.equal(later.evidence.amount,2.8);assert.equal(later.evidence.rememberedHelp,0);
 assert.match(c.solution.explanation,/day 55/);assert.match(c.solution.explanation,/day 56/);
});
