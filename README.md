# Meesho Room Finder & Booking

Movie-seat style booking for the closed meeting rooms on 3F / 4F / 5F / 11F. Real floor-plan
images (from `POD markings final 2026.pdf`) are the default maps; bookings, layout, and
uploaded maps are shared across every browser hitting the server and persist to
`data/db.json`.

## Run it (PowerShell)

```powershell
npm install
npm start
```

Open http://localhost:3000. Anyone on the same network can open `http://<your-ip>:3000`
and see the same live state.

## Deploy to Vercel

This repository includes `vercel.json`, so Vercel can run the Express server from
`server.js`.

1. Commit and push the project to GitHub.
2. Open Vercel and choose **Add New... -> Project**.
3. Import `yash1-meesho/buildathon`.
4. Keep the default framework setting as **Other** if Vercel does not detect one.
5. Deploy.

Note: this app currently stores bookings in `data/db.json` and uploaded maps in
`public/maps/`. On Vercel, local file writes are not durable, so bookings/uploads may
reset after a redeploy or serverless cold start. For a production deployment, move this
state to a hosted database and object storage.

## Run it with Docker

```powershell
docker compose up --build -d
```

`data/` and `public/maps/` are mounted as volumes so bookings and any map you upload
survive a container rebuild.

## First-time setup: calibrate the room boxes

The seed room list (names, codes, capacities) was read off the real floor-plan PDF, but
exact pixel positions weren't — each floor's rooms start stacked in a strip along the left
edge. Click **✎ Edit layout**, drag each box onto the real room on the map, drag the
pink ◢ handle to resize it, then click **✓ Done editing**. Positions save to the server
immediately and only need doing once. Use **⬆ Upload map** to replace a floor's image
(e.g. with a cleaner export) at any time — existing room boxes stay in place, just
re-calibrate against the new image if the layout shifted.

## How it works

- **Booking is per-day.** `data/db.json` self-prunes bookings at the start of a new day
  (IST); layout and maps are unaffected.
- **Room color reflects right now.** A room only shows red if an active booking covers
  the current 30-minute slot — a room booked for later today still shows green until then.
- **Movie-seat slot picker.** Click a start slot, click an end slot, the range between
  fills in; tapping an already-selected slot trims the range from there. Booked slots are
  greyed out, past slots are dimmed, rush-hour (3–6 PM) slots get a ⚡.
- **Leave early.** A future booking is cancelled outright; a booking in progress is
  truncated to the elapsed slots (kept on record) and the room frees up immediately.
- **Find me a room** ranks vacant rooms across all four floors by smallest sufficient
  capacity for your group size, flags rush-hour requests, and the booking modal itself
  warns when you've picked a room more than 2x your group size.

## Testing without waiting for office hours

Slots only run 09:00–19:00 IST. To demo/test outside that window, set `MOCK_NOW_MIN`
(minutes since midnight) before starting the server, e.g. `MOCK_NOW_MIN=930` for 15:30:

```powershell
$env:MOCK_NOW_MIN = "930"
npm start
```

Unset it (or just don't set it) for normal real-clock behavior.

## Project layout

```
server.js          Express app + all API routes
lib/time.js         IST time helpers, the 09:00-19:00 slot grid, rush-hour window
lib/db.js            JSON-file persistence, daily booking prune
lib/rooms-seed.js    Seed room list per floor (names/codes/capacities from the real map)
public/              Frontend (index.html, css/style.css, js/app.js)
public/maps/         Default floor-plan images + anything uploaded via the UI
data/db.json         Generated at runtime — rooms, bookings, map filenames, layout
```
