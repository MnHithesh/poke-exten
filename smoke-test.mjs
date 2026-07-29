/**
 * Boots the built popup in jsdom with a fake chrome API and a fake relay,
 * then asserts what the person actually sees. Catches template and wiring
 * mistakes that the compiler cannot: a binding against a null setting, a
 * signal that never propagates, a click that emits nothing.
 *
 * Run: node smoke-test.mjs   (after npm run build)
 */

import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const settings = {
  serverUrl: 'http://localhost:8799',
  name: 'Priya',
  userId: 'id-a',
  gif: { url: '/gifs/abc-wave.gif', name: 'wave' },
  note: 'Standup',
  sound: true,
  focusWindow: false,
};

const state = {
  status: 'online',
  lastError: '',
  people: [
    { id: 'id-b', name: 'Arun Kumar' },
    { id: 'id-c', name: 'Meera' },
  ],
  settings,
};

const sent = [];
const listeners = [];

const chrome = {
  runtime: {
    onMessage: { addListener: (fn) => listeners.push(fn) },
    sendMessage: async (msg) => {
      sent.push(msg);
      if (msg.type === 'get-state' || msg.type === 'save-settings' || msg.type === 'connect') {
        return state;
      }
      if (msg.type === 'poke') return { ok: true };
      return {};
    },
  },
};

const dom = new JSDOM(readFileSync('dist/popup.html', 'utf8'), {
  url: 'chrome-extension://poke/popup.html',
  pretendToBeVisual: true,
  runScripts: 'outside-only',
});

const { window } = dom;
window.chrome = chrome;
window.fetch = async (url) => {
  if (String(url).endsWith('/gifs')) {
    return { ok: true, json: async () => ({ gifs: [{ url: '/gifs/abc-wave.gif', name: 'wave' }] }) };
  }
  return { ok: true, blob: async () => new window.Blob([new Uint8Array([71, 73, 70, 56])]) };
};
window.URL.createObjectURL = () => 'blob:fake';

window.eval(readFileSync('dist/main.js', 'utf8'));

const results = [];
function check(label, condition) {
  results.push({ label, ok: !!condition });
}

await new Promise((resolve) => setTimeout(resolve, 300));

const text = window.document.body.textContent;
const buttons = [...window.document.querySelectorAll('button')];

check('popup renders instead of staying blank', window.document.body.innerHTML.length > 200);
check('asks the worker for state on boot', sent.some((m) => m.type === 'get-state'));
check('shows the connection status', text.includes('Online'));
check('lists both teammates', text.includes('Arun Kumar') && text.includes('Meera'));
check('shows initials, not full names, in the badge', text.includes('AK'));
check('renders a Poke button per teammate', buttons.filter((b) => b.textContent.trim() === 'Poke').length === 2);
check('loads the shared GIF library', window.document.querySelectorAll('.tile').length >= 2);
check('marks the chosen GIF', !!window.document.querySelector('.tile.chosen'));
check('carries the saved message into the field', window.document.querySelector('#note')?.value === 'Standup');
check('does not show setup once configured', !text.includes('Relay address'));

// Poking a teammate should message the worker and disable the button briefly.
const pokeButton = buttons.find((b) => b.textContent.trim() === 'Poke');
pokeButton.click();
await new Promise((resolve) => setTimeout(resolve, 60));
check('poking sends the right person to the worker', sent.some((m) => m.type === 'poke' && m.to === 'id-b'));
check('poke button goes on cooldown', pokeButton.disabled === true);

// A toast pushed from the worker should reach the DOM.
listeners.forEach((fn) => fn({ type: 'toast', text: 'Poked Arun Kumar.' }));
await new Promise((resolve) => setTimeout(resolve, 60));
check('worker toasts reach the popup', window.document.body.textContent.includes('Poked Arun Kumar.'));

// An unconfigured install should land on setup instead of an empty roster.
listeners.forEach((fn) =>
  fn({
    type: 'state',
    state: { status: 'offline', lastError: '', people: [], settings: { ...settings, serverUrl: '', name: '' } },
  })
);
await new Promise((resolve) => setTimeout(resolve, 60));
check('falls back to setup when unconfigured', window.document.body.textContent.includes('Relay address'));

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}`);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
