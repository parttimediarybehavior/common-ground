// Experimental rule-driven world. No LLM output changes physical state.
// Random draws are keyed, so interventions cannot shift a global random stream.
function draw(seed, day, id, purpose) {
  let h = 2166136261;
  for (const ch of `${seed}:${day}:${id}:${purpose}`) { h ^= ch.charCodeAt(0); h = Math.imul(h,16777619); }
  h ^= h >>> 16; h = Math.imul(h,2246822507); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}
const names = ['Ada','Bram','Cleo','Dara','Eli','Fern','Gus','Hana','Ivo','June','Kit','Luz','Moss','Nell','Orin','Pip'];
const key = (p,w) => p.y*w.width+p.x;
const distance = (a,b) => Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
const foodIn = w => w.cells.reduce((n,c)=>n+(c.resource==='food'?c.stock:0),0)+w.agents.reduce((n,a)=>n+a.food,0)+w.settlements.reduce((n,s)=>n+s.food,0);
const woodIn = w => w.cells.reduce((n,c)=>n+(c.resource==='wood'?c.stock:0),0)+w.agents.reduce((n,a)=>n+a.wood,0);

export function createWorld(seed=42, options={}) {
  if (!Number.isSafeInteger(Number(seed))) throw new Error('Seed must be a safe integer.');
  const w={version:1,seed:Number(seed),day:0,width:24,height:16,cells:[],agents:[],
    settlements:[{id:0,name:'Mossbank',x:4,y:8,food:8},{id:1,name:'Sunreach',x:19,y:8,food:8}],
    bridge:{x:11,y:8,open:true,repair:0,required:18},drought:null,events:[],blockedReports:[],
    ledger:{initialFood:0,produced:0,consumed:0,lost:0,initialWood:0,woodProduced:0,woodUsed:0},
    statistics:{travel:0,foodGathered:0,emptyArrivals:0,reports:0,harvests:0,observations:0},
    options:{memory:true,sharing:true,travelSteps:2,knowledge:'oracle',...options}};
  if(!['oracle','local','reports'].includes(w.options.knowledge))throw new Error('Unknown knowledge mode.');
  if (!Number.isInteger(w.options.travelSteps)||w.options.travelSteps<1||w.options.travelSteps>8) throw new Error('Travel steps must be 1–8.');
  for(let y=0;y<w.height;y++)for(let x=0;x<w.width;x++) {
    const river=x===11||x===12;
    const coast=x===0||x===23||y===0||y===15||((x<3||x>20)&&(y<3||y>12));
    w.cells.push({x,y,terrain:river||coast?'water':'land',resource:null,stock:0,capacity:0});
  }
  const foods=[[3,3],[5,4],[7,3],[8,6],[3,11],[6,12],[15,3],[17,4],[20,3],[15,6],[18,11],[21,12]];
  const woods=[[2,6],[4,5],[7,10],[9,11],[6,6],[8,13],[14,10],[16,12],[20,6],[21,9]];
  for(const [x,y] of foods) Object.assign(w.cells[key({x,y},w)],{resource:'food',stock:18,capacity:24});
  for(const [x,y] of woods) Object.assign(w.cells[key({x,y},w)],{resource:'wood',stock:8,capacity:14});
  w.agents=names.map((name,id)=>{
    const home=id%2, s=w.settlements[home];
    return {id,name,x:s.x+(id%3)-1,y:s.y+(Math.floor(id/3)%3)-1,home,
      food:7+draw(w.seed,0,id,'provisions')*3,wood:0,health:100,alive:true,
      action:'Arriving',reason:'Choosing how to make a living on the island.',target:null,
      contributions:0,received:0,helped:{},memories:[],
      known:{},seen:{},willingness:0.25+draw(w.seed,0,id,'willingness')*0.55,
      gatherRate:4.8+draw(w.seed,0,id,'skill')*1.6,missedMeals:0};
  });
  w.ledger.initialFood=foodIn(w);w.ledger.initialWood=woodIn(w);
  record(w,'arrival','Sixteen inhabitants arrive. Food grows on both banks; the west has more timber.',null,null,null,{population:16});
  for(const a of w.agents)observe(w,a);
  return w;
}

function observe(w,a) {
  const order=++w.statistics.observations;
  for(const c of w.cells)if(w.options.knowledge==='oracle'||distance(a,c)<=2) {
    a.seen[key(c,w)]=w.day;
    if(c.resource)a.known[key(c,w)]={x:c.x,y:c.y,resource:c.resource,stock:c.stock,seenAt:w.day,order,source:a.id,via:null};
  }
}
function believedStock(w,a,c) {
  if(w.options.knowledge==='oracle')return c.stock;
  const report=a.known[key(c,w)];if(!report)return 0;
  const dry=w.drought&&c.x<11?.08:1;
  const growth=c.resource==='food'?(c.x<11?1.9:2.4)*(1+.35*Math.sin(w.day*Math.PI/40))*dry:(c.x<11?.22:.1);
  return Math.min(c.capacity,report.stock+Math.max(0,w.day-report.seenAt)*growth);
}
function exchangeReports(w,a) {
  if(w.options.knowledge!=='reports')return;
  for(const b of w.agents)if(b.alive&&b.id!==a.id&&distance(a,b)<=2) {
    const candidates=Object.entries(a.known).filter(([k,r])=>!b.known[k]||r.seenAt>b.known[k].seenAt||(r.seenAt===b.known[k].seenAt&&(r.order??0)>(b.known[k].order??0)&&Math.abs(r.stock-b.known[k].stock)>1e-9))
      .sort(([,r],[,s])=>s.seenAt-r.seenAt||(s.order??0)-(r.order??0)||r.y-s.y||r.x-s.x);
    const first=candidates[0];if(!first)continue;
    if(w.blockedReports.some(block=>block.day===w.day&&block.actor===a.id&&block.target===b.id)) {
      const [,r]=first;record(w,'report-blocked',`You withhold ${a.name}'s report to ${b.name}.`,a.id,b.id,{x:a.x,y:a.y},
        {site:{x:r.x,y:r.y},reportedStock:r.stock,observedDay:r.seenAt,originalObserver:r.source});continue;
    }
    const [k,r]=first;b.known[k]={...r,via:a.id};w.statistics.reports++;
    record(w,'report',`${a.name} tells ${b.name} about ${r.stock.toFixed(1)} ${r.resource} observed on day ${r.seenAt}.`,a.id,b.id,{x:a.x,y:a.y},
      {site:{x:r.x,y:r.y},resource:r.resource,reportedStock:r.stock,observedDay:r.seenAt,observedOrder:r.order??0,originalObserver:r.source});
  }
}

function passable(w,p) {
  if(p.x<0||p.y<0||p.x>=w.width||p.y>=w.height)return false;
  const c=w.cells[key(p,w)];
  return c.terrain==='land'||(w.bridge.open&&p.y===w.bridge.y&&(p.x===w.bridge.x||p.x===w.bridge.x+1));
}
function reachable(w, from) {
  if(!passable(w,from))return {parents:new Map(),distances:new Map()};
  const start=key(from,w),parents=new Map([[start,null]]),distances=new Map([[start,0]]),queue=[from];
  for(let i=0;i<queue.length;i++) {
    const p=queue[i];
    for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]) {
      const q={x:p.x+dx,y:p.y+dy},k=key(q,w);
      if(passable(w,q)&&!parents.has(k)) {parents.set(k,key(p,w));distances.set(k,distances.get(key(p,w))+1);queue.push(q);}
    }
  }
  return {parents,distances};
}
function reconstruct(w,from,to,parents) {
  let k=key(to,w),start=key(from,w);if(!parents.has(k))return null;
  const points=[];
  while(k!==start){points.push({x:k%w.width,y:Math.floor(k/w.width)});k=parents.get(k);}
  return points.reverse();
}
export function findPath(w,from,to) {return reconstruct(w,from,to,reachable(w,from).parents);}
function record(w,type,text,actor=null,target=null,location=null,evidence={}) {
  const e={id:w.events.length+1,day:w.day,type,text,actor,target,location,evidence};w.events.push(e);return e;
}
function remember(w,a,e,text=e.text) {
  if(w.options.memory){a.memories.push({day:w.day,eventId:e.id,text});if(a.memories.length>12)a.memories.shift();}
}
function move(w,a,to,path) {
  const route=path??findPath(w,a,to);a.target={x:to.x,y:to.y};
  if(!route)return false;
  const last=route[Math.min(w.options.travelSteps,route.length)-1];
  w.statistics.travel+=Math.min(w.options.travelSteps,route.length);
  if(last){a.x=last.x;a.y=last.y;}
  return a.x===to.x&&a.y===to.y;
}
function work(w,a,resource) {
  const reach=reachable(w,a);let best=null,score=-Infinity;
  // Keep a viable plan instead of oscillating between patches every day.
  if(a.target&&a.action===(resource==='food'?'Foraging':'Gathering timber')) {
    const planned=w.cells[key(a.target,w)];
    if(planned?.resource===resource&&believedStock(w,a,planned)>=.4&&reach.distances.has(key(planned,w)))best=planned;
  }
  if(!best)
  for(const c of w.cells) if(c.resource===resource&&believedStock(w,a,c)>=0.4&&reach.distances.has(key(c,w))) {
    const d=reach.distances.get(key(c,w));
    const value=Math.min(believedStock(w,a,c),resource==='food'?a.gatherRate:3)/(1+d/w.options.travelSteps)
      +draw(w.seed,w.day,a.id,`site:${c.x}:${c.y}`)*0.18;
    if(value>score){best=c;score=value;}
  }
  if(!best){
    const frontier=w.cells.filter(c=>c.terrain==='land'&&reach.distances.has(key(c,w)))
      .sort((b,c)=>(a.seen[key(b,w)]??-1)-(a.seen[key(c,w)]??-1)||reach.distances.get(key(b,w))-reach.distances.get(key(c,w))||b.y-c.y||b.x-c.x)[0];
    a.action='Exploring';a.reason=`No known reachable ${resource} patch looks productive; checking an unobserved or older area.`;
    if(frontier)move(w,a,frontier,reconstruct(w,a,frontier,reach.parents));else a.target=null;return;
  }
  a.action=resource==='food'?'Foraging':'Gathering timber';
  a.reason=resource==='food'?`Choosing food by ${w.options.knowledge==='oracle'?'current stocks':'dated observations'}, expected yield and travel cost.`:'Gathering real timber for the broken bridge.';
  const belief=believedStock(w,a,best);
  const report=a.known[key(best,w)];
  if(!a.target||a.target.x!==best.x||a.target.y!==best.y)record(w,'destination',`${a.name} heads toward ${resource} at (${best.x}, ${best.y}).`,a.id,null,{x:a.x,y:a.y},
    {site:{x:best.x,y:best.y},resource,believedStock:belief,steps:reach.distances.get(key(best,w)),knowledge:w.options.knowledge,
      observation:report?{day:report.seenAt,order:report.order??0,source:report.source,via:report.via}:null});
  if(move(w,a,best,reconstruct(w,a,best,reach.parents))) {
    const amount=Math.min(best.stock,resource==='food'?Math.min(a.gatherRate,14-a.food):3);
    const actual=best.stock;best.stock-=amount;a[resource]+=amount;a.target=null;w.statistics.harvests++;
    if(resource==='food')w.statistics.foodGathered+=amount;
    if(amount<.4){w.statistics.emptyArrivals++;record(w,'empty-arrival',`${a.name} finds too little ${resource} at a patch that looked productive.`,a.id,null,{x:a.x,y:a.y},{resource,amount,believedStock:belief,actualStock:actual});}
    else record(w,'gather',`${a.name} gathers ${amount.toFixed(1)} ${resource}.`,a.id,null,{x:a.x,y:a.y},{resource,amount,believedStock:belief,actualStock:actual,knowledge:w.options.knowledge,
      observation:report?{day:report.seenAt,order:report.order??0,source:report.source,via:report.via}:null});
    a.known[key(best,w)]={x:best.x,y:best.y,resource:best.resource,stock:best.stock,seenAt:w.day,order:++w.statistics.observations,source:a.id,via:null};
  }
}
function socialAction(w,a) {
  if(!w.options.sharing)return false;
  const s=w.settlements[a.home];
  const pantryPath=a.food<2.3&&s.food>.5?findPath(w,a,s):null;
  const nearerMeal=pantryPath&&w.cells.some(c=>c.resource==='food'&&believedStock(w,a,c)>=.9&&(findPath(w,a,c)?.length??Infinity)<pantryPath.length);
  if(pantryPath&&!nearerMeal) {
    a.action='Seeking pantry food';a.reason='Own food is low; the shared store still holds food.';
    if(move(w,a,s,pantryPath)) {
      const amount=Math.min(4,s.food);s.food-=amount;a.food+=amount;a.received+=amount;
      const e=record(w,'withdraw',`${a.name} takes ${amount.toFixed(1)} meals from ${s.name}'s pantry.`,a.id,null,{x:a.x,y:a.y},{amount,pantryAfter:s.food});remember(w,a,e);
    }
    return true;
  }
  if(a.food>4.8) {
    const nearby=w.agents.filter(b=>b.alive&&b.id!==a.id&&b.food<2.2&&distance(a,b)<=2)
      .sort((b,c)=>(a.helped[c.id]??0)-(a.helped[b.id]??0)||b.food-c.food||b.id-c.id);
    const b=nearby[0];
    if(b) {
      const remembered=w.options.memory?(a.helped[b.id]??0):0;
      if(draw(w.seed,w.day,a.id,'help')<a.willingness+Math.min(.6,remembered*.18)) {
        if((w.omittedGifts??[]).some(entry=>entry.day===w.day&&entry.actor===a.id&&entry.target===b.id)) {
          a.action='Gift omitted';a.reason='This controlled reconstruction retains supplies and spends the chosen sharing workday.';a.target=null;
          record(w,'gift-omitted',`You omit ${a.name}'s gift to ${b.name}, retaining food and spending the workday.`,a.id,b.id,{x:a.x,y:a.y},
            {plannedAmount:Math.min(2.8,a.food-3),donorFoodBefore:a.food,recipientFoodBefore:b.food});
          return true;
        }
        const amount=Math.min(2.8,a.food-3);a.food-=amount;b.food+=amount;b.received+=amount;
        if(w.options.memory)b.helped[a.id]=(b.helped[a.id]??0)+1;
        a.action='Sharing food';a.reason=remembered?'Returning help remembered from this inhabitant.':'A nearby inhabitant is short of food and I have a margin.';a.target=null;
        const e=record(w,'gift',`${a.name} gives ${b.name} ${amount.toFixed(1)} meals${remembered?' after remembering earlier help':''}.`,a.id,b.id,{x:a.x,y:a.y},{amount,rememberedHelp:remembered});remember(w,a,e);remember(w,b,e);return true;
      }
    }
  }
  if(a.food>9&&s.food<18&&draw(w.seed,w.day,a.id,'deposit')<a.willingness) {
    a.action='Stocking pantry';a.reason='Keeping a personal buffer and contributing the surplus.';
    if(move(w,a,s)){const amount=Math.min(4,a.food-6,18-s.food);a.food-=amount;s.food+=amount;a.contributions+=amount;
      const e=record(w,'deposit',`${a.name} puts ${amount.toFixed(1)} meals in ${s.name}'s pantry.`,a.id,null,{x:a.x,y:a.y},{amount,pantryAfter:s.food});remember(w,a,e);}
    return true;
  }
  return false;
}
function choose(w,a) {
  if(a.food<2.3&&socialAction(w,a))return;
  if(a.food<4){work(w,a,'food');return;}
  if(socialAction(w,a))return;
  if(!w.bridge.open&&a.food>4&&draw(w.seed,w.day,a.id,'repair')<0.18+a.willingness*.5) {
    if(a.wood<1){work(w,a,'wood');return;}
    const shore={x:a.x<w.bridge.x?w.bridge.x-1:w.bridge.x+2,y:w.bridge.y};
    a.action='Repairing bridge';a.reason='Spending timber and a workday to reconnect the banks.';
    if(move(w,a,shore)) {
      if((w.omittedRepairs??[]).some(entry=>entry.day===w.day&&entry.actor===a.id)) {
        a.action='Repair omitted';a.reason='This controlled reconstruction retains the timber and omits this repair.';
        record(w,'repair-omitted',`You omit ${a.name}'s repair contribution, retaining the timber.`,a.id,null,shore,{availableWood:a.wood,repairBefore:w.bridge.repair});
        return;
      }
      const amount=Math.min(3,a.wood,w.bridge.required-w.bridge.repair);a.wood-=amount;w.bridge.repair+=amount;w.ledger.woodUsed+=amount;
      const e=record(w,'repair',`${a.name} adds ${amount.toFixed(1)} timber to the bridge (${w.bridge.repair.toFixed(0)}/${w.bridge.required}).`,a.id,null,shore,{amount,repairAfter:w.bridge.repair});remember(w,a,e);
      if(w.bridge.repair>=w.bridge.required-1e-9){w.bridge.open=true;record(w,'bridge-open','The banks reconnect after inhabitants contribute eighteen timber.',null,null,shore,{repair:w.bridge.repair});}
    }
    return;
  }
  if(a.food>10) {
    a.action='Resting';a.reason='Food is sufficient; returning home instead of hoarding.';
    move(w,a,w.settlements[a.home]);return;
  }
  work(w,a,'food');
}
export function stepWorld(w,onAction) {
  if(onAction!==undefined&&typeof onAction!=='function')throw new Error('Action observer must be a function.');
  w.day++;
  const growthSeason=1+0.35*Math.sin(w.day*Math.PI/40);
  if(w.drought&&w.day>w.drought.until){w.drought=null;record(w,'weather','The west-bank drought ends.');}
  for(const c of w.cells) {
    if(c.resource==='food') {
      const dry=w.drought&&c.x<11?0.08:1;
      const amount=Math.min(c.capacity-c.stock,(c.x<11?1.9:2.4)*growthSeason*dry);
      c.stock+=amount;w.ledger.produced+=amount;
    } else if(c.resource==='wood'){const amount=Math.min(c.capacity-c.stock,c.x<11?.22:.1);c.stock+=amount;w.ledger.woodProduced+=amount;}
  }
  const order=w.agents.filter(a=>a.alive).sort((a,b)=>draw(w.seed,w.day,a.id,'order')-draw(w.seed,w.day,b.id,'order')||a.id-b.id);
  // Local decisions use morning observations; later competition can empty a patch.
  for(const a of order)observe(w,a);
  for(const a of order) {
    // Looking again before acting is available equally with or without reports.
    observe(w,a);
    if(onAction)onAction({day:w.day,actor:a.id,phase:'before-action',
      agents:w.agents.map(({id,name,x,y,food,wood,alive})=>({id,name,x,y,food,wood,alive})),
      cells:w.cells.filter(c=>c.resource).map(({x,y,resource,stock})=>({x,y,resource,stock}))});
    choose(w,a);
    exchangeReports(w,a);
    const meal=Math.min(.9,a.food);a.food-=meal;w.ledger.consumed+=meal;
    if(meal<.9-1e-9){a.health=Math.max(0,a.health-9*(.9-meal)/.9);a.missedMeals++;
      if(a.missedMeals===1||a.missedMeals%5===0){const e=record(w,'hunger',`${a.name} misses a full meal (${a.health.toFixed(0)} health).`,a.id,null,{x:a.x,y:a.y},{meal,health:a.health,missedMeals:a.missedMeals});remember(w,a,e);}
    } else {a.health=Math.min(100,a.health+2.5);a.missedMeals=0;}
    if(a.health<=0){a.alive=false;a.action='Died';a.reason='Health reached zero after missed meals.';
      w.ledger.lost+=a.food;w.ledger.woodUsed+=a.wood;a.food=0;a.wood=0;a.target=null;
      record(w,'death',`${a.name} dies after food shortages.`,a.id,null,{x:a.x,y:a.y},{health:0});}
  }
  return w;
}
export function advance(w,days,onAction) {
  if(!Number.isInteger(days)||days<0||days>1000)throw new Error('Advance must be 0–1000 days.');
  if(onAction!==undefined&&typeof onAction!=='function')throw new Error('Action observer must be a function.');
  for(let i=0;i<days;i++)stepWorld(w,onAction);return w;
}
export function cloneWorld(w) {return JSON.parse(JSON.stringify(w));}
export function applyIntervention(w,type,details={}) {
  if(!['drought','bridge','forget','rain','local','reports','oracle','block-report','skip-repair','skip-gift','forget-helper'].includes(type))throw new Error('Unknown intervention.');
  if(type==='skip-gift') {
    if(!details||!Number.isSafeInteger(details.day)||details.day<=w.day||details.day>1000||!Number.isInteger(details.actor)||!Number.isInteger(details.target)||details.actor===details.target
      ||!w.agents.some(a=>a.id===details.actor)||!w.agents.some(a=>a.id===details.target))throw new Error('Invalid future gift.');
    if((w.omittedGifts??[]).some(e=>e.day===details.day&&e.actor===details.actor&&e.target===details.target))throw new Error('Gift omission already scheduled.');
    const entry={day:details.day,actor:details.actor,target:details.target};
    (w.omittedGifts??=[]).push(entry);
    record(w,'intervention',`You arrange to omit one chosen gift on day ${entry.day}, retaining its food and spending its workday.`,null,null,null,{intervention:type,...entry});
  }
  if(type==='skip-repair') {
    if(!details||!Number.isSafeInteger(details.day)||details.day<=w.day||details.day>1000||!Number.isInteger(details.actor)||!w.agents.some(a=>a.id===details.actor))throw new Error('Invalid future repair.');
    if((w.omittedRepairs??[]).some(e=>e.day===details.day&&e.actor===details.actor))throw new Error('Repair omission already scheduled.');
    const entry={day:details.day,actor:details.actor};
    (w.omittedRepairs??=[]).push(entry);
    record(w,'intervention',`You arrange to omit one repair on day ${entry.day}.`,null,null,null,{intervention:type,...entry});
  }
  if(type==='forget-helper') {
    const actor=w.agents.find(a=>a.id===details?.actor),helper=w.agents.find(a=>a.id===details?.helper);
    if(!actor||!helper||actor.id===helper.id||!Number.isInteger(details.actor)||!Number.isInteger(details.helper))throw new Error('Invalid helper-memory reconstruction.');
    const removed=actor.helped[helper.id]??0;delete actor.helped[helper.id];
    actor.memories=actor.memories.filter(m=>{const e=w.events[m.eventId-1];return !(e?.type==='gift'&&e.actor===helper.id&&e.target===actor.id);});
    record(w,'intervention',`You remove ${actor.name}'s remembered help from ${helper.name}, retaining supplies and history.`,actor.id,helper.id,{x:actor.x,y:actor.y},
      {intervention:type,actor:actor.id,helper:helper.id,removedInstances:removed});
  }
  if(type==='block-report') {
    if(!details||!Number.isSafeInteger(details.day)||details.day<=w.day||details.day>1000||!Number.isInteger(details.actor)||!Number.isInteger(details.target)||details.actor===details.target
      ||!w.agents.some(a=>a.id===details.actor)||!w.agents.some(a=>a.id===details.target))throw new Error('Invalid future conversation.');
    const block={day:details.day,actor:details.actor,target:details.target};
    if(w.blockedReports.some(b=>b.day===block.day&&b.actor===block.actor&&b.target===block.target))throw new Error('Conversation already scheduled.');
    w.blockedReports.push(block);record(w,'intervention',`You arrange to withhold one report on day ${block.day}.`,null,null,null,{intervention:type,...block});
  }
  if(['local','reports','oracle'].includes(type)) {
    if(w.options.knowledge==='oracle')for(const a of w.agents)observe(w,a);
    w.options.knowledge=type;record(w,'intervention',`You change patch knowledge to ${type==='oracle'?'current global stocks':type==='local'?'local observations':'local observations with nearby reports'}.`,null,null,null,{intervention:type});
  }
  if(type==='drought'){w.drought={side:0,until:w.day+45};record(w,'intervention','You start a 45-day west-bank drought.',null,null,null,{intervention:type,until:w.drought.until});}
  if(type==='bridge') {
    w.bridge.open=false;w.bridge.repair=0;
    for(const a of w.agents)if(a.alive&&a.y===w.bridge.y&&(a.x===w.bridge.x||a.x===w.bridge.x+1)) {
      const previous={x:a.x,y:a.y};a.x=a.x===w.bridge.x?w.bridge.x-1:w.bridge.x+2;
      record(w,'evacuate',`${a.name} steps off the collapsing bridge.`,a.id,null,{x:a.x,y:a.y},{from:previous,to:{x:a.x,y:a.y}});
    }
    record(w,'intervention','You break the bridge. Only real timber and work can reconnect the banks.',null,null,{x:w.bridge.x,y:w.bridge.y},{intervention:type});
  }
  if(type==='forget'){w.options.memory=false;for(const a of w.agents){a.helped={};a.memories=[];}record(w,'intervention','You erase remembered help; inhabitants retain their possessions.',null,null,null,{intervention:type});}
  if(type==='rain'){w.drought=null;record(w,'intervention','You end the drought.',null,null,null,{intervention:type});}
  return w;
}
export function summarize(w) {
  const living=w.agents.filter(a=>a.alive),food=foodIn(w),wood=woodIn(w);
  return {day:w.day,alive:living.length,population:w.agents.length,food,pantry:w.settlements.reduce((n,s)=>n+s.food,0),
    meanHealth:living.length?living.reduce((n,a)=>n+a.health,0)/living.length:0,
    gifts:w.events.filter(e=>e.type==='gift').length,contributions:w.agents.reduce((n,a)=>n+a.contributions,0),
    withdrawals:w.events.filter(e=>e.type==='withdraw').length,bridgeOpen:w.bridge.open,bridgeRepair:w.bridge.repair,
    foodBalanceError:food+w.ledger.consumed+w.ledger.lost-w.ledger.initialFood-w.ledger.produced,
    woodBalanceError:wood+w.ledger.woodUsed-w.ledger.initialWood-w.ledger.woodProduced,
    travelSteps:w.statistics.travel,totalFoodGathered:w.statistics.foodGathered,emptyArrivals:w.statistics.emptyArrivals,reports:w.statistics.reports};
}
