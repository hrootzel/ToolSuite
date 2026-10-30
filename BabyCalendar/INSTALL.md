# BabyCalendar — Sleep Start / Sleep End update

**Updating an existing ToolSuite generic-storage installation:** replace **only** `ToolSuite/BabyCalendar.html`. Your generic `server.js`, API URLs, application permissions, and `ToolSuite/data/baby-calendar.json` path remain unchanged. A copy of the generic server is included only for fresh deployments.

## What's new

- Event chooser includes **🌛 Sleep Start** and **🌞 Sleep End**, using the existing date/time field and notes.
- When you record a Sleep End, the history table calculates its duration from the most recent unmatched Sleep Start and displays it beside the notes. Editing/deleting either event automatically recalculates it.
- **Sleep tracking** in the chart readout shows: total **completed** sleep overlapping the last 24 hours, the last completed sleep duration, average gap from a Sleep End to the next Sleep Start over the last seven days, and whether a sleep session is currently open. An ongoing sleep session is deliberately excluded from the completed 24h total until a Sleep End is saved. The average omits gaps longer than 24 hours (commonly missing records).
- Sessions can span midnight. An End without a Start is left unpaired. If a second Start appears before an End, the newer Start is used. Data is never silently rewritten to fix these cases.
- Older single **Sleep** entries remain exactly as recorded. They are not treated as either Start or End. Previously saved custom event types are preserved.
- Existing v1 server data is upgraded to v2 (adds the two types), with revision checks; first-load browser-only data also adds them once. Deleting a type later does not cause it to reappear automatically.
- **CSV Export and Import remain available and unchanged.** The CSV stays five columns: `timestamp,event_type_id,label,emoji,notes`. Sleep Start and Sleep End are ordinary event rows using `sleep-start` / `sleep-end` event type IDs. Duration is derived from timestamps during display and *not* a separate column; re-importing the CSV recalculates durations.

**No changes to the generic storage API:** the JSON document still lives at `<app>/data/baby-calendar.json` when hosted with your Node launcher, or in localStorage when the endpoint is not present. All UI and API access remains subject to the permissions/security notes below.

## Quick verification

1. Open BabyCalendar. Select **Sleep Start**, set time to 1:30 PM, and save.
2. Select **Sleep End**, set time to 3:00 PM, and save.
3. Verify Event History shows **Sleep duration: 1h 30m** on the Sleep End row, and that Last sleep updates to 1h 30m.
4. Export CSV; both new rows should appear. Importing that CSV into an empty calendar should reproduce the same duration.
5. Reload or open on another device: the events should persist if the generic Node server is active.

## Automated tests

```bash
node test_sleep_events.js
node test_client_storage.js
python3 test_server.py
```

---

# ToolSuite — generic, per-app Node.js JSON storage API

This replaces the previous BabyCalendar-specific persistence endpoint with **one generic JSON-document API for every application folder**. It retains your uploaded server's static hosting, `/healthz`, `/api/health`, CSV functionality, chart UI, and directory redirects. No npm dependencies or database required; Node.js 18+ recommended.

## Install

1. Replace the Node launcher with `server.js`. Restart your service.
2. Replace `ToolSuite/BabyCalendar.html` with the included version, leaving `style.css` and other ToolSuite files alone.
3. The service user must have permission to create `ToolSuite/data/` inside the ToolSuite app folder. No write permission on `WEB_ROOT` itself is necessary.
4. Open your regular `https://your-host/ToolSuite/BabyCalendar.html` page. The app detects the JSON API automatically and otherwise falls back to browser localStorage.

Sample tree (assuming `WEB_ROOT=/srv/www`):

```text
/srv/www/                         <-- may be read-only for Node
  ToolSuite/                      <-- writable by the Node service
    BabyCalendar.html
    style.css
    data/                         <-- created automatically on first save, mode 0700
      baby-calendar.json          <-- mode 0600
  AnotherApp/                     <-- independently writable
    index.html
    data/
      settings.json
```

**Important:** `data/` is a reserved private name and the static file server denies HTTP access to any `data/` directory and to dotfiles. It does not affect other static assets. Application folders must be a *subdirectory* of `WEB_ROOT`; a page directly in `WEB_ROOT` cannot use this API, intentionally, to avoid writing at the root level. A folder must contain at least one `.html` or `.htm` page to enable the API.

### Permissions

Your existing per-app writable directories should suffice. If the service account cannot create `data/`, create it manually under the app directory and assign ownership to that service account (replace `<node-user>`):

```bash
sudo install -d -m 700 -o <node-user> /srv/www/ToolSuite/data
```

There is no `BABY_CALENDAR_DATA_DIR` setting anymore: the data path is derived automatically from the app URL. This makes it impossible for an API *path* to request a document directly from a higher-level folder.

## General API — any application

For a document named `baby-calendar` in `/ToolSuite/`:

```http
GET /ToolSuite/api/storage/baby-calendar
PUT /ToolSuite/api/storage/baby-calendar
```

For a completely different document and app:

```http
GET /AnotherApp/api/storage/settings
PUT /AnotherApp/api/storage/settings
```

A GET of a missing document returns HTTP 200:

```json
{ "version": 1, "revision": 0, "initialized": false, "data": null }
```

PUT an arbitrary JSON value (there are no BabyCalendar schema assumptions):

```http
PUT /AnotherApp/api/storage/settings
Content-Type: application/json

{ "revision": 0, "data": { "theme": "dark", "units": "metric" } }
```

The response is `{ "ok": true, "revision": 1 }`. Subsequent GET returns:

```json
{ "version": 1, "revision": 1, "initialized": true, "data": { "theme": "dark", "units": "metric" } }
```

All later PUTs must use the **latest revision**. A stale revision yields HTTP `409` (with the current revision) instead of silently deleting another device's changes. Each key creates a private JSON file at `<app>/data/<key>.json`; key names are limited to letters, digits, underscores, and hyphens (max 64 characters; start with alphanumeric). Documents are size-limited (8 MB request), stored via atomic temp-file replacement, and the API rejects symlink storage directories and symlink data files.

Browser example, for a page in its own application folder:

```js
const endpoint = new URL('./api/storage/settings', location.href);
const original = await (await fetch(endpoint, { cache: 'no-store' })).json();
const response = await fetch(endpoint, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    revision: original.revision,
    data: { theme: 'dark' }
  })
});
if (response.status === 409) {
  throw new Error('Another browser changed these settings; reload first');
}
if (!response.ok) throw new Error(`Storage failed: ${response.status}`);
```

## BabyCalendar behavior

- Server available: entries and event types are saved in `ToolSuite/data/baby-calendar.json`. They persist across service restarts and are shared by browsers using the same instance.
- Empty new server: the first browser with existing BabyCalendar localStorage data will seed the server automatically (only once).
- Plain static host: API `404`/`405` causes automatic fallback to the old browser localStorage keys.
- Server `5xx`/write problem: edits pause instead of silently saving divergent browser-only copies.
- CSV import/export and the existing chart, types, edit/delete controls are unchanged. Chart range preference stays browser-local.
- Two browsers editing concurrently receive a `409` conflict rather than silent overwrite; reload/retry.

### If you previously deployed the older BabyCalendar-specific API

The old implementation stored its data at `<WEB_ROOT>/.baby-calendar-data/state.json`, or the configured `BABY_CALENDAR_DATA_DIR/state.json`. The generic API uses **a different file format and location**. **Do not simply rename or copy the old JSON file.** Before opening the updated calendar (to avoid seeding stale browser data), stop Node and run:

```bash
node migrate_legacy_baby_calendar.js \
  /srv/www/.baby-calendar-data/state.json \
  /srv/www/ToolSuite
```

Adjust the first argument if the old `BABY_CALENDAR_DATA_DIR` pointed elsewhere. The migration script reads that legacy file, creates `ToolSuite/data/baby-calendar.json`, and refuses to overwrite an existing destination. The original file stays intact as a backup. Run with appropriate access, then restart Node and open BabyCalendar. If you only used browser localStorage before, skip this migration: the browser can seed the new store automatically.

## Security and limitations

- The API **cannot write above the targeted app folder** by accepting `..`, arbitrary file paths, or raw filenames. Storage is always nested in that app's private `data/` folder. `WEB_ROOT` can be mounted read-only while individual app folders are writable.
- This is **filesystem scoping, not user authentication or a true app security boundary**. Pages on the same origin (or any authorized API client) can request another app's endpoint; Node still has OS permissions for its writable app folders. To isolate untrusted users/apps, use separate origins/processes/OS permissions or authenticated reverse proxies.
- Serve this API only on your trusted home LAN, VPN, or behind authentication. Same-origin `Origin` checks on PUT help with browser cross-site writes but are **not authentication**.
- Atomic writing and revisions protect against ordinary write failures and same-process concurrent edits, but separate Node processes writing the same folder do not coordinate locking. Run one server instance per data directory or use a database for multi-process writers.
- For backup, copy app `data/*.json` files or continue to export CSV from BabyCalendar. Persistent volumes are necessary if the Node service runs in a container.

## Tests

```bash
python3 test_server.py
node test_client_storage.js
```

These check API persistence after restarts, read-only web root, app folder independence, stored-file privacy, input validation, symlink protection, stale revisions, browser migration, cross-browser retrieval, and browser-only fallback. They do not perform full graphical browser screenshot testing.
