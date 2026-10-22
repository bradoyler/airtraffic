import * as d3 from 'd3';
import { DAY, mod } from './flights.js';
import { COLORS } from './render.js';

const MARGIN = { top: 6, right: 12, bottom: 18, left: 12 };

export const formatClock = (t) => {
  const m = Math.floor(mod(t, DAY));
  const h = Math.floor(m / 60);
  return `${h % 12 || 12}:${String(m % 60).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

/**
 * Area chart of airborne flights across the day, doubling as a scrubber.
 * A selected airport's traffic replaces the total while it's highlighted.
 */
export function createTimeline(svgEl, { bins, onScrub }) {
  const svg = d3.select(svgEl);
  const x = d3.scaleLinear().domain([0, DAY]);
  const y = d3.scaleLinear();
  const area = d3.area()
    .x((_, i) => x(((i + 0.5) * DAY) / bins.length))
    .y0(([lo]) => y(lo))
    .y1(([, hi]) => y(hi))
    .curve(d3.curveBasis);
  // Stack series on top of base (both bin arrays) as [lo, hi] pairs.
  const band = (series, base) => Array.from(series, (v, i) => [base?.[i] ?? 0, (base?.[i] ?? 0) + v]);

  svg.append('defs').html(`
    <linearGradient id="tl-fill" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="${COLORS.trail}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${COLORS.trail}" stop-opacity="0.05"/>
    </linearGradient>`);
  const allPath = svg.append('path').attr('fill', 'url(#tl-fill)');
  const outPath = svg.append('path').attr('fill', COLORS.outbound).attr('fill-opacity', 0.55);
  const inPath = svg.append('path').attr('fill', COLORS.inbound).attr('fill-opacity', 0.45);
  const axis = svg.append('g').attr('class', 'axis');
  const head = svg.append('line').attr('class', 'playhead');

  let highlight = null;

  function resize() {
    const { width, height } = svgEl.getBoundingClientRect();
    svg.attr('viewBox', `0 0 ${width} ${height}`);
    x.range([MARGIN.left, width - MARGIN.right]);
    y.range([height - MARGIN.bottom, MARGIN.top]);
    draw();
    axis
      .attr('transform', `translate(0,${height - MARGIN.bottom})`)
      .call(d3.axisBottom(x)
        .tickValues(d3.range(0, DAY + 1, width < 480 ? 360 : 180))
        .tickFormat((t) => (t === DAY ? '' : formatClock(t).replace(':00', '')))
        .tickSize(3))
      .call((g) => g.select('.domain').remove());
    head.attr('y1', MARGIN.top - 4).attr('y2', height - MARGIN.bottom);
  }

  // With an airport selected, rescale to its traffic: outbound stacked under inbound.
  function draw() {
    if (highlight) {
      y.domain([0, d3.max(highlight.out, (v, i) => v + highlight.in[i]) || 1]);
      allPath.attr('d', null);
      outPath.attr('d', area(band(highlight.out)));
      inPath.attr('d', area(band(highlight.in, highlight.out)));
    } else {
      y.domain([0, d3.max(bins)]);
      allPath.attr('d', area(band(bins)));
      outPath.attr('d', null);
      inPath.attr('d', null);
    }
  }

  /** Overlay { out, in } bin arrays for a selected airport, or null. */
  function setHighlight(series) {
    highlight = series;
    draw();
  }

  function update(t) {
    const hx = x(mod(t, DAY));
    head.attr('x1', hx).attr('x2', hx);
  }

  const scrub = (event) => {
    const [px] = d3.pointer(event, svgEl);
    onScrub(Math.max(0, Math.min(DAY - 1, x.invert(px))));
  };
  svgEl.addEventListener('pointerdown', (e) => {
    svgEl.setPointerCapture(e.pointerId);
    scrub(e);
  });
  svgEl.addEventListener('pointermove', (e) => {
    if (svgEl.hasPointerCapture(e.pointerId)) scrub(e);
  });

  return { resize, update, setHighlight };
}
