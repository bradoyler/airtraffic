import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import { WIDTH, HEIGHT, DAY, mod, flightPath, pointAt } from './flights.js';

const TRAIL_STEPS = 10;
const TRAIL_MINUTES = 28;
const LABELLED_HUBS = 12;

export const COLORS = {
  land: '#0e1626',
  border: '#22314d',
  coast: '#2d4166',
  airport: '#4f6890',
  label: '#7f93b5',
  trail: '#ffb648',
  head: '#fff4dc',
  outbound: '#4fd2ff',
  inbound: '#ff6fae',
  dim: '#7c8aa5',
};

/**
 * Two stacked canvases: a static base map (redrawn on resize) and a
 * per-frame plane layer. Everything is drawn in WIDTH x HEIGHT map units.
 */
export function createRenderer({ stage, base, planes, airports, flights, us }) {
  const baseCtx = base.getContext('2d');
  const ctx = planes.getContext('2d');
  const nation = topojson.feature(us, us.objects.nation);
  const borders = topojson.mesh(us, us.objects.states, (a, b) => a !== b);
  const hubs = d3.sort(airports, (a) => -(a.departures + a.arrivals)).slice(0, LABELLED_HUBS);
  const quadtree = d3.quadtree(airports, (a) => a.x, (a) => a.y);
  const A = [0, 0], B = [0, 0];

  let dpr = 1, k = 1, ox = 0, oy = 0, cssWidth = 0, cssHeight = 0;
  const px = (n) => n / k; // screen pixels -> map units

  const applyTransform = (c) => c.setTransform(dpr * k, 0, 0, dpr * k, dpr * ox, dpr * oy);

  /** Fit the map to the stage. Returns false if nothing changed. */
  function resize() {
    const { width, height } = stage.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (width === cssWidth && height === cssHeight && ratio === dpr) return false;
    [cssWidth, cssHeight, dpr] = [width, height, ratio];
    const pad = cssWidth < 640 ? 8 : 24;
    k = Math.min((cssWidth - pad * 2) / WIDTH, (cssHeight - pad * 2) / HEIGHT);
    ox = (cssWidth - WIDTH * k) / 2;
    oy = (cssHeight - HEIGHT * k) / 2;
    for (const c of [base, planes]) {
      c.width = Math.round(cssWidth * dpr);
      c.height = Math.round(cssHeight * dpr);
      c.style.width = `${cssWidth}px`;
      c.style.height = `${cssHeight}px`;
    }
    drawBase();
    return true;
  }

  function drawBase() {
    const c = baseCtx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, base.width, base.height);
    applyTransform(c);
    const path = d3.geoPath(null, c);

    c.beginPath();
    path(nation);
    c.fillStyle = COLORS.land;
    c.fill();
    c.lineWidth = px(1);
    c.strokeStyle = COLORS.coast;
    c.stroke();

    c.beginPath();
    path(borders);
    c.lineWidth = px(0.75);
    c.strokeStyle = COLORS.border;
    c.stroke();

    c.fillStyle = COLORS.airport;
    for (const a of airports) {
      c.beginPath();
      c.arc(a.x, a.y, airportRadius(a), 0, Math.PI * 2);
      c.fill();
    }

    if (k * WIDTH > 560) {
      c.font = `500 ${px(10)}px system-ui, sans-serif`;
      c.fillStyle = COLORS.label;
      c.textBaseline = 'middle';
      for (const a of hubs) c.fillText(a.code, a.x + airportRadius(a) + px(3), a.y);
    }
  }

  const airportRadius = (a) => 0.6 + Math.sqrt(a.departures) * 0.055;

  const makeGroup = (color, head, alpha) => ({
    color, head, alpha, count: 0,
    trails: Array.from({ length: TRAIL_STEPS }, () => new Path2D()),
    heads: new Path2D(),
  });

  /** Draw all flights airborne at time t (ET minutes). Returns counts. */
  function drawFrame(t, selected) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, planes.width, planes.height);
    applyTransform(ctx);

    const all = makeGroup(COLORS.trail, COLORS.head, 0.75);
    const dim = makeGroup(COLORS.dim, COLORS.dim, 0.14);
    const out = makeGroup(COLORS.outbound, '#e6f9ff', 0.95);
    const inb = makeGroup(COLORS.inbound, '#ffe6f1', 0.95);
    const step = TRAIL_MINUTES / TRAIL_STEPS;
    const size = px(1.6);
    let airborne = 0;

    for (const f of flights) {
      const elapsed = mod(t - f.dep, DAY);
      if (elapsed >= f.dur) continue;
      airborne++;
      const g = selected == null ? all
        : f.from === selected ? out
        : f.to === selected ? inb
        : dim;
      g.count++;

      const pts = flightPath(f, airports);
      pointAt(pts, elapsed / f.dur, A);
      g.heads.rect(A[0] - size / 2, A[1] - size / 2, size, size);
      for (let i = 0; i < TRAIL_STEPS; i++) {
        const back = elapsed - (i + 1) * step;
        pointAt(pts, Math.max(back, 0) / f.dur, B);
        g.trails[i].moveTo(A[0], A[1]);
        g.trails[i].lineTo(B[0], B[1]);
        A[0] = B[0]; A[1] = B[1];
        if (back <= 0) break;
      }
    }

    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineWidth = px(1.1);
    for (const g of selected == null ? [all] : [dim, out, inb]) {
      ctx.strokeStyle = g.color;
      g.trails.forEach((trail, i) => {
        ctx.globalAlpha = g.alpha * (1 - i / TRAIL_STEPS) ** 1.6;
        ctx.stroke(trail);
      });
      ctx.globalAlpha = Math.min(1, g.alpha + 0.2);
      ctx.fillStyle = g.head;
      ctx.fill(g.heads);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    if (selected != null) {
      const a = airports[selected];
      ctx.beginPath();
      ctx.arc(a.x, a.y, airportRadius(a) + px(5), 0, Math.PI * 2);
      ctx.lineWidth = px(1.5);
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    }

    return { airborne, outbound: out.count, inbound: inb.count };
  }

  /** Nearest airport within a few screen pixels of a CSS-pixel point. */
  function airportAt(cx, cy) {
    const a = quadtree.find((cx - ox) / k, (cy - oy) / k, px(12));
    return a ? airports.indexOf(a) : null;
  }

  const toScreen = (a) => [ox + a.x * k, oy + a.y * k];

  return { resize, drawFrame, airportAt, toScreen };
}
