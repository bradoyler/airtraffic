import { DAY, mod, loadData, buildFlights, airborneByBin } from './flights.js';
import { createRenderer } from './render.js';
import { createTimeline, formatClock } from './timeline.js';

const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat('en-US');

const { airports, routes, us } = await loadData();
const flights = buildFlights(airports, routes);

const renderer = createRenderer({
  stage: $('stage'), base: $('base'), planes: $('planes'), airports, flights, us,
});

const state = {
  t: 5 * 60, // start at 5 AM ET, before the morning push
  playing: !matchMedia('(prefers-reduced-motion: reduce)').matches,
  speed: 15, // simulated minutes per second
  hovered: null,
  locked: null,
  dirty: true,
};
const selected = () => state.locked ?? state.hovered;

const timeline = createTimeline($('timeline'), {
  bins: airborneByBin(flights),
  onScrub: (t) => { state.t = t; state.dirty = true; },
});

$('total').textContent = fmt.format(flights.length);

// --- Controls -------------------------------------------------------------

const playBtn = $('play');
const syncPlay = () => {
  playBtn.setAttribute('aria-pressed', String(state.playing));
  playBtn.setAttribute('aria-label', state.playing ? 'Pause' : 'Play');
};
playBtn.addEventListener('click', () => { state.playing = !state.playing; syncPlay(); });
syncPlay();

const speedButtons = [...document.querySelectorAll('[data-speed]')];
const syncSpeed = () => speedButtons.forEach((b) =>
  b.setAttribute('aria-pressed', String(+b.dataset.speed === state.speed)));
speedButtons.forEach((b) => b.addEventListener('click', () => {
  state.speed = +b.dataset.speed;
  syncSpeed();
}));
syncSpeed();

addEventListener('keydown', (e) => {
  if (e.target.closest('button') && (e.key === ' ' || e.key === 'Enter')) return;
  if (e.key === ' ') { e.preventDefault(); playBtn.click(); }
  else if (e.key === 'ArrowRight') state.t += 15;
  else if (e.key === 'ArrowLeft') state.t -= 15;
  else if (e.key === 'Escape') select(null);
  else return;
  state.t = mod(state.t, DAY);
  state.dirty = true;
});

// --- Airport hover / filter -------------------------------------------------

const stage = $('stage');
const tooltip = $('tooltip');
const panel = $('airport');

function select(index) {
  state.locked = index;
  updateSelection();
}

function updateSelection() {
  const i = selected();
  timeline.setHighlight(i == null ? null : {
    out: airborneByBin(flights, (f) => f.from === i),
    in: airborneByBin(flights, (f) => f.to === i),
  });
  panel.hidden = state.locked == null;
  if (state.locked != null) {
    const a = airports[state.locked];
    $('ap-code').textContent = a.code;
    $('ap-name').textContent = `${a.name}, ${a.city}`;
    $('ap-dep').textContent = fmt.format(a.departures);
    $('ap-arr').textContent = fmt.format(a.arrivals);
  }
  state.dirty = true;
}

stage.addEventListener('pointermove', (e) => {
  const r = stage.getBoundingClientRect();
  const i = renderer.airportAt(e.clientX - r.left, e.clientY - r.top);
  stage.style.cursor = i == null ? '' : 'pointer';
  if (i !== state.hovered) {
    state.hovered = i;
    if (state.locked == null) updateSelection();
  }
  if (i == null) { tooltip.hidden = true; return; }
  const a = airports[i];
  const [x, y] = renderer.toScreen(a);
  tooltip.innerHTML = `<strong>${a.code}</strong> ${a.city}<br>
    <span>${fmt.format(a.departures)} departures · ${fmt.format(a.arrivals)} arrivals</span>`;
  tooltip.style.transform = `translate(${Math.min(x + 12, r.width - 220)}px, ${y + 12}px)`;
  tooltip.hidden = false;
});
stage.addEventListener('pointerleave', () => {
  tooltip.hidden = true;
  state.hovered = null;
  if (state.locked == null) updateSelection();
});
stage.addEventListener('click', () => select(state.hovered === state.locked ? null : state.hovered));
$('ap-clear').addEventListener('click', () => select(null));

// Deep links: #time=18:30&airport=ATL
const params = new URLSearchParams(location.hash.slice(1));
const [hh, mm] = (params.get('time') ?? '').split(':').map(Number);
if (Number.isFinite(hh)) state.t = mod(hh * 60 + (mm || 0), DAY);
const linked = airports.findIndex((a) => a.code === params.get('airport')?.toUpperCase());
if (linked >= 0) select(linked);

// --- Loop -----------------------------------------------------------------

const resize = () => {
  if (!renderer.resize()) return;
  timeline.resize();
  state.dirty = true;
};
new ResizeObserver(resize).observe(stage);
resize();

let last = performance.now();
requestAnimationFrame(function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (state.playing) {
    state.t = mod(state.t + dt * state.speed, DAY);
    state.dirty = true;
  }
  if (state.dirty) {
    state.dirty = false;
    const counts = renderer.drawFrame(state.t, selected());
    timeline.update(state.t);
    $('clock').textContent = formatClock(state.t);
    $('airborne').textContent = fmt.format(counts.airborne);
    $('ap-out').textContent = fmt.format(counts.outbound);
    $('ap-in').textContent = fmt.format(counts.inbound);
  }
  requestAnimationFrame(frame);
});
