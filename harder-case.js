import {createWorld,advance,cloneWorld,applyIntervention,summarize} from './engine.js';
import {validateComparison,validateWorld} from './save.js';

const hNumber=n=>Number(n).toFixed(2);
const hRow=(label,value)=>({label,value:String(value)});
const hAgent=(w,id)=>w.agents.find(a=>a.id===id);
const hPoint=a=>`(${a.x}, ${a.y})`;
const hGift=(w,day,actor,target)=>w.events.find(e=>e.day===day&&e.type==='gift'&&e.actor===actor&&e.target===target);
function hBalance(w){validateWorld(w);const s=summarize(w);if(Math.abs(s.foodBalanceError)>1e-7||Math.abs(s.woodBalanceError)>1e-7)throw Error('Harder case resources do not balance.');}
function hFrame(w){const a=hAgent(w,12);return {day:w.day,x:a.x,y:a.y,food:a.food,wood:a.wood,bridgeOpen:w.bridge.open,bridgeRepair:w.bridge.repair};}
function hRun(start){
 const w=cloneWorld(start),frames=[hFrame(w)],choices=[];
 for(let day=0;day<2;day++){
  advance(w,1,view=>{if([8,12].includes(view.actor))choices.push(view);});frames.push(hFrame(w));
 }
 hBalance(w);return {w,frames,choices};
}
function hOrdered(run,title){
 const steps=run.choices.filter(f=>f.day===55||f.actor===12).map(f=>{
  const ivo=f.agents.find(a=>a.id===8),moss=f.agents.find(a=>a.id===12),patch=f.cells.find(c=>c.x===15&&c.y===6);
  return {heading:`Day ${f.day} · before ${f.actor===8?'Ivo':'Moss'} chooses`,rows:[
   hRow('Ivo',`${hNumber(ivo.food)} food · ${hPoint(ivo)}`),hRow('Moss',`${hNumber(moss.food)} food · ${hPoint(moss)}`),hRow('Grove (15, 6)',hNumber(patch.stock)+' food')
  ]};
 });
 const receipts=run.w.events.filter(e=>e.day>=55&&['gift','gather','gift-omitted'].includes(e.type)&&[0,8,12].includes(e.actor)).map(e=>{
  const name=hAgent(run.w,e.actor).name;
  return e.type==='gift'?`Day ${e.day}: ${name} → ${hAgent(run.w,e.target).name}, ${hNumber(e.evidence.amount)} food.`:
   e.type==='gift-omitted'?`Day ${e.day}: ${name}'s chosen handover is omitted; the sharing workday is spent.`:
    `Day ${e.day}: ${name} gathers ${hNumber(e.evidence.amount)} food at ${hPoint(e.location)}.`;
 });
 return {title,steps,receipts};
}

export function createHarderCase(){
 const start=createWorld(42);advance(start,25);applyIntervention(start,'drought');applyIntervention(start,'bridge');advance(start,29);
 const recorded=hRun(start),branches=new Map(),first=hGift(recorded.w,55,8,0),later=hGift(recorded.w,56,12,8);
 if(!first||!later)throw Error('The untaken-harvest history no longer reproduces.');
 const specs=[
  {id:'omit-gift-workday',label:'Omit Ivo’s day-55 gift; spend the sharing workday',prompt:'Omit only the chosen Ivo → Ada transfer on day 55. Ivo keeps the food and spends that sharing workday, with no replacement gathering. His later ordinary decisions remain free.',type:'skip-gift',details:{day:55,actor:8,target:0}},
  {id:'forget-ivo-ada',label:'Remove Ivo’s association; allow his ordinary next activity',prompt:'Remove only Ivo’s remembered association with Ada’s help at the day-54 checkpoint. He keeps his supplies and chooses his subsequent activities by the ordinary rules.',type:'forget-helper',details:{actor:8,helper:0}},
  {id:'forget-ada-ivo',label:'Remove Ada’s reverse association; retain Ivo’s',prompt:'Remove only Ada’s remembered association with Ivo’s help. Retain his association with her and all starting supplies.',type:'forget-helper',details:{actor:0,helper:8}},
  {id:'retain-history',label:'Retain the starting history',prompt:'Retain all help associations, inventories and decision rules. Replay the recorded starting checkpoint.'}
 ];
 const options=specs.map(spec=>{
  const altered=cloneWorld(start);if(spec.type)applyIntervention(altered,spec.type,spec.details);
  const pair={format:'common-ground-comparison',version:1,scenario:'none',baseline:cloneWorld(start),experiment:altered};validateComparison(pair);branches.set(spec.id,pair);
  const replay=hRun(altered),transfer=hGift(replay.w,56,12,8),early=hGift(replay.w,55,8,0),harvest=replay.w.events.find(e=>e.day===55&&e.type==='gather'&&e.actor===12);
  const choice=replay.choices.find(f=>f.day===56&&f.actor===12),ivo=choice.agents.find(a=>a.id===8),moss=choice.agents.find(a=>a.id===12);
  return {id:spec.id,label:spec.label,prompt:spec.prompt+' Replay through day 56.',unchanged:['All starting supplies and positions','Other starting help associations','Growth, movement, eating and sharing rules','Weather and keyed chance draws'],correctPrediction:transfer?'remains':'absent',result:{
   heading:'Replay: two workdays and a later handover',body:`Moss ${transfer?'gives Ivo '+hNumber(transfer.evidence.amount)+' food':'makes no gift to Ivo'} on day 56. The open workday ledgers below show who acted first, what was harvested and the stocks before Moss chose.`,
   facts:[hRow('Ivo → Ada, day 55',early?hNumber(early.evidence.amount)+' food':'None'),hRow('Moss harvest, day 55',hNumber(harvest.evidence.amount)+' food'),hRow('Moss before his day-56 choice',hNumber(moss.food)+' food'),hRow('Ivo before Moss’s day-56 choice',hNumber(ivo.food)+' food'),hRow('Moss → Ivo, day 56',transfer?hNumber(transfer.evidence.amount)+' food':'None')],
   visual:{subject:'Moss',recorded:recorded.frames,replay:replay.frames},ordered:[hOrdered(recorded,'Recorded workdays'),hOrdered(replay,'Chosen replay workdays')]
  }};
 });
 const patch=recorded.choices.find(f=>f.day===55&&f.actor===8).cells.find(c=>c.x===15&&c.y===6);
 return {
  id:'harvest',title:'The Untaken Harvest',subtitle:'A handover crosses two workdays.',
  brief:'Two receipts from the same grove: Ivo gives Ada food on day 55, then Moss gives Ivo food on day 56. Investigate whether interrupting the first handover also prevents the second.',
  question:'Would both proposed interruptions prevent Moss’s day-56 handover?',
  rules:['Each resident performs one physical work activity, then consumes up to 0.9 food. Earlier residents have already acted and eaten when a later resident chooses.','Giving requires more than 4.8 food, a recipient with less than 2.2, and at most two adjacent steps between them. These conditions permit a gift; they do not force every eligible resident to give.','Grove food is shared physical stock. A harvest removes what it takes, up to that resident’s gathering capacity.','Replays preserve starting stocks, positions, weather and chance draws. Inspect both proposed interruptions before concluding about their relationship.'],
  clues:[
   {id:'stores',title:'The starting stores',day:54,body:'Ada and Ivo are at (15, 6); Moss is at (14, 6). These are the end-of-day stocks before either interruption.',rows:[0,8,12].map(id=>hRow(hAgent(start,id).name,hNumber(hAgent(start,id).food)+' food')),location:{x:15,y:6}},
   {id:'first-receipt',title:'The earlier handover',day:55,body:`Ivo transfers ${hNumber(first.evidence.amount)} food to Ada at (15, 6). A day-54 receipt also records Ada handing Ivo ${hNumber(hGift(start,54,0,8).evidence.amount)} food.`,rows:[hRow('Day 55 sender','Ivo'),hRow('Day 55 recipient','Ada')],location:{x:15,y:6}},
   {id:'grove',title:'The shared grove',day:55,body:'This count is taken before Ivo’s day-55 decision. Ivo acts before Moss that day. Their gathering capacities and the available stock are listed separately.',rows:[hRow('Available food',hNumber(patch.stock)),hRow('Ivo’s task capacity',hNumber(hAgent(start,8).gatherRate)),hRow('Moss’s task capacity',hNumber(hAgent(start,12).gatherRate))],location:{x:15,y:6}},
   {id:'later-receipt',title:'The next-day handover',day:56,body:`Moss transfers ${hNumber(later.evidence.amount)} food to Ivo. This receipt establishes the later transfer, but does not say whether the previous day’s transfer was necessary.`,rows:[hRow('Sender','Moss'),hRow('Recipient','Ivo'),hRow('Recorded amount',hNumber(later.evidence.amount))],location:{x:15,y:6}}
  ],
  hypotheses:[{id:'transfer',label:'The day-55 transfer is needed to make Ivo eligible for help: both interruptions prevent the second handover.'},{id:'activity',label:'The interruptions change later stocks differently: only one prevents the second handover.'}],
  predictions:[{id:'remains',label:'Moss still gives Ivo food on day 56.'},{id:'absent',label:'Moss gives Ivo no food on day 56.'},{id:'uncertain',label:'I’m not sure yet; inspect the workdays before concluding.'}],
  map:{width:start.width,height:start.height,cells:start.cells.map(({x,y,terrain,resource})=>({x,y,terrain,resource})),markers:[{x:15,y:6,label:'Ada / Ivo and shared grove'},{x:14,y:6,label:'Moss at dusk'},{x:15,y:3,label:'Other food grove'}],bridge:{...start.bridge}},
  reconstruction:{prompt:'Select an interruption, record a forecast, and inspect the two workdays.',options},
  solution:{hypothesis:'activity',prediction:'remains',requiredTests:['omit-gift-workday','forget-ivo-ada'],evidencePairs:[['first-receipt','grove'],['stores','grove'],['grove','later-receipt'],['first-receipt','later-receipt'],['stores','later-receipt']],
   requiredFeedback:'Inspect both proposed interruptions before comparing their effects. One replay alone cannot settle the comparative question.',
   contradiction:attempt=>attempt.testedIds.includes('omit-gift-workday')?'The selective omission removes the day-55 transfer, yet Moss still gives Ivo food on day 56. That is a counterexample to necessity of that specific transfer.':attempt.testedIds.includes('forget-ivo-ada')?'This replay cannot by itself prove that the transfer is necessary; inspect the selective workday omission.':'Inspect the two proposed interruptions before deciding whether they have the same later effect.',
   explanation:'The specific day-55 transfer is not necessary: the workday-omission replay removes it yet preserves Moss’s day-56 gift. Removing the starting help association instead makes Ivo gather first on day 55, leaving Moss only 1.02 food to harvest. Ivo still gives Ada 2.8 food on day 56 without that remembered help; the intervention does not ban later gifts. Before Moss’s next choice he lacks the required surplus and Ivo lacks the required need. With the sharing workday occupied, Moss keeps his full harvest; Ivo’s later ordinary transfer and meal make him eligible for help. This is an activity-and-stock effect in these two workdays, not repayment of a favor to Moss or a universal result of forgetting.',
   timeline:['Day 55, recorded: Ivo gives Ada 2.8; Moss takes 6.38 from the unharvested grove.','Day 56, recorded: Moss has 8.39 and Ivo 1.99 immediately before Moss chooses; the 2.8 gift occurs.','Starting association removed: Ivo harvests 5.45 first on day 55, leaving Moss 1.02. Ivo gives Ada 2.8 on day 56; Moss gives Ivo nothing that day.','Selected transfer omitted but its workday occupied: Moss still harvests 6.38. Ivo gives Ada 2.69 on day 56 and eats, leaving 2.10 before Moss; the gift survives.']},
  getComparison:(id='omit-gift-workday')=>{const pair=branches.get(id);if(!pair)throw Error('Choose an available reconstruction.');return cloneWorld(pair);}
 };
}
