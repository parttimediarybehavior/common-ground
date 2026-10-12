import { createCaseBook, judgeCase } from './cases.js';
import { serializeComparison } from './save.js';

const $ = id => document.getElementById(id);
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
const displayOrder = ['harvest', 'meal', 'detour', 'crossing', 'window'];
const book = [...createCaseBook()].sort((a, b) => displayOrder.indexOf(a.id) - displayOrder.indexOf(b.id));
const investigations = new Map(book.map(c => [c.id, {
  opened: new Set(), expanded: new Set(), pinned: new Set(),
  hypothesis: '', prediction: '', testId: '', testedIds: new Set(), recordedPredictions: new Map(), visualFrames: new Map(), orderedOpen: new Map(), resolved: false,
  feedback: '', highlight: null,
}]));
let currentId = book[0].id;
const currentCase = () => book.find(c => c.id === currentId);
const currentState = () => investigations.get(currentId);
const notice = text => { $('notice').textContent = text; };

function renderCovers() {
  const root = $('case-covers');
  root.replaceChildren();
  book.forEach((c, index) => {
    const state = investigations.get(c.id);
    const button = node('button', `case-cover${c.id === currentId ? ' active' : ''}`);
    button.type = 'button';
    button.dataset.caseId = c.id;
    button.setAttribute('aria-current', c.id === currentId ? 'page' : 'false');
    const copy = node('span', 'cover-copy');
    copy.append(node('strong', '', c.title), node('small', '', c.subtitle),
      node('span', 'cover-state', state.resolved ? 'RESOLVED ✓' : state.opened.size ? 'IN PROGRESS' : 'OPEN THE FILE'));
    button.append(node('span', 'cover-number', String(index + 1).padStart(2, '0')), copy);
    button.addEventListener('click', () => {
      currentId = c.id;
      notice('');
      renderCase();
      [...root.children].find(child => child.dataset.caseId === c.id)?.focus();
    });
    root.append(button);
  });
  $('folio-count').textContent = String(book.length).padStart(2, '0');
  $('progress').textContent = `${[...investigations.values()].filter(state => state.resolved).length} / ${book.length} cases resolved`;
}

function renderChoices(root, choices, kind) {
  const state = currentState();
  root.replaceChildren();
  choices.forEach(choice => {
    const label = node('label', 'choice');
    const input = node('input');
    input.type = 'radio';
    input.name = kind;
    input.value = choice.id;
    input.checked = state[kind] === choice.id;
    input.disabled = state.resolved;
    input.addEventListener('change', () => {
      state[kind] = choice.id;
      state.feedback = '';
      if (kind === 'prediction') renderTestResult();
      renderControls();
    });
    label.append(input, node('span', '', choice.label));
    root.append(label);
  });
}

function restoreClueFocus(id, pin = false) {
  const buttons = [...$('clue-cards').querySelectorAll(pin ? '.pin-button' : '.clue-toggle')];
  buttons.find(button => button.dataset.clueId === id)?.focus();
}

function togglePin(clue) {
  const state = currentState();
  if (state.pinned.has(clue.id)) state.pinned.delete(clue.id);
  else {
    if (state.pinned.size >= 2) {
      notice('Two clues are already pinned. Unpin one to choose another.');
      return;
    }
    state.pinned.add(clue.id);
  }
  state.feedback = '';
  notice(state.pinned.has(clue.id) ? `Pinned: ${clue.title}.` : `Unpinned: ${clue.title}.`);
  renderClues();
  renderPinned();
  renderControls();
}

function renderClues() {
  const c = currentCase(), state = currentState(), root = $('clue-cards');
  root.replaceChildren();
  c.clues.forEach((clue, index) => {
    const expanded = state.expanded.has(clue.id);
    const article = node('article', `clue-card${state.pinned.has(clue.id) ? ' pinned' : ''}`);
    const toggle = node('button', 'clue-toggle');
    toggle.type = 'button';
    toggle.dataset.clueId = clue.id;
    toggle.setAttribute('aria-expanded', String(expanded));
    const bodyId = `clue-body-${c.id}-${index}`;
    toggle.setAttribute('aria-controls', bodyId);
    toggle.append(node('small', '', `DAY ${clue.day}`), node('strong', '', clue.title),
      node('small', 'open-label', expanded ? '− Close note' : '+ Inspect note'));
    toggle.addEventListener('click', () => {
      if (expanded) state.expanded.delete(clue.id);
      else {
        state.expanded.add(clue.id);
        state.opened.add(clue.id);
        state.highlight = clue.location || null;
      }
      renderClues();
      renderCovers();
      drawMap();
      restoreClueFocus(clue.id);
    });
    const body = node('div', 'clue-body');
    body.id = bodyId;
    body.hidden = !expanded;
    // Only player-visible clue fields are rendered, never the underlying case object.
    if (expanded) {
      body.append(node('p', '', clue.body));
      if (clue.rows?.length) {
        const rows = node('dl', 'clue-rows');
        for (const row of clue.rows) {
          const line = node('div');
          line.append(node('dt', '', row.label), node('dd', '', row.value));
          rows.append(line);
        }
        body.append(rows);
      }
      const pin = node('button', 'pin-button', state.pinned.has(clue.id) ? '● Unpin clue' : '○ Pin clue');
      pin.type = 'button';
      pin.dataset.clueId = clue.id;
      pin.disabled = state.resolved;
      pin.setAttribute('aria-pressed', String(state.pinned.has(clue.id)));
      pin.addEventListener('click', () => { togglePin(clue); restoreClueFocus(clue.id, true); });
      body.append(pin);
    }
    article.append(toggle, body);
    root.append(article);
  });
  $('clue-progress').textContent = `${state.opened.size} / ${c.clues.length} inspected`;
}

function renderPinned() {
  const c = currentCase(), state = currentState(), root = $('pinned-clues');
  root.replaceChildren();
  $('pin-count').textContent = `${state.pinned.size} / 2`;
  if (!state.pinned.size) root.append(node('li', 'empty', 'Your supporting clues will go here.'));
  for (const id of state.pinned) {
    const clue = c.clues.find(item => item.id === id), item = node('li');
    item.append(node('span', '', clue.title));
    const remove = node('button', '', 'Unpin');
    remove.type = 'button';
    remove.disabled = state.resolved;
    remove.setAttribute('aria-label', `Unpin ${clue.title}`);
    remove.addEventListener('click', () => {
      togglePin(clue);
      $('pinned-clues').querySelector('button')?.focus();
    });
    item.append(remove);
    root.append(item);
  }
}

function selectedTest() {
  return currentCase().reconstruction.options.find(option => option.id === currentState().testId);
}

function renderReconstruction() {
  const c = currentCase(), state = currentState(), select = $('reconstruction-choice');
  const placeholder = node('option', '', 'Choose a controlled change…');
  placeholder.value = '';
  select.replaceChildren(placeholder);
  for (const option of c.reconstruction.options) {
    const item = node('option', '', option.label);
    item.value = option.id;
    select.append(item);
  }
  select.value = state.testId;
  select.disabled = state.resolved;
  const test = selectedTest();
  $('reconstruction-prompt').textContent = test ? test.prompt :
    'Choose what to change, then record a prediction. An uncertain prediction is welcome.';
  $('reconstruction-unchanged').replaceChildren(...(test?.unchanged || []).map(condition => node('li', '', condition)));
  $('reconstruction-unchanged').closest('details').hidden = !test;
  renderTestHistory();
  renderTestResult();
}

function renderTestHistory() {
  const c = currentCase(), state = currentState(), root = $('test-history');
  root.replaceChildren();
  if (!state.testedIds.size) return;
  root.append(node('p', 'detail-label', 'RECORDED RECONSTRUCTIONS'));
  const buttons = node('div', 'test-history-buttons');
  for (const id of state.testedIds) {
    const test = c.reconstruction.options.find(option => option.id === id);
    const button = node('button', '', test.label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(id === state.testId));
    button.addEventListener('click', () => {
      state.testId = id;
      state.feedback = '';
      renderReconstruction(); renderControls();
      $('reconstruction-choice').focus();
    });
    buttons.append(button);
  }
  root.append(buttons);
}

function renderControls() {
  const state = currentState(), tested = state.testedIds.has(state.testId);
  $('run-test').disabled = !state.testId || !state.prediction || tested || state.resolved;
  $('run-test').textContent = tested ? 'Result recorded' : 'Test this prediction';
  $('test-hint').textContent = state.resolved ? 'This case is resolved.' : tested ?
    'The actual result stays visible. Revise your conclusion if the evidence changes your mind.' :
    state.testId && state.prediction ? 'Your prediction will be recorded with this reconstruction.' :
    'Choose a reconstruction and record a prediction first. You can choose “uncertain”.';
  $('submit-case').disabled = !state.hypothesis || !state.prediction || !tested || state.pinned.size !== 2 || state.resolved;
  const missing = [];
  if (!state.hypothesis) missing.push('choose a cause');
  if (!state.testId) missing.push('choose a reconstruction');
  if (!state.prediction) missing.push('record a prediction');
  if (!tested) missing.push('run the chosen reconstruction');
  if (state.pinned.size !== 2) missing.push('pin two clues');
  $('submission-hint').textContent = state.resolved ? 'The causal chain is recorded below.' :
    missing.length ? `To submit: ${missing.join(', ')}.` : 'A cause, an observed result, and two supporting clues. Ready to submit.';
  $('feedback').textContent = state.feedback;
}

function renderTestResult() {
  const c = currentCase(), state = currentState(), root = $('test-result');
  root.replaceChildren();
  if (!state.testedIds.has(state.testId)) return;
  const original = c.predictions.find(item => item.id === state.recordedPredictions.get(state.testId));
  const current = c.predictions.find(item => item.id === state.prediction);
  root.append(node('p', 'recorded-prediction', `Before this reconstruction: ${original.label}`));
  if (current && current.id !== original.id)
    root.append(node('p', 'current-prediction', `Current conclusion: ${current.label}`));
  const result = selectedTest().result;
  root.append(node('h4', '', result.heading), node('p', '', result.body));
  const facts = node('dl');
  for (const fact of result.facts) {
    const row = node('div');
    row.append(node('dt', '', fact.label), node('dd', '', fact.value));
    facts.append(row);
  }
  root.append(facts);
  if (result.visual) renderVisual(root, result.visual);
  if (result.ordered?.length) renderOrdered(root, result.ordered, result.orderedNote);
}

function renderOrdered(root, branches, note) {
  const state = currentState(), testId = state.testId;
  if (!state.orderedOpen.has(testId)) state.orderedOpen.set(testId, new Set(currentCase().id === 'harvest' ? branches.map((_, i) => i) : []));
  const opened = state.orderedOpen.get(testId);
  const section = node('section', 'ordered-evidence');
  section.append(node('p', 'detail-label', 'THE ORDERED WORKDAYS'),
    node('p', 'ordered-note', note || 'These are before-choice snapshots. Residents who acted earlier have already eaten.'));
  branches.forEach((branch, index) => {
    const details = node('details', 'ordered-branch'); details.dataset.branchIndex = String(index);
    details.open = opened.has(index);
    details.addEventListener('toggle', () => {
      if (details.open) opened.add(index); else opened.delete(index);
    });
    details.append(node('summary', '', branch.title));
    const content = node('div', 'ordered-content'), steps = node('ol', 'ordered-steps');
    for (const step of branch.steps) {
      const item = node('li'); item.append(node('h5', '', step.heading));
      const rows = node('dl');
      for (const row of step.rows) {
        const line = node('div'); line.append(node('dt', '', row.label), node('dd', '', row.value)); rows.append(line);
      }
      item.append(rows); steps.append(item);
    }
    content.append(steps, node('p', 'detail-label', 'RECORDED RECEIPTS'));
    const receipts = node('ul', 'ordered-receipts');
    for (const receipt of branch.receipts) receipts.append(node('li', '', receipt));
    content.append(receipts); details.append(content); section.append(details);
  });
  root.append(section);
}

const quantity = number => Number(number).toLocaleString(undefined, { maximumFractionDigits: 2 });

function renderVisual(root, visual) {
  const state = currentState(), index = state.visualFrames.get(state.testId) ?? visual.recorded.length - 1;
  const section = node('section', 'replay-visual');
  section.append(node('p', 'detail-label', 'COMPARE THE RECORDED FRAMES'));
  const controls = node('div', 'frame-controls'), label = node('label', '', `Compare ${visual.subject} by day`);
  const input = node('input'), output = node('output', 'frame-day');
  input.type = 'range'; input.min = '0'; input.max = String(visual.recorded.length - 1); input.step = '1';
  input.value = String(index); input.id = `frame-day-${currentId}-${state.testId}`; label.htmlFor = input.id;
  output.setAttribute('for', input.id);
  controls.append(label, output, input);
  section.append(controls);
  const views = node('div', 'frame-views');
  for (const [branch, title] of [['recorded', 'Recorded world'], ['replay', 'Chosen reconstruction']]) {
    const card = node('figure', 'frame-card'); card.dataset.branch = branch;
    card.append(node('figcaption', '', title));
    const canvas = node('canvas', 'frame-map'); canvas.setAttribute('role', 'img');
    card.append(canvas, node('dl', 'frame-stats')); views.append(card);
  }
  section.append(views, node('p', 'frame-note', 'Dots are recorded daily positions. Dashed lines join those observations.'));
  root.append(section);
  const update = () => {
    const selected = Number(input.value);
    state.visualFrames.set(state.testId, selected);
    output.textContent = `Day ${visual.recorded[selected].day}`;
    input.setAttribute('aria-valuetext', output.textContent);
    for (const card of views.children) {
      const frame = visual[card.dataset.branch][selected], stats = card.querySelector('.frame-stats');
      const crossing = frame.bridgeOpen ? 'Open' : `Closed (${quantity(frame.bridgeRepair)}/${currentCase().map.bridge.required})`;
      stats.replaceChildren();
      for (const [label, value] of [['Position', `(${frame.x}, ${frame.y})`], ['Food', quantity(frame.food)], ['Timber', quantity(frame.wood)], ['Crossing', crossing]]) {
        const row = node('div'); row.append(node('dt', '', label), node('dd', '', value)); stats.append(row);
      }
      card.querySelector('canvas').setAttribute('aria-label', `${visual.subject}, ${card.dataset.branch === 'recorded' ? 'recorded world' : 'chosen reconstruction'}, day ${frame.day}, position ${frame.x}, ${frame.y}, food ${quantity(frame.food)}, timber ${quantity(frame.wood)}, crossing ${crossing}`);
      drawFrameMap(card.querySelector('canvas'), visual[card.dataset.branch], selected, card.dataset.branch);
    }
  };
  input.addEventListener('input', update);
  update();
}

function paintPatch(ctx, resource, x, y, radius) {
  ctx.fillStyle = resource === 'food' ? '#b49b48' : '#5b8158';
  ctx.beginPath();
  if (resource === 'food') ctx.arc(x, y, radius, 0, Math.PI * 2);
  else { ctx.moveTo(x, y - radius); ctx.lineTo(x + radius, y); ctx.lineTo(x, y + radius); ctx.lineTo(x - radius, y); ctx.closePath(); }
  ctx.fill();
}

function drawFrameMap(canvas, frames, selected, branch) {
  const map = currentCase().map, rect = canvas.getBoundingClientRect();
  if (!rect.width) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), width = rect.width, height = rect.height;
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.fillStyle = '#cde2df'; ctx.fillRect(0, 0, width, height);
  const tile = Math.min((width - 14) / map.width, (height - 14) / map.height);
  const ox = (width - tile * map.width) / 2, oy = (height - tile * map.height) / 2;
  for (const cell of map.cells) {
    if (cell.terrain === 'land') {
      ctx.fillStyle = (cell.x * 7 + cell.y * 11) % 8 < 3 ? '#d3d7a9' : '#e0dfb8';
      ctx.fillRect(ox + cell.x * tile, oy + cell.y * tile, tile + .3, tile + .3);
    }
    if (cell.resource) {
      paintPatch(ctx, cell.resource, ox + (cell.x + .5) * tile, oy + (cell.y + .5) * tile, Math.max(1.2, tile * .19));
    }
  }
  const frame = frames[selected], bridge = map.bridge, bx = ox + bridge.x * tile, by = oy + bridge.y * tile;
  ctx.fillStyle = frame.bridgeOpen ? '#9b7753' : '#859996';
  ctx.fillRect(bx, by + tile * .27, tile * 2, tile * .46);
  if (!frame.bridgeOpen) {
    ctx.strokeStyle = '#aa613b'; ctx.lineWidth = 1.5; ctx.beginPath();
    ctx.moveTo(bx + tile * .6, by + tile * .15); ctx.lineTo(bx + tile * 1.4, by + tile * .85);
    ctx.moveTo(bx + tile * 1.4, by + tile * .15); ctx.lineTo(bx + tile * .6, by + tile * .85); ctx.stroke();
  }
  const color = branch === 'recorded' ? '#246458' : '#c67440';
  // Join observed daily endpoints only; no interpolated simulation or future trail.
  ctx.strokeStyle = color; ctx.lineWidth = 1.8; ctx.setLineDash([3, 3]); ctx.beginPath();
  for (let index = 0; index <= selected; index++) {
    const point = frames[index], x = ox + (point.x + .5) * tile, y = oy + (point.y + .5) * tile;
    if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y);
  }
  if (selected > 0) ctx.stroke(); ctx.setLineDash([]);
  for (let index = 0; index <= selected; index++) {
    const point = frames[index]; ctx.fillStyle = color; ctx.beginPath();
    ctx.arc(ox + (point.x + .5) * tile, oy + (point.y + .5) * tile, index === selected ? 4.5 : 2, 0, Math.PI * 2); ctx.fill();
    if (index === selected) { ctx.strokeStyle = '#fffdf3'; ctx.lineWidth = 1.3; ctx.stroke(); }
  }
}

function redrawVisual() {
  const state = currentState(), visual = selectedTest()?.result.visual;
  if (!visual || !state.testedIds.has(state.testId)) return;
  const index = state.visualFrames.get(state.testId) ?? visual.recorded.length - 1;
  for (const card of $('test-result').querySelectorAll('.frame-card'))
    drawFrameMap(card.querySelector('canvas'), visual[card.dataset.branch], index, card.dataset.branch);
}

function renderResolution() {
  const c = currentCase(), state = currentState(), root = $('resolution');
  root.replaceChildren();
  root.hidden = !state.resolved;
  if (!state.resolved) return;
  // Solution fields enter the DOM only after judgeCase confirms the submitted evidence.
  root.append(node('p', 'eyebrow', 'CASE RESOLVED'), node('h3', '', 'The verified chain'),
    node('p', '', c.solution.explanation));
  const timeline = node('ol');
  for (const entry of c.solution.timeline) timeline.append(node('li', '', entry));
  root.append(timeline);
  const actions = node('div', 'resolution-actions');
  const download = node('button', '', '↓ Save the selected reconstruction');
  download.type = 'button';
  download.addEventListener('click', () => {
    try {
      const comparison = c.getComparison(state.testId);
      const serialized = serializeComparison(comparison);
      const url = URL.createObjectURL(new Blob([serialized], { type: 'application/json' }));
      const link = node('a');
      link.href = url;
      link.download = `common-ground-${c.id}-${state.testId}-resolved.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notice(comparison.measurementDay === undefined ?
        'Saved the full comparison. Open it in the island sandbox to inspect the complete histories.' :
        `Saved the starting comparison. In the sandbox, advance to day ${comparison.measurementDay} to inspect the selected measurement.`);
    } catch (error) { notice(`Could not save this reconstruction: ${error.message}`); }
  });
  const sandbox = node('a', 'replay-link', 'Open the island sandbox ↗');
  sandbox.href = './standalone.html';
  sandbox.target = '_blank';
  sandbox.rel = 'noopener';
  const next = book.find(item => !investigations.get(item.id).resolved);
  actions.append(download, sandbox);
  if (next) {
    const button = node('button', '', 'Open another case →');
    button.type = 'button';
    button.addEventListener('click', () => {
      currentId = next.id;
      renderCase();
      $('case-sheet').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    actions.append(button);
  }
  root.append(actions);
}

function drawMap() {
  const c = currentCase(), state = currentState(), canvas = $('case-map'), rect = canvas.getBoundingClientRect();
  canvas.setAttribute('aria-label', `${c.title}: food patches are circles, timber patches are diamonds. ${c.map.markers.map(m => `${m.label} at (${m.x}, ${m.y})`).join('; ')}. The textual clues describe the relevant quantities and dates.`);
  if (!rect.width) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2), width = rect.width, height = rect.height;
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext('2d'); ctx.scale(dpr, dpr);
  ctx.fillStyle = '#cde2df'; ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = '#b9d5d0'; ctx.lineWidth = .6;
  for (let y = 12; y < height; y += 19) {
    ctx.beginPath();
    for (let x = 0; x < width; x += 8) {
      const wave = y + Math.sin(x / 32 + y / 10) * 2;
      if (x) ctx.lineTo(x, wave); else ctx.moveTo(x, wave);
    }
    ctx.stroke();
  }
  const tile = Math.min((width - 28) / c.map.width, (height - 28) / c.map.height);
  const ox = (width - tile * c.map.width) / 2, oy = (height - tile * c.map.height) / 2;
  for (const cell of c.map.cells) {
    if (cell.terrain === 'land') {
      ctx.fillStyle = (cell.x * 7 + cell.y * 11) % 8 < 3 ? '#d3d7a9' : '#e0dfb8';
      ctx.fillRect(ox + cell.x * tile, oy + cell.y * tile, tile + .3, tile + .3);
    }
    if (cell.resource) {
      paintPatch(ctx, cell.resource, ox + (cell.x + .5) * tile, oy + (cell.y + .5) * tile, Math.max(1.8, tile * .2));
    }
  }
  if (c.map.bridge) {
    const bridge = c.map.bridge, x = ox + bridge.x * tile, y = oy + bridge.y * tile;
    ctx.fillStyle = bridge.open ? '#9b7753' : '#859996';
    ctx.fillRect(x, y + tile * .28, tile * 2, tile * .44);
    if (bridge.open) {
      ctx.strokeStyle = '#715d43'; ctx.lineWidth = .9;
      for (let n = 0; n < 8; n++) {
        ctx.beginPath(); ctx.moveTo(x + n * tile / 4, y + tile * .28);
        ctx.lineTo(x + n * tile / 4, y + tile * .72); ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#cde2df'; ctx.fillRect(x + tile * .65, y + tile * .2, tile * .7, tile * .6);
      ctx.strokeStyle = '#aa613b'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + tile * .7, y + tile * .2); ctx.lineTo(x + tile * 1.3, y + tile * .8);
      ctx.moveTo(x + tile * 1.3, y + tile * .2); ctx.lineTo(x + tile * .7, y + tile * .8); ctx.stroke();
    }
  }
  if (state.highlight) {
    ctx.strokeStyle = '#b67a39'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ox + (state.highlight.x + .5) * tile, oy + (state.highlight.y + .5) * tile, tile * .7, 0, Math.PI * 2); ctx.stroke();
  }
  c.map.markers.forEach((marker, index) => {
    const x = ox + (marker.x + .5) * tile, y = oy + (marker.y + .5) * tile;
    ctx.fillStyle = '#1c5550'; ctx.strokeStyle = '#fffdf3'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, Math.max(7, tile * .42), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fffdf3'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(index + 1), x, y);
  });
}

function renderCase() {
  const c = currentCase(), state = currentState();
  renderCovers();
  $('case-number').textContent = `CASE ${String(book.indexOf(c) + 1).padStart(2, '0')} / ${String(book.length).padStart(2, '0')}`;
  $('case-title').textContent = c.title;
  $('case-subtitle').textContent = c.subtitle;
  $('case-status').textContent = state.resolved ? 'RESOLVED' : 'OPEN CASE';
  $('case-question').textContent = c.question;
  $('case-brief').textContent = c.brief;
  $('case-rules').replaceChildren(...c.rules.map(rule => node('li', '', rule)));
  const bridge = c.map.bridge;
  $('map-bridge-state').textContent = bridge ? bridge.open ? 'Crossing open' :
    `Crossing closed · ${Number((bridge.required - bridge.repair).toFixed(1))} timber needed` : '';
  $('map-markers').replaceChildren(...c.map.markers.map(marker => node('li', '', marker.label)));

  renderClues(); renderPinned();
  renderChoices($('hypotheses'), c.hypotheses, 'hypothesis');
  renderChoices($('predictions'), c.predictions, 'prediction');
  renderReconstruction(); renderControls(); renderResolution(); drawMap();
}

$('hypothesis-form').addEventListener('submit', event => event.preventDefault());
$('prediction-form').addEventListener('submit', event => event.preventDefault());
$('reconstruction-choice').addEventListener('change', () => {
  const state = currentState();
  state.testId = $('reconstruction-choice').value;
  state.feedback = '';
  renderReconstruction(); renderControls();
});
$('run-test').addEventListener('click', () => {
  const state = currentState();
  if (!state.testId || !state.prediction || state.resolved || state.testedIds.has(state.testId)) return;
  state.recordedPredictions.set(state.testId, state.prediction);
  state.testedIds.add(state.testId);
  state.feedback = '';
  renderTestHistory(); renderTestResult(); renderControls();
  notice('Reconstruction recorded. Compare its result with the prediction, or try another controlled change.');
});
$('submit-case').addEventListener('click', () => {
  const c = currentCase(), state = currentState();
  if (state.resolved || !state.testedIds.has(state.testId) || state.pinned.size !== 2) return;
  const verdict = judgeCase(c, { hypothesis: state.hypothesis, prediction: state.prediction,
    evidence: [...state.pinned], testId: state.testId, testedIds: [...state.testedIds],
    tested: state.testedIds.has(state.testId) });
  state.feedback = verdict.feedback;
  if (verdict.correct) {
    state.resolved = true;
    renderCase();
    notice(`${c.title} resolved. The verified causal chain is now available below.`);
    $('resolution').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    renderControls();
    notice('The case remains open. You can revise and try again without a penalty.');
  }
});
let resizeFrame;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => { drawMap(); redrawVisual(); });
});
renderCase();
