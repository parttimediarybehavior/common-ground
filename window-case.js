import {createWorld,advance,cloneWorld,applyIntervention,summarize} from './engine.js';
import {validateComparison,validateWorld} from './save.js';
const vFmt=n=>Number(n).toFixed(2),vRow=(label,value)=>({label,value:String(value)});
const vAgent=w=>w.agents.find(a=>a.id===7);
function vFrame(w){const a=vAgent(w);return {day:w.day,x:a.x,y:a.y,food:a.food,wood:a.wood,bridgeOpen:w.bridge.open,bridgeRepair:w.bridge.repair};}
function vTrace(start){
 const w=cloneWorld(start),frames=[vFrame(w)];
 for(let n=0;n<4;n++){advance(w,1);frames.push(vFrame(w));}
 validateWorld(w);const s=summarize(w);if(Math.abs(s.foodBalanceError)>1e-7||Math.abs(s.woodBalanceError)>1e-7)throw Error('Window case resources do not balance.');
 return {w,frames};
}
export function createWindowCase(){
 const start=createWorld(73);advance(start,25);applyIntervention(start,'drought');applyIntervention(start,'reports');advance(start,11);
 const changed=cloneWorld(start);applyIntervention(changed,'block-report',{day:37,actor:9,target:7});
 const recorded=vTrace(start),withheld=vTrace(changed);
 const report=recorded.w.events.find(e=>e.type==='report'&&e.day===37&&e.actor===9&&e.target===7);
 const departure=recorded.w.events.find(e=>e.type==='destination'&&e.day===38&&e.actor===7);
 if(!report||!departure)throw Error('Window-case report and departure no longer reproduce.');
 const at=(branch,day)=>branch.frames.find(f=>f.day===day),harvests=(branch,day)=>branch.w.events.filter(e=>e.day>=37&&e.day<=day&&e.actor===7&&e.type==='gather'&&e.evidence.resource==='food');
 const total=(branch,day)=>harvests(branch,day).reduce((n,e)=>n+e.evidence.amount,0);
 const earlyA=at(recorded,39),earlyB=at(withheld,39),pairs=new Map();
 const options=[40,39].map(day=>{
  const id=`through-${day}`,a=at(recorded,day),b=at(withheld,day);
  const pair={format:'common-ground-comparison',version:1,scenario:'none',measurementDay:day,baseline:cloneWorld(start),experiment:cloneWorld(changed)};validateComparison(pair);pairs.set(id,pair);
  const receipt=(branch,label)=>({title:label,steps:[{heading:`End of day ${day}`,rows:[vRow('Position',`(${at(branch,day).x}, ${at(branch,day).y})`),vRow('Private food',vFmt(at(branch,day).food)),vRow('Food gathered since day 36',vFmt(total(branch,day)))]}],receipts:harvests(branch,day).map(e=>`Day ${e.day}: Hana gathers ${vFmt(e.evidence.amount)} food at (${e.location.x}, ${e.location.y}).`)});
  return {id,label:`Observe both branches through day ${day}`,prompt:`Hold the one-message intervention fixed. Observe both branches through the end of day ${day}, including all ordinary movement, harvesting and meals.`,unchanged:['Same day-36 stocks and positions','Only June’s one day-37 message differs','Weather, observation, movement and collection rules','Keyed chance draws'],correctPrediction:a.food>b.food?'report-ahead':a.food<b.food?'withheld-ahead':'tied',result:{
   heading:`Replay: end-of-day ${day} tally`,body:`Hana has ${vFmt(a.food)} food with the report and ${vFmt(b.food)} with that message withheld. This is a comparison at this date, not a claim about a permanent winner.`,measurementDay:day,
   facts:[vRow('Report branch · private food',vFmt(a.food)),vRow('Withheld branch · private food',vFmt(b.food)),vRow(`Report branch · gathered, days 37–${day}`,vFmt(total(recorded,day))),vRow(`Withheld branch · gathered, days 37–${day}`,vFmt(total(withheld,day)))],
   visual:{subject:'Hana',recorded:recorded.frames.filter(f=>f.day<=day),replay:withheld.frames.filter(f=>f.day<=day)},orderedNote:'These are end-of-day stocks after all ordinary activity and meals. Receipts cover the selected interval.',ordered:[receipt(recorded,'Report-branch receipts'),receipt(withheld,'Withheld-branch receipts')]
  }};
 });
 return {id:'window',title:'The Day-39 Ledger',subtitle:'Two routes and a dated tally.',
  brief:'At the end of day 39, Hana has less food in the branch where she received a report. The other branch withheld that one message. Does the same ranking hold at the end of the next day?',
  question:'How do the private food stocks compare at the end of day 40?',
  rules:['Residents move up to two adjacent tiles per workday and gather upon reaching a viable food patch. A trip can span several days.','Each resident consumes up to 0.9 food after their daily activity. Compare the same end-of-day date and the same metric.','Decisions use dated stock estimates at decision time; they do not optimize every future arrival or guarantee the best long-term outcome. Future growth and other harvesters can change arrival stocks.','The two branches start with identical physical state. One June → Hana report on day 37 is withheld in one branch; subsequent behavior follows the same rules and keyed chance draws.'],
  clues:[
   {id:'early-tally',title:'The day-39 tally',day:39,body:'These are the supplied early measurements from the two controlled branches. Food is private stock after the day’s ordinary meal.',rows:[vRow('With report',vFmt(earlyA.food)+' food'),vRow('Message withheld',vFmt(earlyB.food)+' food'),vRow('Report-branch harvest since day 36',vFmt(total(recorded,39))),vRow('Withheld-branch harvest',vFmt(total(withheld,39)))]},
   {id:'trip',title:'The unfinished trip',day:39,body:`The report branch records Hana choosing (${departure.evidence.site.x}, ${departure.evidence.site.y}) on day 38, a six-step trip. At dusk on day 39 she is at (${earlyA.x}, ${earlyA.y}). She has not collected food on that trip.`,rows:[vRow('Daily movement','2 adjacent steps'),vRow('Hana’s gathering capacity',vFmt(vAgent(start).gatherRate)+' food'),vRow('Recorded destination','(20, 3)'),vRow('Day-39 position','(19, 4)')],location:{x:20,y:3}},
   {id:'near-receipt',title:'The shorter trip’s receipt',day:39,body:`The withheld branch reaches (18, 11) on day 39 and gathers ${vFmt(total(withheld,39))} food.`,rows:[vRow('Collection day','39'),vRow('Collection site','(18, 11)')],location:{x:18,y:11}},
   {id:'report',title:'The earlier stock count',day:37,body:`June conveys a day-37 observation of ${vFmt(report.evidence.reportedStock)} food at (18, 11). A dated count does not freeze future growth or consumption.`,rows:[vRow('Message day','37'),vRow('Observed day',report.evidence.observedDay),vRow('Site','(18, 11)')],location:{x:18,y:11}}
  ],
  hypotheses:[{id:'persistent',label:'The longer trip’s collection still leaves the report branch behind on day 40.'},{id:'window',label:'The longer trip’s later collection overtakes the earlier collection on day 40.'},{id:'tied',label:'The later collection makes up exactly the gap: the inventories tie on day 40.'}],
  predictions:[{id:'report-ahead',label:'The report branch has more private food at the selected date.'},{id:'withheld-ahead',label:'The withheld branch has more private food at the selected date.'},{id:'tied',label:'The branches have equal private food at the selected date.'},{id:'uncertain',label:'I’m not sure yet; inspect the selected date.'}],
  map:{width:start.width,height:start.height,cells:start.cells.map(({x,y,terrain,resource})=>({x,y,terrain,resource})),markers:[{x:19,y:8,label:'Hana at the checkpoint'},{x:18,y:11,label:'Shorter-trip grove'},{x:20,y:3,label:'Recorded longer-trip destination'}],bridge:{...start.bridge}},
  reconstruction:{prompt:'Choose a measurement date for the same controlled pair.',options},
  solution:{hypothesis:'window',prediction:'report-ahead',requiredTests:['through-40'],evidencePairs:[['early-tally','trip'],['trip','near-receipt'],['trip','report'],['early-tally','near-receipt']],requiredFeedback:'The question concerns day 40. Repeating the supplied day-39 measurement cannot settle the next-day ranking.',
   contradiction:attempt=>attempt.testedIds.includes('through-40')?'On day 40 Hana completes the longer trip and has more private food in the report branch. The supplied day-39 lead did not persist to that date.':'Observe day 40 before deciding whether the day-39 ranking persists. The earlier tally cannot settle a later observation.',
   explanation:'The day-39 comparison catches one branch after collection and the other while still traveling. On day 40 Hana reaches (20, 3) and gathers 5.96 food, ending with 12.76; the withheld branch has 11.80. The ranking reverses across these two dates. This demonstrates sensitivity to the observation window, not permanent harm from messages, optimal planning or a general information benefit.',
   timeline:['Day 37: a fresh depletion report reaches Hana in one branch.','Day 38: the branches choose different food trips.','Day 39: the shorter trip has yielded 5.00 food; the longer trip is still underway.','Day 40: the longer trip yields 5.96 food. Private-stock ranking reverses.']},
  getComparison:(id='through-40')=>{const pair=pairs.get(id);if(!pair)throw Error('Choose an available measurement date.');return cloneWorld(pair);}
 };
}
