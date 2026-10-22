# airtraffic

A canvas animation of a day of US domestic air traffic, inspired by NBC News'
[Airplane Mode](https://www.nbcnews.com/specials/airplane-mode/). Built with
plain ES modules and [d3](https://d3js.org) v7. There is no build step.

## Run

Any static file server works (the app `fetch`es JSON, so `file://` won't):

```sh
npm start            # http-server on http://localhost:8080
# or
python -m http.server 8080
```

## Controls

- **Space** play/pause · **← / →** step 15 minutes · **Esc** clear filter
- Drag the timeline to scrub through the day
- Link to a moment with `#time=18:30&airport=ATL`
- Hover an airport to highlight its flights, and click to pin the filter
  (outbound flights are cyan, inbound are pink)

## How it works

- **Data:** `data/routes.json` holds the nonstop routes between contiguous-US
  airports from [OpenFlights](https://github.com/jpatokal/openflights), weighted
  by the number of airlines that operate each route. OpenFlights stopped
  updating its route data in 2014, so the network is a snapshot from that time.
  `data/states-albers-10m.json` is the [us-atlas](https://github.com/topojson/us-atlas)
  base map.
- **Flights** ([src/flights.js](src/flights.js)) are generated in the browser
  with a seeded RNG. Busy routes between big airports get more daily
  frequencies, and departures follow a typical airline-day curve in each
  origin's local time. Block time is derived from great-circle distance.
- **Rendering** ([src/render.js](src/render.js)) uses two stacked canvases: a
  static base map, and a plane layer redrawn every frame. Each plane's trail is
  the last ~30 simulated minutes of its own path, split into segments with
  decreasing alpha. Each alpha level across all planes is drawn as one batched
  `Path2D` stroke, so the trails stay exact when the animation is paused or
  scrubbed.
- **Timeline** ([src/timeline.js](src/timeline.js)) is a d3 area chart of the
  number of planes airborne in each 5-minute bin, and it doubles as the scrubber.

## Rebuilding the route data

```sh
curl -LO https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat
curl -LO https://raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat
npm run data -- airports.dat routes.dat data/routes.json
```
