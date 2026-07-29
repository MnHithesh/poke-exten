# Poke

Tap a teammate on the shoulder when they have headphones on.

You pick a person and hit **Poke**. On their machine a GIF takes over the screen with your
name and a one-line message, a chime plays, a desktop notification fires and the Chrome
icon bounces in the taskbar. They hit **On my way** or **Give me 5** and the reply comes
back to you as a notification.

```
you  ──poke──▶  relay server  ──▶  them
                (LAN, one box)      full-screen GIF + chime + notification
                                    ──"On my way"──▶  back to you
```

## Why there is a server

A browser extension cannot reach another person's laptop by itself. The relay is a small
Node script that keeps track of who is online and forwards a poke to the right person. Run
it once, anywhere on your office network — one teammate's machine is fine.

## Where Angular is, and where it isn't

The **popup is an Angular 22 app**: standalone components, zoneless change detection, and
signals for all state. That is where state actually accumulates — roster, connection,
shared GIF library, settings — and signals handle it cleanly. Messages arriving from the
service worker land in a signal and the view updates, with no zone.js and no manual
change detection.

The **service worker and content script are plain TypeScript**, bundled by esbuild.

That second part is deliberate. A content script runs on every page the person opens, so
its cost is paid constantly, while the overlay itself is on screen for a few seconds a day.
Shipping the framework runtime into every tab to render six elements is the wrong trade:
the content script is 4 kB, against 135 kB for the popup. And a service worker has no DOM
at all, so there is nothing for Angular to do there.

If you would rather have the overlay in Angular too, the way to do it without taxing every
page load is a second build target, lazily imported by the content script when a poke
actually arrives.

---

## 1. Start the relay

```bash
cd server
npm install
npm start          # listens on 8787, use PORT=9000 npm start to change
```

Find the machine's LAN address so others can reach it:

- macOS / Linux: `ipconfig getifaddr en0` or `hostname -I`
- Windows: `ipconfig` → IPv4 Address

You want something like `http://192.168.1.20:8787`. Open `/health` in a browser to confirm.

Uploaded GIFs land in `server/gifs/`. Delete files there to clean up the library.

## 2. Build the extension

Angular 22 needs **Node 22.22.3+, 24.15+, or 26+**. Check with `node -v` first — the CLI
refuses to run on anything older, and the error is easy to misread as a project problem.

```bash
cd extension
npm install
npm run build      # ng build + esbuild, output lands in extension/dist
```

`npm test` runs the same build and then boots the popup in jsdom against a stubbed
`chrome` API, asserting what a person actually sees: the roster renders, poking messages
the right teammate, the button goes on cooldown, worker toasts reach the DOM, and an
unconfigured install lands on the setup panel instead of an empty list.

## 3. Load it

Each teammate does this once:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select `extension/dist` (the build output, not `extension/`)
4. Pin the Poke icon to the toolbar

## 4. Set it up

Click the icon and fill in:

- **Relay address** — the same `http://192.168.1.20:8787` for everybody
- **Your name** — what teammates see on the poke button

The status light goes green when you are connected. Anyone else connected appears in the
list within a second.

## 5. Poke

- Tap **Add** in the GIF strip to upload one. It goes into a shared library, so whatever
  you upload everyone can use. Keep them under 6 MB.
- Pick a GIF, type a message like "standup, 2 minutes", hit **Poke** next to a name.
- The chime and "bring Chrome to the front" are toggles at the bottom. Front focus is off
  by default because it interrupts hard — turn it on for the teammate who never looks up.

---

## Things worth knowing

**The overlay needs a normal web page.** It draws on whatever tab the person is looking at.
On `chrome://` pages, the Web Store, or PDF viewers, extensions cannot draw — the desktop
notification and chime still fire, so the poke still lands.

**Chrome has to be running.** Not focused, not in front, but running. If someone quits
Chrome they drop off the roster and you get "They just went offline."

**Notifications must be allowed at the OS level.** macOS: System Settings → Notifications →
Google Chrome, and check that Focus is not swallowing them. Windows: check Focus assist.

**Plain http is fine on a LAN.** The service worker fetches GIF bytes and hands the page a
data URL, so an https page still displays a GIF served over http. The popup does the same
with blob URLs for thumbnails. If you host the relay outside the office, use `https://` —
`wss://` is derived from it automatically.

**Anyone who can reach the relay can poke and upload.** That is the right trade for a LAN
tool on a trusted network. Do not expose the port to the public internet as is; if you need
to, add a shared token check in `server.js` at the `hello` and `/gifs` handlers.

## Layout

```
server/server.js              presence, poke routing, GIF upload and serving

extension/
  angular.json                build tuned for an extension: relative baseHref,
                              no output hashing, no inlined critical CSS (CSP)
  build.mjs                   esbuild for the worker entries, then verifies every
                              file the manifest references exists
  smoke-test.mjs              jsdom render test against a stubbed chrome API
  public/                     manifest.json, icons, chime, offscreen.html
  src/
    main.ts                   bootstrapApplication + provideZonelessChangeDetection
    styles.css                design tokens and the shared .key / .micro classes
    app/
      app.ts                  root: header, setup or main panels, toast
      core/models.ts          types shared by the popup and the worker
      core/poke.service.ts    signals over chrome.runtime messaging
      core/gif-library.service.ts   shared library, uploads, blob thumbnails
      ui/setup-panel.ts       relay address and name
      ui/roster-list.ts       teammates, poke buttons, cooldown
      ui/gif-strip.ts         library picker and upload tile
      ui/controls.ts          message field and delivery switches
    worker/
      background.ts           socket, poke delivery, notifications, window bounce
      content.ts              the overlay, shadow DOM, no framework
      offscreen.ts            plays the chime (service workers cannot)
```

## Ideas if you want to keep going

- Status per person: "heads down" mutes the overlay and leaves only the notification
- Poke a group at once, for standup
- Remember who you poke most and float them to the top of the roster
- Swap the relay for a Slack app if your team already lives in Slack — same overlay, no
  server to babysit
