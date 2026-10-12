import { createWorld, summarize } from './engine.js';

export const MAX_SAVE_BYTES = 64 * 1024 * 1024;

const finite = n => typeof n === 'number' && Number.isFinite(n);
const bounded = (n, low, high = Number.MAX_SAFE_INTEGER) => finite(n) && n >= low && n <= high;
const integer = (n, low = 0, high = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= low && n <= high;
const object = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = v => typeof v === 'string' && v.length <= 10000;
const point = p => object(p) && integer(p.x, 0, 23) && integer(p.y, 0, 15);
const require = (condition, message) => { if (!condition) throw new Error(message); };

// Evidence is retained as JSON, with finite numbers and modest nesting limits.
function validEvidence(value, depth = 0, budget = { remaining: 1000 }) {
  if (--budget.remaining < 0 || depth > 8) return false;
  if (value === null || typeof value === 'boolean') return true;
  if (typeof value === 'number') return finite(value);
  if (typeof value === 'string') return text(value);
  if (Array.isArray(value)) return value.every(v => validEvidence(v, depth + 1, budget));
  return object(value) && Object.entries(value).every(([key, v]) =>
    !['__proto__', 'constructor', 'prototype'].includes(key) && validEvidence(v, depth + 1, budget));
}

export function validateWorld(w) {
  require(object(w) && w.version === 1 && w.width === 24 && w.height === 16 &&
    Number.isSafeInteger(w.seed) && integer(w.day, 0, Number.MAX_SAFE_INTEGER - 45), 'Unsupported world format.');
  require(object(w.options) && typeof w.options.memory === 'boolean' &&
    typeof w.options.sharing === 'boolean' && integer(w.options.travelSteps, 1, 8) &&
    ['oracle', 'local', 'reports'].includes(w.options.knowledge), 'Invalid world settings.');
  require(object(w.statistics) && integer(w.statistics.observations), 'Invalid observation counter.');
  const initial = createWorld(w.seed, w.options);
  require(Array.isArray(w.cells) && w.cells.length === 384, 'Invalid map size.');
  w.cells.forEach((c, index) => {
    const original = initial.cells[index];
    require(point(c) && c.x === original.x && c.y === original.y && c.terrain === original.terrain &&
      c.resource === original.resource && c.capacity === original.capacity && bounded(c.stock, 0, c.capacity),
    'Invalid map order, resource, or stock.');
  });
  require(Array.isArray(w.settlements) && w.settlements.length === 2, 'Invalid settlements.');
  w.settlements.forEach((s, index) => {
    const original = initial.settlements[index];
    require(point(s) && s.id === index && s.x === original.x && s.y === original.y && text(s.name) &&
      bounded(s.food, 0), 'Invalid settlement order or food.');
  });
  require(object(w.bridge) && w.bridge.x === 11 && w.bridge.y === 8 && w.bridge.required === 18 &&
    typeof w.bridge.open === 'boolean' && bounded(w.bridge.repair, 0, 18) &&
    (w.bridge.open || w.bridge.repair < 18), 'Invalid bridge state.');
  require(w.drought === null || (object(w.drought) && w.drought.side === 0 &&
    integer(w.drought.until, w.day, Number.MAX_SAFE_INTEGER)), 'Invalid drought state.');
  require(Array.isArray(w.agents) && w.agents.length === initial.agents.length, 'Invalid resident population.');
  const ids = new Set(w.agents.map(a => a?.id));
  require(ids.size === w.agents.length && [...ids].every(id => integer(id, 0, 15)), 'Invalid resident IDs.');
  const actor = id => id === null || ids.has(id);
  require(Array.isArray(w.events) && w.events.length > 0 && w.events.length <= 100000, 'Invalid event log.');
  let previousDay = 0;
  w.events.forEach((e, index) => {
    require(object(e) && e.id === index + 1 && integer(e.day, previousDay, w.day) && text(e.type) &&
      text(e.text) && actor(e.actor) && actor(e.target) && (e.location === null || point(e.location)) &&
      object(e.evidence) && validEvidence(e.evidence), 'Invalid event provenance or evidence.');
    previousDay = e.day;
  });
  require(Array.isArray(w.blockedReports) && w.blockedReports.length <= w.events.length,
    'Missing or invalid withheld-report schedule.');
  const conversationKey = b => `${b.day}:${b.actor}:${b.target}`;
  const scheduled = new Map();
  for (const block of w.blockedReports) {
    require(object(block) && integer(block.day, 1, 1000) && ids.has(block.actor) && ids.has(block.target) &&
      block.actor !== block.target && !scheduled.has(conversationKey(block)), 'Invalid or duplicate conversation schedule.');
    scheduled.set(conversationKey(block), { block, announced: 0, withheld: 0 });
  }
  for (const event of w.events) {
    if (event.type === 'intervention' && event.evidence.intervention === 'block-report') {
      const schedule = scheduled.get(conversationKey(event.evidence));
      require(schedule && event.evidence.day === schedule.block.day && event.evidence.actor === schedule.block.actor &&
        event.evidence.target === schedule.block.target && event.day < schedule.block.day && ++schedule.announced === 1,
        'Conversation schedule does not match its recorded intervention.');
    }
    if (event.type === 'report-blocked') {
      const schedule = scheduled.get(conversationKey(event));
      require(schedule && ++schedule.withheld === 1,
        'Withheld report does not match its scheduled day and participants.');
    }
  }
  require([...scheduled.values()].every(record => record.announced === 1),
    'Every conversation schedule must cite one recorded intervention.');
  const omissions=w.omittedRepairs===undefined?[]:w.omittedRepairs;
  require(Array.isArray(omissions)&&omissions.length<=w.events.length,'Invalid omitted-repair schedule.');
  const repairKey=e=>`${e.day}:${e.actor}`,repairSchedules=new Map();
  for(const entry of omissions){
    require(object(entry)&&integer(entry.day,1,1000)&&ids.has(entry.actor)&&!repairSchedules.has(repairKey(entry)),'Invalid or duplicate repair omission.');
    repairSchedules.set(repairKey(entry),{entry,announced:0,omitted:0});
  }
  for(const event of w.events){
    if(event.type==='intervention'&&event.evidence.intervention==='skip-repair'){
      const schedule=repairSchedules.get(repairKey(event.evidence));
      require(schedule&&event.day<schedule.entry.day&&++schedule.announced===1,'Repair omission lacks its matching recorded schedule.');
    }
    if(event.type==='repair-omitted'){
      const schedule=repairSchedules.get(repairKey(event));
      require(schedule&&++schedule.omitted===1,'Omitted repair does not match a scheduled work shift.');
    }
    if(event.type==='intervention'&&event.evidence.intervention==='forget-helper'){
      require(ids.has(event.evidence.actor)&&ids.has(event.evidence.helper)&&event.evidence.actor!==event.evidence.helper&&
        event.actor===event.evidence.actor&&event.target===event.evidence.helper&&integer(event.evidence.removedInstances,0,event.day),
        'Invalid helper-memory reconstruction.');
    }
  }
  require([...repairSchedules.values()].every(s=>s.announced===1),'Every repair omission must have one scheduling record.');
  const giftOmissions=w.omittedGifts===undefined?[]:w.omittedGifts,giftSchedules=new Map();
  require(Array.isArray(giftOmissions)&&giftOmissions.length<=w.events.length,'Invalid omitted-gift schedule.');
  for(const entry of giftOmissions){
    require(object(entry)&&integer(entry.day,1,1000)&&ids.has(entry.actor)&&ids.has(entry.target)&&entry.actor!==entry.target&&
      !giftSchedules.has(conversationKey(entry)),'Invalid or duplicate gift omission.');
    giftSchedules.set(conversationKey(entry),{entry,announced:0,omitted:0});
  }
  for(const event of w.events){
    if(event.type==='intervention'&&event.evidence.intervention==='skip-gift'){
      const schedule=giftSchedules.get(conversationKey(event.evidence));
      require(schedule&&event.evidence.day===schedule.entry.day&&event.evidence.actor===schedule.entry.actor&&event.evidence.target===schedule.entry.target&&
        event.day<schedule.entry.day&&++schedule.announced===1,'Gift omission lacks its matching recorded schedule.');
    }
    if(event.type==='gift-omitted'){
      const schedule=giftSchedules.get(conversationKey(event));
      require(schedule&&++schedule.omitted===1&&bounded(event.evidence.plannedAmount,0,2.8)&&bounded(event.evidence.donorFoodBefore,4.8,14)&&
        bounded(event.evidence.recipientFoodBefore,0,2.2),'Omitted gift does not match its scheduled handover.');
    }
  }
  require([...giftSchedules.values()].every(s=>s.announced===1),'Every gift omission must have one scheduling record.');
  for (const a of w.agents) {
    require(point(a) && text(a.name) && text(a.action) && text(a.reason) && typeof a.alive === 'boolean' &&
      integer(a.home, 0, 1) && bounded(a.food, 0) && bounded(a.wood, 0) && bounded(a.health, 0, 100) &&
      bounded(a.contributions, 0) && bounded(a.received, 0) && bounded(a.willingness, .25, .8) &&
      bounded(a.gatherRate, 4.8, 6.4) && integer(a.missedMeals, 0, w.day) &&
      (a.target === null || point(a.target)), 'Invalid resident decision fields or stores.');
    require(a.alive === (a.health > 0) && (a.alive || (a.food === 0 && a.wood === 0 && a.target === null)),
      'Invalid resident health state.');
    const standingCell = w.cells[a.y * w.width + a.x];
    require(!a.alive || standingCell.terrain === 'land' || (w.bridge.open && a.y === 8 && [11, 12].includes(a.x)),
      'Living resident occupies impassable water.');
    require(a.target === null || w.cells[a.target.y * w.width + a.target.x].terrain === 'land',
      'Resident target is not land.');
    require(object(a.known) && object(a.seen), 'Missing resident patch observations.');
    const cellIndex = index => String(Number(index)) === index && integer(Number(index), 0, 383);
    for (const [index, observation] of Object.entries(a.known)) {
      require(cellIndex(index) && point(observation), 'Invalid observation cell key or coordinates.');
      const cell = w.cells[Number(index)];
      require(cell.resource !== null && observation.x === cell.x && observation.y === cell.y &&
        observation.resource === cell.resource && bounded(observation.stock, 0, cell.capacity) &&
        integer(observation.seenAt, 0, w.day) && integer(observation.order, 1, w.statistics.observations) &&
        ids.has(observation.source) &&
        (observation.via === null || (ids.has(observation.via) && observation.via !== a.id)),
        'Invalid observed patch, stock, date, or source.');
      require(observation.via !== null || observation.source === a.id,
        'A personal observation must identify its observer.');
    }
    for (const [index, day] of Object.entries(a.seen))
      require(cellIndex(index) && integer(day, 0, w.day), 'Invalid seen cell or observation day.');
    require(object(a.helped) && Object.entries(a.helped).every(([id, count]) =>
      String(Number(id)) === id && ids.has(Number(id)) && Number(id) !== a.id && integer(count, 1, w.day)),
    'Invalid remembered help counts.');
    require(Array.isArray(a.memories) && a.memories.length <= 12, 'Invalid resident memories.');
    let previousMemoryDay = 0;
    for (const m of a.memories) {
      require(object(m) && integer(m.day, previousMemoryDay, w.day) && integer(m.eventId, 1, w.events.length) &&
        text(m.text), 'Invalid resident memory.');
      const e = w.events[m.eventId - 1];
      require(e.day === m.day && e.text === m.text && (e.actor === a.id || e.target === a.id), 'Memory references an unrelated event.');
      previousMemoryDay = m.day;
    }
    require(w.options.memory || (a.memories.length === 0 && Object.keys(a.helped).length === 0),
      'Disabled memory must be empty.');
  }
  require(object(w.ledger), 'Missing resource ledger.');
  for (const field of ['initialFood', 'produced', 'consumed', 'lost', 'initialWood', 'woodProduced', 'woodUsed'])
    require(bounded(w.ledger[field], 0), 'Invalid resource ledger.');
  require(object(w.statistics), 'Missing world statistics.');
  require(integer(w.statistics.travel, 0, Math.min(Number.MAX_SAFE_INTEGER, w.day * 16 * 8)) &&
    bounded(w.statistics.foodGathered, 0) && integer(w.statistics.emptyArrivals) &&
    integer(w.statistics.reports) && integer(w.statistics.harvests), 'Invalid world statistics.');
  const harvests = w.events.filter(e => e.type === 'gather' || e.type === 'empty-arrival');
  const gatheredFood = harvests.filter(e => e.evidence.resource === 'food')
    .reduce((sum, e) => sum + e.evidence.amount, 0);
  require(w.statistics.reports === w.events.filter(e => e.type === 'report').length &&
    w.statistics.emptyArrivals === w.events.filter(e => e.type === 'empty-arrival').length &&
    w.statistics.harvests === harvests.length && finite(gatheredFood) &&
    Math.abs(w.statistics.foodGathered - gatheredFood) <= 1e-5,
    'World statistics do not match recorded events.');
  const s = summarize(w);
  require(finite(s.foodBalanceError) && finite(s.woodBalanceError) &&
    Math.abs(s.foodBalanceError) <= 1e-5 && Math.abs(s.woodBalanceError) <= 1e-5, 'Resource ledger does not balance.');
  return w;
}

export function validateComparison(data) {
  require(object(data) && data.format === 'common-ground-comparison' && data.version === 1,
    'Choose a Common Ground comparison file.');
  validateWorld(data.baseline);
  validateWorld(data.experiment);
  require(data.baseline.seed === data.experiment.seed && data.baseline.day === data.experiment.day,
    'The two worlds must share a seed and day.');
  return data;
}

// Use the same UTF-8 limit for downloads and imports; compact JSON keeps long runs small.
export function serializeComparison(data) {
  validateComparison(data);
  const serialized = JSON.stringify(data);
  if (serialized.length > MAX_SAVE_BYTES || new TextEncoder().encode(serialized).byteLength > MAX_SAVE_BYTES)
    throw new Error('This comparison exceeds the 64 MiB save limit.');
  return serialized;
}
