import {createWorld,advance,cloneWorld,applyIntervention,findPath,summarize} from './engine.js';
import {validateComparison} from './save.js';
import {createHarderCase} from './harder-case.js';
import {createWindowCase} from './window-case.js';

const fmt=(n,d=2)=>Number(n).toFixed(d);
const pos=a=>`(${a.x}, ${a.y})`;
const row=(label,value)=>({label,value:String(value)});
const resident=(w,id)=>w.agents.find(a=>a.id===id);
const event=(w,predicate)=>{const e=w.events.find(predicate);if(!e)throw Error('A recorded case no longer reproduces.');return e;};
function balanced(w){const s=summarize(w);if(Math.abs(s.foodBalanceError)>1e-7||Math.abs(s.woodBalanceError)>1e-7)throw Error('Case resources do not balance.');}
function crisis(day){const w=createWorld(42);advance(w,25);applyIntervention(w,'drought');applyIntervention(w,'bridge');advance(w,day-25);return w;}
function mapOf(w,markers){return {width:w.width,height:w.height,cells:w.cells.map(({x,y,terrain,resource})=>({x,y,terrain,resource})),markers,bridge:{...w.bridge}};}
function comparison(base,fork){const data={format:'common-ground-comparison',version:1,scenario:'none',baseline:base,experiment:fork};validateComparison(data);return ()=>cloneWorld(data);}
function finish(c){for(const w of [c.getComparison().baseline,c.getComparison().experiment])balanced(w);return c;}
function physicalFrames(start,actor,days){
 const w=cloneWorld(start),frames=[];
 for(let offset=0;offset<=days;offset++){
  if(offset)advance(w,1);
  const a=resident(w,actor);
  frames.push({day:w.day,x:a.x,y:a.y,food:a.food,wood:a.wood,bridgeOpen:w.bridge.open,bridgeRepair:w.bridge.repair});
 }
 balanced(w);return frames;
}

function detour(){
 const start=createWorld(19);advance(start,25);applyIntervention(start,'drought');applyIntervention(start,'reports');advance(start,4);
 const altered=cloneWorld(start);applyIntervention(altered,'block-report',{day:30,actor:4,target:14});
 const base=cloneWorld(start),fork=cloneWorld(altered);advance(base,3);advance(fork,3);balanced(base);balanced(fork);
 const old=resident(start,14).known[4*24+5];
 const survey=event(base,e=>e.type==='report'&&e.day===30&&e.actor===4&&e.target===14);
 const normalTrip=event(base,e=>e.type==='destination'&&e.day===30&&e.actor===14);
 const changedTrip=event(fork,e=>e.type==='destination'&&e.day===30&&e.actor===14);
 const normalHarvest=event(base,e=>e.type==='gather'&&e.day===32&&e.actor===14);
 const changedHarvest=event(fork,e=>e.type==='gather'&&e.day===32&&e.actor===14);
 const sightDistance=Math.abs(resident(start,14).x-survey.evidence.site.x)+Math.abs(resident(start,14).y-survey.evidence.site.y);
 return finish({id:'detour',title:'The Detour',subtitle:'A tempting grove is passed by.',
  brief:'Orin starts at (4, 8). He passes the nearer food patch and heads toward (8, 6). The crossing stays open. What changed his decision?',
  question:'Why did Orin reject the nearer patch?',
  rules:['Residents can inspect stocks within two adjacent tiles, measured horizontally and vertically.','Nearby residents may pass along dated observations. Older stock figures become growth forecasts.','A foraging destination must be expected to hold at least 0.4 food.','New trips compare one load of expected food against travel time; surplus beyond the gatherer’s capacity gives no extra benefit. Small repeatable daily preferences can break close choices. You may record uncertainty before testing.'],
  clues:[
   {id:'notebook',title:'The old field notes',day:old.seenAt,body:`The dated count in Orin's notes for the nearer patch held ${fmt(old.stock)} food. By day 30, a growth-only forecast would put it at ${fmt(changedTrip.evidence.believedStock)}. His older information for (8, 6) still predicts ${fmt(normalTrip.evidence.believedStock)}.`,rows:[row('Nearer patch','(5, 4)'),row('Nearer walk','5 steps'),row('Other walk','6 steps'),row('Orin’s gathering capacity',fmt(resident(start,14).gatherRate)+' food per task')],location:{x:5,y:4}},
   {id:'survey',title:'A newer stock count',day:survey.evidence.observedDay,body:`A fresh count finds only ${fmt(survey.evidence.reportedStock)} food at (5, 4). It reflects recent gathering, which the growth-only forecast could not see.`,rows:[row('Observed stock',fmt(survey.evidence.reportedStock)),row('Useful-patch threshold','0.40')],location:{x:5,y:4}},
   {id:'tracks',title:'The decision place',day:30,body:`Orin is at ${pos(resident(start,14))} when choosing his trip. The nearer patch is ${sightDistance} steps away, beyond his two-tile sight. His local inspection reaches two steps from that position.`,rows:[row('Day 31 route','(6, 6)'),row('Day 32 arrival','(8, 6)'),row('Day 32 harvest',fmt(normalHarvest.evidence.amount)+' food')],location:{x:4,y:8}},
   {id:'crossing',title:'The crossing survey',day:30,body:'The bridge is open. Both candidate patches and Orin are on the west bank, with clear routes to both groves.',rows:[row('Crossing','Open'),row('Route obstruction','None')],location:{x:11,y:8}}
  ],
  hypotheses:[{id:'relay',label:'A relayed observation made the old nearby estimate obsolete.'},{id:'own-survey',label:'Orin personally surveyed the near grove before choosing.'},{id:'bridge',label:'A closed crossing forced him away from the near grove.'}],
  predictions:[{id:'near',label:'Without the fresh camp report, he targets (5, 4).'},{id:'far',label:'Without that report, he still targets (8, 6).'},{id:'stay',label:'Without that report, he stays at camp.'}],
  map:mapOf(start,[{x:4,y:8,label:'Orin'},{x:5,y:4,label:'Near grove'},{x:8,y:6,label:'Other grove'}]),
  reconstruction:{prompt:'Keep starting positions, supplies, weather and chance events fixed. Withhold the one fresh camp report on day 30, then replay to day 32.',unchanged:['Physical starting state','Weather and growth rules','Local sight and chance events'],result:{heading:'The old estimate wins again.',body:`With that one report withheld, Orin targets (5, 4). Both routes start with the same two steps, then separate on day 31.`,facts:[row('Recorded destination','(8, 6)'),row('Reconstruction destination',pos(changedTrip.evidence.site)),row('Recorded day-32 harvest',fmt(normalHarvest.evidence.amount)+' food'),row('Reconstruction harvest',fmt(changedHarvest.evidence.amount)+' food')]}},
  solution:{hypothesis:'relay',prediction:'near',evidencePairs:[['survey','tracks'],['survey','notebook'],['survey','crossing']],explanation:'The new count is below the useful-patch threshold and outside Orin’s sight. It must reach his decision through a relayed observation. His own older notes would favor the nearer grove. The open bridge does not explain the change.',timeline:['Earlier: the near grove is remembered as productive.','Day 30: Eli passes Orin the newer, depleted stock count.','Day 31: Orin takes the route toward the other grove.','Day 32: the two controlled branches yield 5.31 and 0.75 food. This shows a changed immediate harvest, not a permanent advantage.']},
  getComparison:comparison(start,altered)
 });
}

function crossing(){
 const start=crisis(37),altered=cloneWorld(start);applyIntervention(altered,'skip-repair',{day:38,actor:10});
 const base=cloneWorld(start),fork=cloneWorld(altered),rain=cloneWorld(start);applyIntervention(rain,'rain');advance(base,1);advance(fork,2);advance(rain,1);
 balanced(base);balanced(fork);balanced(rain);
 const donors=start.agents.filter(a=>a.wood>0).map(a=>({a,steps:findPath(start,a,{x:a.x<11?10:13,y:8}).length}));
 const full=donors.filter(({a})=>a.wood>=3);
 const repair=event(base,e=>e.type==='repair'&&e.day===38&&e.actor===10);
 const reopening=event(fork,e=>e.type==='bridge-open');
 return finish({id:'crossing',title:'The Crossing',subtitle:'A path reopens before dusk.',
  brief:'The crossing is incomplete at the end of day 37. It reopens on day 38 after one person delivers the final three timber. Several residents carry enough wood. Who could have reached the work site in time?',
  question:'Who could supply the final three timber in one workday?',
  rules:['Residents can move up to two adjacent tiles and perform one physical work task in a day. A repair can be completed upon reaching the shore.','Timber is spent only when a repair contribution is made. Food, rain and memories cannot replace timber.','The west work site is (10, 8); the east work site is (13, 8). The bridge is impassable until complete.'],
  clues:[
   {id:'materials',title:'The work-site tally',day:37,body:`Workers have supplied ${start.bridge.repair} of ${start.bridge.required} timber. Exactly three more are needed. The question concerns the last contribution, not who deserves credit for all earlier work.`,rows:[row('Completed','15 / 18 timber'),row('Missing','3 timber')],location:{x:10,y:8}},
   {id:'roster',title:'Carriers at dusk',day:37,body:'This is the full roster carrying at least three timber. Every other resident carries less than the missing amount.',rows:full.map(({a,steps})=>row(a.name,`${pos(a)} · ${fmt(a.wood,0)} timber · ${steps} steps to their shore`))},
   {id:'paths',title:'The shore approaches',day:37,body:'The route from (9, 7) to (10, 8) takes two adjacent steps. From (9, 11), it takes four. From (17, 8) to (13, 8), it takes four. The broken bridge offers no shortcut.',rows:[row('Daily movement','2 steps'),row('West shore','(10, 8)'),row('East shore','(13, 8)')],location:{x:10,y:8}},
   {id:'rain',title:'The weather note',day:37,body:'The western groves are under drought. Ending it restores their usual growth rate. Applying a weather change credits no immediate timber or repair progress; later work remains to be inspected.',rows:[row('Weather at dusk','Drought'),row('Immediate timber credit','0')]}
  ],
  hypotheses:[{id:'kit',label:'Kit could carry the final timber to the west shore.'},{id:'ada',label:'Ada could carry the final timber to the west shore.'},{id:'dara',label:'Dara could carry the final timber to the east shore.'},{id:'rain',label:'Rain could complete the crossing without a timber delivery.'}],
  predictions:[{id:'delay',label:'Omitting Kit’s contribution retains his wood and leaves the crossing shut on day 38.'},{id:'same',label:'Omitting Kit’s contribution still leaves the crossing open on day 38.'},{id:'lost',label:'Omitting Kit’s contribution destroys his timber.'}],
  map:mapOf(start,[{x:9,y:7,label:'Kit'},{x:9,y:11,label:'Ada'},{x:17,y:8,label:'Dara / Pip'},{x:10,y:8,label:'West work site'},{x:13,y:8,label:'East work site'}]),
  reconstruction:{prompt:'Keep all supplies, routes, weather and chance events fixed. Omit only Kit’s day-38 contribution after he reaches the shore, retaining his timber.',unchanged:['Starting supplies and positions','Other residents’ work','Weather and chance events'],result:{heading:'The crossing waits one more day.',body:`Kit retains three timber. The crossing remains at 15/18 on day 38; another worker completes it on day ${reopening.day}.`,facts:[row('Recorded reopening','Day 38'),row('Reconstruction reopening','Day '+reopening.day),row('Timber discarded','0')]}},
  solution:{hypothesis:'kit',prediction:'delay',evidencePairs:[['materials','roster'],['paths','roster'],['rain','roster']],explanation:'Kit has the missing three timber and is only two steps from the west work site. The other full-timber carriers cannot reach their work site within one day. Rain supplies no wood. Earlier contributors remain necessary; this identifies the final delivery only.',timeline:['Day 37: five earlier contributions have brought the crossing to 15/18.','Day 38: Kit reaches (10, 8) and supplies the final three timber.','With only his contribution omitted: he keeps the wood and the crossing stays shut that day.','Day 39: Ada completes the crossing in the reconstruction.']},
  getComparison:comparison(start,altered)
 });
}

function meal(){
 const start=crisis(54),altered=cloneWorld(start);applyIntervention(altered,'forget-helper',{actor:8,helper:0});
 const base=cloneWorld(start),fork=cloneWorld(altered);advance(base,1);advance(fork,1);balanced(base);balanced(fork);
 const extended=cloneWorld(fork);advance(extended,1);balanced(extended);
 const nextGift=event(extended,e=>e.type==='gift'&&e.day===56&&e.actor===8&&e.target===0);
 const earlier=event(start,e=>e.type==='gift'&&e.day===54&&e.actor===0&&e.target===8);
 const gift=event(base,e=>e.type==='gift'&&e.day===55&&e.actor===8&&e.target===0);
 const adaBefore=resident(start,0),ivoBefore=resident(start,8),adaAfter=resident(base,0),adaChanged=resident(fork,0);
 return finish({id:'meal',title:'The Extra Meal',subtitle:'A handover changes the evening stores.',
  brief:'Ada leaves a food patch with more supplies than her own gathering could explain. Ivo has a surplus nearby. A receipt shows they helped each other before. Can that history explain this particular exchange?',
  question:'Did spare food alone explain Ivo’s day-55 gift, or did remembered help change its timing?',
  rules:['A full daily meal consumes 0.9 food. Sharing transfers real supplies; it does not create food.','Surplus makes giving possible but does not require a gift. Remembered help may affect a resident’s decision.','Two gifts alone cannot prove a memory cause. A controlled replay must hold supplies and other circumstances fixed.'],
  clues:[
   {id:'supplies',title:'The evening stores',day:54,body:`Ada and Ivo are both at ${pos(adaBefore)}. Ada has ${fmt(adaBefore.food)} food; Ivo has ${fmt(ivoBefore.food)}. These stores are retained in both controlled branches.`,rows:[row('Ada',fmt(adaBefore.food)+' food'),row('Ivo',fmt(ivoBefore.food)+' food')],location:{x:15,y:6}},
   {id:'route',title:'Ada’s next walk',day:55,body:`Ada reaches ${pos(adaAfter)}. She has not yet reached her food destination (15, 3), and no pantry is reachable along this two-step walk. She consumes one daily meal.`,rows:[row('Opening food',fmt(adaBefore.food)),row('Closing food',fmt(adaAfter.food)),row('Daily consumption','0.90'),row('Unexplained addition',fmt(adaAfter.food-adaBefore.food+.9))],location:{x:15,y:4}},
   {id:'receipt',title:'An earlier handover',day:54,body:`The supply ledger records Ada handing Ivo ${fmt(earlier.evidence.amount)} food. This establishes previous help. By itself it cannot tell us why a later gift occurs.`,rows:[row('From','Ada'),row('To','Ivo'),row('Amount',fmt(earlier.evidence.amount)+' food')],location:{x:15,y:6}},
   {id:'transfer',title:'The later handover',day:55,body:`A recorded transfer of ${fmt(gift.evidence.amount)} food from Ivo accounts for Ada’s added supplies. Was Ivo’s surplus enough to require this transfer? The controlled replay can distinguish that from a remembered-help effect.`,rows:[row('Sender','Ivo'),row('Recipient','Ada'),row('Amount',fmt(gift.evidence.amount)+' food')],location:{x:15,y:6}}
  ],
  hypotheses:[{id:'memory',label:'Remembered help changed this particular gift decision.'},{id:'surplus',label:'Ivo would give the same food in response to current surplus and need, even without remembered help.'},{id:'pantry',label:'Ada collected the extra food from a pantry.'}],
  predictions:[{id:'less',label:'Without that association, no gift occurs on day 55 and Ada ends that day with 1.2 food.'},{id:'same',label:'With the same surplus, the gift continues and Ada still ends with 4 food.'},{id:'vanish',label:'The gift stops but Ada keeps her opening 2.1 food.'}],
  map:mapOf(start,[{x:15,y:6,label:'Ada / Ivo'},{x:15,y:4,label:'Ada’s next position'},{x:15,y:3,label:'Food destination'},{x:19,y:8,label:'East pantry'}]),
  reconstruction:{prompt:'Keep starting supplies, positions, weather and chance events fixed. Remove only Ivo’s remembered association with Ada’s previous help, then replay one day.',unchanged:['Starting food and positions','Other residents’ memories','Weather and chance events'],result:{heading:'The day-55 transfer is absent.',body:`Ivo retains his starting surplus. Ada takes the same walk but receives no gift on day 55, ending with ${fmt(adaChanged.food)} instead of ${fmt(adaAfter.food)} food.`,facts:[row('Recorded Ada food',fmt(adaAfter.food)),row('Reconstruction Ada food',fmt(adaChanged.food)),row('Starting Ivo food in both',fmt(ivoBefore.food)),row('Ada’s position in both',pos(adaAfter))]}},
  solution:{hypothesis:'memory',prediction:'less',evidencePairs:[['receipt','transfer'],['supplies','receipt'],['route','receipt'],['supplies','transfer'],['route','transfer'],['supplies','route']],explanation:'Ivo is the physical source of the extra 2.8 food. Surplus makes that transfer possible, but preserving surplus while removing only his remembered-help association prevents the gift on day 55. In an extended replay, Ivo still gives Ada 2.8 food on day 56 with no remembered Ada-help count. The association changes the timing of this programmed decision; it does not prohibit later giving or establish a human motive.',timeline:['Day 54: Ada hands Ivo 1.93 food; he records her help.','Day 55: Ivo’s 2.8-food transfer lets Ada end her walk with 4 food after her daily meal.','Controlled replay: food and positions are held fixed; only that help association is removed.','Day 55 in the replay: no Ivo → Ada gift; Ada ends at the same position with 1.2 food.',`Day 56 in the extended replay: Ivo gives Ada ${fmt(nextGift.evidence.amount)} food despite having no remembered Ada-help count.`]},
  getComparison:comparison(start,altered)
 });
}

// Every selectable reconstruction is an actual engine branch, not a narrated answer.
function selectable(c){
 const original=c.getComparison, start=original().baseline, branches=new Map();
 const canonical={detour:'withhold-report',crossing:'omit-kit',meal:'forget-ivo'}[c.id];
 const labels={detour:['Withhold the fresh camp report','Keep the camp report'],crossing:['Omit Kit’s contribution','Omit Ada’s contribution','Omit Dara’s contribution','End the drought; retain all work'],meal:['Remove Ivo’s association with Ada’s help','Remove Ada’s association with Ivo’s help','Keep both help associations']};
 const ids={detour:['withhold-report','retain-report'],crossing:['omit-kit','omit-ada','omit-dara','rain-only'],meal:['forget-ivo','forget-ada','retain-memory']}[c.id];
 const options=ids.map((id,index)=>{
  const altered=cloneWorld(start);
  if(id==='withhold-report')applyIntervention(altered,'block-report',{day:30,actor:4,target:14});
  if(id.startsWith('omit-'))applyIntervention(altered,'skip-repair',{day:38,actor:{'omit-kit':10,'omit-ada':0,'omit-dara':3}[id]});
  if(id==='rain-only')applyIntervention(altered,'rain');
  if(id==='forget-ivo')applyIntervention(altered,'forget-helper',{actor:8,helper:0});
  if(id==='forget-ada')applyIntervention(altered,'forget-helper',{actor:0,helper:8});
  branches.set(id,comparison(start,altered));
  const replay=cloneWorld(altered);advance(replay,c.id==='detour'?3:1);balanced(replay);
  let result,correctPrediction;
  if(c.id==='detour'){
   const trip=event(replay,e=>e.type==='destination'&&e.day===30&&e.actor===14),harvest=event(replay,e=>e.type==='gather'&&e.day===32&&e.actor===14);
   correctPrediction=trip.evidence.site.x===5?'near':'far';
   result={heading:'Replay: destination and harvest',body:`Orin targets ${pos(trip.evidence.site)} on day 30. He gathers ${fmt(harvest.evidence.amount)} food on day 32.`,facts:[row('Recorded destination','(8, 6)'),row('Replay destination',pos(trip.evidence.site)),row('Recorded harvest','5.31 food'),row('Replay harvest',fmt(harvest.evidence.amount)+' food')]};
  }else if(c.id==='crossing'){
   correctPrediction=replay.bridge.open?'same':'delay';
   result={heading:'Replay: end-of-day crossing tally',body:`At the end of day 38 the tally is ${replay.bridge.repair}/18. Omitted contributions spend no timber.`,facts:[row('Recorded day-38 crossing','Open'),row('Replay day-38 crossing',replay.bridge.open?'Open':'Closed'),row('Replay tally',replay.bridge.repair+' / 18'),row('Kit’s retained timber',fmt(resident(replay,10).wood,0))]};
  }else{
   const a=resident(replay,0),gift=replay.events.find(e=>e.type==='gift'&&e.day===55&&e.actor===8&&e.target===0);
   correctPrediction=gift?'same':'less';
   result={heading:'Replay: day-55 handover and closing stores',body:`Ada takes her walk to ${pos(a)} and finishes with ${fmt(a.food)} food. Ivo’s starting surplus remains ${fmt(resident(start,8).food)} in both branches.`,facts:[row('Recorded Ada food','4.00'),row('Replay Ada food',fmt(a.food)),row('Ivo → Ada, day 55',gift?fmt(gift.evidence.amount)+' food':'None'),row('Ada’s replay position',pos(a))]};
  }
  const actor=c.id==='detour'?14:c.id==='crossing'?10:0,days=c.id==='detour'?3:1;
  result.visual={subject:resident(start,actor).name,recorded:physicalFrames(start,actor,days),replay:physicalFrames(altered,actor,days)};
  const unchanged=c.id==='crossing'?['Starting supplies and positions','Movement and repair rules','Keyed chance events',...(id==='rain-only'?[]:['Weather'])]:c.id==='meal'?['Starting food and positions','Other help associations','Weather and keyed chance events']:c.reconstruction.unchanged;
  return {id,label:labels[c.id][index],prompt:`${labels[c.id][index]}. Replay from the same starting checkpoint to day ${c.id==='detour'?32:c.id==='crossing'?38:55}.`,unchanged,result,correctPrediction};
 });
 c.reconstruction={prompt:'Choose a change to investigate. Record what you expect, inspect its replay, and revise your conclusion if the evidence changes it.',options};
 c.solution.requiredTests=[canonical];
 const general={detour:{near:'Orin targets the near grove (5, 4).',far:'Orin targets the other grove (8, 6).',stay:'Orin stays at camp.'},crossing:{delay:'The crossing stays shut on day 38; omitted work retains its timber.',same:'The crossing opens on day 38.',lost:'Omitted work destroys its timber.'},meal:{less:'No gift on day 55; Ada finishes that day with 1.2 food.',same:'The gift happens on day 55; Ada finishes that day with 4 food.',vanish:'No gift on day 55, but Ada finishes that day with her opening 2.1 food.'}};
 c.predictions=c.predictions.map(p=>({id:p.id,label:general[c.id][p.id]}));
 c.predictions.push({id:'uncertain',label:'I’m not sure yet; inspect the evidence before concluding.'});
 c.getComparison=(id=canonical)=>{const get=branches.get(id);if(!get)throw Error('Choose an available reconstruction.');return get();};
 return c;
}
let cache;
export function createCaseBook(){return cache??=( [...[detour(),crossing(),meal()].map(selectable),createHarderCase(),createWindowCase()] );}
export function judgeCase(c,attempt={}){
 if(!c?.solution)return {correct:false,feedback:'Choose an available case.'};
 if(!c.hypotheses.some(h=>h.id===attempt.hypothesis))return {correct:false,feedback:'Choose a cause to investigate.'};
 if(!c.predictions.some(p=>p.id===attempt.prediction))return {correct:false,feedback:'Record a consequence prediction.'};
 if(!attempt.tested)return {correct:false,feedback:'Inspect the controlled reconstruction before concluding; a plausible story alone is not evidence.'};
 const option=c.reconstruction.options.find(o=>o.id===attempt.testId);
 if(!option||!Array.isArray(attempt.testedIds)||!attempt.testedIds.includes(option.id))return {correct:false,feedback:'Inspect your chosen reconstruction before concluding.'};
 if(attempt.hypothesis!==c.solution.hypothesis){
  const contradictions={detour:'The grove is outside Orin’s sight and both routes stay on the open west bank. Which observation could reach him there?',crossing:'Check both the missing timber and the one-day travel limit. Enough wood is not enough if its carrier cannot arrive.',meal:'The ledger identifies Ivo as the giver. To test whether his current supplies and need explain the gift without past help, change the giver’s help association while retaining those supplies.'};
  return {correct:false,feedback:c.solution.contradiction?c.solution.contradiction(attempt):contradictions[c.id]};
 }
 if(!c.solution.requiredTests.every(id=>attempt.testedIds.includes(id)))return {correct:false,feedback:c.solution.requiredFeedback??'Your proposed cause needs a selective test of its own. Inspect a reconstruction that changes it while preserving starting supplies; a different factor or retained-state replay cannot establish its effect.'};
 if(attempt.prediction!==option.correctPrediction)return {correct:false,feedback:'Compare your current conclusion with the observed result of the selected reconstruction. You may revise an uncertain or mistaken forecast.'};
 const evidence=new Set(Array.isArray(attempt.evidence)?attempt.evidence:[]);
 if(!c.solution.evidencePairs.some(pair=>pair.every(id=>evidence.has(id))))return {correct:false,feedback:'Pin two relevant records that connect the cause to the outcome, not just the outcome itself.'};
 return {correct:true,feedback:'The cause, evidence and controlled consequence fit. Read the reconstructed chain below.'};
}
