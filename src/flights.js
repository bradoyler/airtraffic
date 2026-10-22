import * as d3 from 'd3';

// Map space matches us-atlas' pre-projected states-albers-10m.json.
export const WIDTH = 975;
export const HEIGHT = 610;
export const DAY = 1440; // minutes
export const projection = d3.geoAlbersUsa().scale(1300).translate([487.5, 305]);

const SEGMENTS = 24; // polyline resolution per great-circle route
const ET_OFFSET = -5;
const CRUISE_KM_PER_MIN = 12.5;
const TAXI_CLIMB_MIN = 20;

// Relative departures per local hour, shaped like a typical US airline day.
const HOURLY = [
  0.3, 0.1, 0.05, 0.05, 0.3, 1.8, 4.2, 5, 4.8, 4.4, 4, 4,
  4.4, 4.4, 4.1, 4.4, 4.8, 4.9, 4.5, 4, 3.2, 2.4, 1.4, 0.7,
];

export const mod = (n, m) => ((n % m) + m) % m;

const mulberry32 = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export async function loadData() {
  const [routes, us] = await Promise.all([
    d3.json('data/routes.json'),
    d3.json('data/states-albers-10m.json'),
  ]);
  return { ...routes, us };
}

/**
 * Turn route frequencies into a synthetic day of scheduled flights.
 * Busier routes between bigger airports get more daily frequencies;
 * departure times follow HOURLY in each origin's local time.
 */
export function buildFlights(airports, routes, { total = 24000, seed = 7 } = {}) {
  const rand = mulberry32(seed);
  const cumulative = d3.cumsum(HOURLY);
  const hourSum = cumulative.at(-1);
  const localMinute = () => {
    const hour = d3.bisectRight(cumulative, rand() * hourSum);
    return hour * 60 + Math.floor(rand() * 12) * 5;
  };

  for (const a of airports) {
    [a.x, a.y] = projection([a.lon, a.lat]);
    Object.assign(a, { weight: 0, departures: 0, arrivals: 0 });
  }
  for (const [s, d, w] of routes) {
    airports[s].weight += w;
    airports[d].weight += w;
  }

  const scores = routes.map(([s, d, w]) => w * Math.sqrt(airports[s].weight * airports[d].weight));
  const scale = total / d3.sum(scores);
  const flights = [];

  routes.forEach(([s, d], i) => {
    const from = airports[s], to = airports[d];
    const expected = scores[i] * scale;
    const count = Math.max(1, Math.floor(expected) + (rand() < expected % 1));
    const km = d3.geoDistance([from.lon, from.lat], [to.lon, to.lat]) * 6371;
    const block = TAXI_CLIMB_MIN + km / CRUISE_KM_PER_MIN;
    for (let j = 0; j < count; j++) {
      const dep = mod(localMinute() + (ET_OFFSET - from.tz) * 60, DAY);
      flights.push({ from: s, to: d, dep, dur: block * (0.95 + rand() * 0.1), path: null });
    }
    from.departures += count;
    to.arrivals += count;
  });

  return flights;
}

/** Projected great-circle polyline for a flight, computed on first use. */
export function flightPath(flight, airports) {
  if (flight.path) return flight.path;
  const a = airports[flight.from], b = airports[flight.to];
  const interp = d3.geoInterpolate([a.lon, a.lat], [b.lon, b.lat]);
  const pts = new Float32Array((SEGMENTS + 1) * 2);
  for (let i = 0; i <= SEGMENTS; i++) {
    const f = i / SEGMENTS;
    const [x, y] = projection(interp(f)) ?? [a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f];
    pts[i * 2] = x;
    pts[i * 2 + 1] = y;
  }
  return (flight.path = pts);
}

/** Write the point at progress p (0..1) along pts into out. */
export function pointAt(pts, p, out) {
  const f = Math.min(Math.max(p, 0), 1) * SEGMENTS;
  const i = Math.min(Math.floor(f), SEGMENTS - 1);
  const r = f - i;
  out[0] = pts[i * 2] + (pts[i * 2 + 2] - pts[i * 2]) * r;
  out[1] = pts[i * 2 + 1] + (pts[i * 2 + 3] - pts[i * 2 + 1]) * r;
  return out;
}

/** Airborne counts in 5-minute bins across the day, optionally filtered. */
export function airborneByBin(flights, filter = () => true, binSize = 5) {
  const bins = new Uint32Array(DAY / binSize);
  for (const f of flights) {
    if (!filter(f)) continue;
    const start = Math.floor(f.dep / binSize);
    const end = Math.floor((f.dep + f.dur) / binSize);
    for (let b = start; b <= end; b++) bins[b % bins.length]++;
  }
  return bins;
}
