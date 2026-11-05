const $ = id => document.getElementById(id);
const stateControl = $('preview-state'), worldControl = $('preview-world'), sheet = $('sheet');
let seat = null, focusing = false, serving = false, dialogTrigger = null;
let reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const states = {
 ready: { message: 'Connected to your room', canAct: true },
 loading: { message: 'Checking your place…', canAct: false },
 empty: { message: 'Be the first to settle in.', canAct: true },
 full: { message: 'This room is full. Your current place is safe.', canAct: false, action: 'Find another room' },
 wait: { message: 'Waiting for a place. Your estimate is not available.', canAct: false, action: 'Leave queue' },
 offline: { message: 'You’re offline. Changes aren’t confirmed.', canAct: false, action: 'Retry connection' },
 reconnect: { message: 'Reconnecting to your room…', canAct: false, action: 'Check my place' },
 denied: { message: 'This place isn’t available to you.', canAct: false, action: 'Return to city' },
};

function closeSheet() { sheet.close(); dialogTrigger?.focus(); }
function openSheet(title, content, trigger) {
 dialogTrigger = trigger; $('sheet-title').textContent = title; $('sheet-content').replaceChildren(content);
 sheet.showModal(); $('close-sheet').focus();
}
function element(tag, text, className) {
 const node = document.createElement(tag); if (text) node.textContent = text; if (className) node.className = className; return node;
}
function button(text, callback, secondary = false) {
 const node = element('button', text, 'vlp-button' + (secondary ? ' secondary' : '')); node.type = 'button'; node.addEventListener('click', callback); return node;
}
function render() {
 const maid = worldControl.value === 'maid', view = states[stateControl.value];
 $('place-title').textContent = maid ? 'Maid Cafe' : 'Deadline Cafe';
 $('place-eyebrow').textContent = maid ? 'A warm welcome, a little kindness' : 'A little space to focus';
 $('place-subtitle').textContent = maid ? 'A small moment, made together.' : 'Settle in. Keep each other company.';
 $('room-name').textContent = maid ? 'Cafe Sakura' : 'Window room';
 $('room-count').textContent = stateControl.value === 'empty' ? 'No other visitors yet' : '3 / ' + (maid ? '30' : '40') + ' here';
 $('activity-tag').textContent = maid ? serving ? 'Voluntary service' : 'Your cafe visit' : 'Private focus';
 $('activity-title').textContent = maid ? serving ? 'One order, one kind gesture.' : 'Stay for something warm.' : focusing ? 'A little time for yourself.' : 'Make room for a good hour.';
 $('activity-description').textContent = maid ? 'Visit as a customer or choose a voluntary shift. You can stop whenever you need.' : 'Choose a desk, then begin when you’re ready. Your task stays yours.';
 $('connection').textContent = view.message;
 $('primary').textContent = maid ? serving ? 'Choose an order' : 'Order a drink' : focusing ? 'Focus in progress' : seat ? 'Start focus' : 'Choose a seat';
 $('primary').disabled = !view.canAct || focusing;
 $('seats-trigger').disabled = !view.canAct;
 $('timer').hidden = !focusing || maid;
 $('cancel-activity').hidden = !focusing;
 $('secondary').hidden = !view.action;
 $('secondary').textContent = view.action ?? 'Retry connection';
 $('activity-feedback').textContent = maid ? serving ? 'Your voluntary shift is active in this preview.' : 'No order yet. Take your time.' : seat ? `Desk ${seat} is confirmed in this preview.` : 'No desk selected yet.';
 document.documentElement.dataset.motion = reducedMotion ? 'reduced' : 'standard';
}
function seats(trigger) {
 const content = element('div'); content.append(element('p', 'Pick a desk. In the connected app, availability is confirmed by the room owner.'));
 const grid = element('div', null, 'seat-grid');
 for (let i = 1; i <= 30; i++) {
  const number = String(i).padStart(2, '0');
  const choice = button('Desk ' + number, () => { seat = number; focusing = false; render(); closeSheet(); });
  choice.setAttribute('aria-pressed', String(seat === number)); grid.append(choice);
 }
 content.append(grid); openSheet('Choose a seat', content, trigger);
}
$('seats-trigger').addEventListener('click', event => seats(event.currentTarget));
$('primary').addEventListener('click', event => {
 if (!states[stateControl.value].canAct) return;
 if (worldControl.value === 'deadline') {
  if (!seat) seats(event.currentTarget); else { focusing = true; render(); $('cancel-activity').focus(); }
 } else {
  const content = element('div'); content.append(element('p', serving ? 'Choose one eligible order in the connected cafe. Claims stay server-confirmed.' : 'Choose an original virtual cafe item. This preview does not place an order.'));
  content.append(button(serving ? 'Preview claiming one order' : 'Preview ordering tea', () => { closeSheet(); $('activity-feedback').textContent = serving ? 'Order claim preview confirmed. Preparation follows trusted deadlines.' : 'Tea order preview confirmed. No real order was sent.'; }));
  content.append(button(serving ? 'Stop voluntary shift' : 'Take a voluntary shift', () => { serving = !serving; render(); closeSheet(); }, true));
  openSheet(serving ? 'Your service choices' : 'Something warm', content, event.currentTarget);
 }
});
$('cancel-activity').addEventListener('click', () => { focusing = false; render(); $('activity-feedback').textContent = 'Focus cancelled in this preview. Your seat remains selected.'; $(states[stateControl.value].canAct ? 'primary' : 'leave').focus(); });
$('secondary').addEventListener('click', () => {
 const prior = stateControl.value; stateControl.value = 'ready'; render();
 $('activity-feedback').textContent = prior === 'wait' ? 'Queue left in this preview. You can return to the city.' : prior === 'full' ? 'Other eligible rooms would appear here after a fresh check.' : 'Connection state restored for this preview.';
});
$('leave').addEventListener('click', () => { seat = null; focusing = false; serving = false; render(); $('activity-feedback').textContent = 'You left the cafe in this preview. No activity was restarted.'; });
function safety(trigger) {
 const content = element('div'); content.append(element('p', 'Your focus stays private. Reports are confidential; blocking ends unwanted contact across places.'));
 content.append(button('Preview confidential report', () => { closeSheet(); $('activity-feedback').textContent = 'Preview only. A real report needs a confidential server receipt.'; }));
 content.append(button('Leave this interaction', () => { seat = null; focusing = false; serving = false; closeSheet(); render(); $('activity-feedback').textContent = 'Interaction withdrawn in this preview.'; }, true));
 openSheet('Safety and privacy', content, trigger);
}
for (const id of ['safety-trigger', 'bottom-safety']) $(id).addEventListener('click', event => safety(event.currentTarget));
$('settings-trigger').addEventListener('click', event => {
 const content = element('div'), label = element('label', null, 'setting'), input = document.createElement('input'); input.type = 'checkbox'; input.checked = reducedMotion;
 input.addEventListener('change', () => { reducedMotion = input.checked; render(); }); label.append(input, element('span', 'Reduce motion'));
 content.append(label, element('p', 'Sound is off. This prototype has no audio assets or autoplay.'), element('p', 'Room controls and private activity remain available when a scene cannot be shown.'));
 openSheet('Make yourself comfortable', content, event.currentTarget);
});
$('close-sheet').addEventListener('click', closeSheet);
sheet.addEventListener('cancel', () => { window.setTimeout(() => dialogTrigger?.focus(), 0); });
sheet.addEventListener('keydown', event => {
 if (event.key !== 'Tab') return;
 const controls = [...sheet.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]')].filter(node => node.getClientRects().length > 0);
 const first = controls[0], last = controls.at(-1);
 if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
 else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
});
stateControl.addEventListener('change', render);
worldControl.addEventListener('change', () => { seat = null; focusing = false; serving = false; render(); });

const svgNamespace = 'http://www.w3.org/2000/svg';
for (const y of [180, 330]) for (const x of [170, 420, 670]) {
 const table = document.createElementNS(svgNamespace, 'g');
 for (const [tag, attributes] of [
  ['rect', { x: x - 70, y: y - 38, width: 140, height: 72, rx: 4, fill: '#bd9978', stroke: '#977e64', 'stroke-width': 3 }],
  ['rect', { x: x - 62, y: y - 30, width: 124, height: 56, fill: '#dfc3a3' }],
  ...[-45, 45].flatMap(dx => [-60, 48].map(dy => ['rect', { x: x + dx - 14, y: y + dy, width: 28, height: 28, rx: 3, fill: '#b86b59', stroke: '#915345', 'stroke-width': 2 }])),
  ['circle', { cx: x, cy: y - 3, r: 10, fill: '#f6f0e5' }],
 ]) {
  const node = document.createElementNS(svgNamespace, tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value)); table.append(node);
 }
 $('furniture').append(table);
}
render();
