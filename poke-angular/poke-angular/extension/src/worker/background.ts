/**
 * Background service worker.
 * Holds the socket to the relay, and turns an incoming poke into something
 * a person wearing headphones cannot miss: full-screen GIF, chime, desktop
 * notification, taskbar bounce.
 *
 * Bundled to background.js by build.mjs. Not part of the Angular app: the
 * worker has no DOM, so there is nothing for Angular to do here.
 */

import { AppState, EMPTY_SETTINGS, Person, Settings } from '../app/core/models';

interface PokeMessage {
  type: 'poke';
  fromId: string;
  fromName: string;
  gif: string | null;
  note: string;
  at: number;
}

interface ReplyMessage {
  type: 'reply';
  fromId: string;
  fromName: string;
  text: string;
  at: number;
}

let settings: Settings = { ...EMPTY_SETTINGS };
let socket: WebSocket | null = null;
let people: Person[] = [];
let status: AppState['status'] = 'offline';
let lastError = '';

const gifCache = new Map<string, string>();

/* ------------------------------------------------------------------ storage */

async function loadSettings(): Promise<void> {
  const stored = await chrome.storage.local.get('settings');
  settings = { ...EMPTY_SETTINGS, ...(stored['settings'] ?? {}) };
  if (!settings.userId) {
    settings.userId = crypto.randomUUID();
    await chrome.storage.local.set({ settings });
  }
}

async function saveSettings(patch: Partial<Settings>): Promise<void> {
  settings = { ...settings, ...patch };
  await chrome.storage.local.set({ settings });
}

/* ---------------------------------------------------------------- broadcast */

function snapshot(): AppState {
  return {
    status,
    lastError,
    people: people.filter((p) => p.id !== settings.userId),
    settings,
  };
}

function emitState(): void {
  void chrome.runtime.sendMessage({ type: 'state', state: snapshot() }).catch(() => {});
}

function tell(text: string): void {
  void chrome.runtime.sendMessage({ type: 'toast', text }).catch(() => {});
}

function setStatus(next: AppState['status'], error = ''): void {
  status = next;
  lastError = error;
  emitState();
  void chrome.action.setBadgeBackgroundColor({ color: next === 'online' ? '#2e7d4f' : '#8a8478' });
  void chrome.action.setBadgeText({ text: next === 'online' ? '' : '!' });
}

/* --------------------------------------------------------------- connection */

function wsUrl(): string {
  return settings.serverUrl.trim().replace(/\/+$/, '').replace(/^http/, 'ws');
}

function connect(): void {
  if (!settings.serverUrl || !settings.name) {
    setStatus('offline', 'Add the server address and your name first.');
    return;
  }
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  setStatus('connecting');
  try {
    socket = new WebSocket(wsUrl());
  } catch {
    setStatus('offline', 'That server address is not valid.');
    return;
  }

  socket.addEventListener('open', () => {
    socket?.send(JSON.stringify({ type: 'hello', id: settings.userId, name: settings.name }));
    setStatus('online');
  });

  socket.addEventListener('message', (event) => {
    try {
      handleServerMessage(JSON.parse(event.data as string));
    } catch {
      /* ignore malformed frames */
    }
  });

  socket.addEventListener('close', () => {
    people = [];
    setStatus('offline', 'Lost the connection. Retrying.');
  });

  socket.addEventListener('error', () => {
    setStatus('offline', 'Could not reach the relay server.');
  });
}

function handleServerMessage(msg: any): void {
  switch (msg.type) {
    case 'roster':
      people = msg.people as Person[];
      emitState();
      break;
    case 'poke':
      void deliverPoke(msg as PokeMessage);
      break;
    case 'reply':
      showReply(msg as ReplyMessage);
      break;
    case 'poke-sent':
      tell(`Poked ${msg.toName}.`);
      break;
    case 'poke-failed':
      tell('They just went offline.');
      break;
    case 'library-changed':
      void chrome.runtime.sendMessage({ type: 'library-changed' }).catch(() => {});
      break;
  }
}

// The ping keeps the socket warm and, usefully, keeps this worker alive.
chrome.alarms.create('heartbeat', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== 'heartbeat') return;
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: 'ping' }));
  } else {
    connect();
  }
});

/* ---------------------------------------------------------------- gif fetch */

function toDataUrl(buffer: ArrayBuffer, mime: string): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

/**
 * The relay usually runs on plain http on the LAN, and an https page will not
 * load an http image. So the worker fetches the bytes and hands the page a
 * data URL instead.
 */
async function resolveGif(path: string | null): Promise<string | null> {
  if (!path) return null;
  const cached = gifCache.get(path);
  if (cached) return cached;

  const base = settings.serverUrl.replace(/\/+$/, '');
  const full = path.startsWith('http') ? path : base + path;
  try {
    const res = await fetch(full);
    if (!res.ok) return null;
    const dataUrl = toDataUrl(await res.arrayBuffer(), 'image/gif');
    gifCache.set(path, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------- sound */

async function ensureOffscreen(): Promise<void> {
  const contexts = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT' as any] });
  if (contexts.length) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK' as chrome.offscreen.Reason],
    justification: 'Play an alert chime when a teammate pokes you.',
  });
}

async function playChime(): Promise<void> {
  if (!settings.sound) return;
  try {
    await ensureOffscreen();
    void chrome.runtime.sendMessage({ target: 'offscreen', type: 'play' }).catch(() => {});
  } catch {
    /* audio is a nice-to-have, never block the poke on it */
  }
}

/* ------------------------------------------------------------- poke arrival */

async function deliverPoke(msg: PokeMessage): Promise<void> {
  // const gif = await resolveGif(msg.gif);
   const gif = await resolveGif(settings.gif?.url ?? null);
  void playChime();

  chrome.notifications.create(`poke-${msg.fromId}-${msg.at}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: `${msg.fromName} is poking you`,
    message: msg.note || 'Headphones off for a second?',
    priority: 2,
    requireInteraction: true,
  });

  try {
    const win = await chrome.windows.getLastFocused();
    if (win?.id !== undefined) {
      await chrome.windows.update(win.id, {
        drawAttention: true,
        ...(settings.focusWindow ? { focused: true } : {}),
      });
    }
  } catch {
    /* no window open */
  }

  const payload = {
    type: 'poke-overlay',
    fromId: msg.fromId,
    fromName: msg.fromName,
    note: msg.note,
    gif,
  };

  const tabs = await chrome.tabs.query({ active: true });
  for (const tab of tabs) {
    if (tab.id === undefined || !/^https?:/.test(tab.url ?? '')) continue;
    try {
      await chrome.tabs.sendMessage(tab.id, payload);
    } catch {
      // Tab loaded before the extension did: inject and retry once.
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        await chrome.tabs.sendMessage(tab.id, payload);
      } catch {
        /* restricted page; the notification already covers it */
      }
    }
  }
}

function showReply(msg: ReplyMessage): void {
  void playChime();
  chrome.notifications.create(`reply-${msg.fromId}-${msg.at}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: msg.fromName,
    message: msg.text,
    priority: 1,
  });
}

/* ----------------------------------------------------------------- messages */

chrome.runtime.onMessage.addListener((msg: any, _sender, sendResponse) => {
  if (msg?.target === 'offscreen') return undefined;

  void (async () => {
    switch (msg?.type) {
      case 'get-state':
        sendResponse(snapshot());
        break;

      case 'save-settings': {
        const patch = msg.patch as Partial<Settings>;
        await saveSettings(patch);
        if (patch.serverUrl !== undefined || patch.name !== undefined) {
          socket?.close();
          socket = null;
          gifCache.clear();
          connect();
        }
        sendResponse(snapshot());
        break;
      }

      case 'connect':
        connect();
        sendResponse(snapshot());
        break;

      case 'poke':
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: 'poke',
              to: msg.to,
              gif: settings.gif?.url ?? null,
              note: settings.note,
            })
          );
          sendResponse({ ok: true });
        } else {
          sendResponse({ ok: false, error: 'Not connected.' });
        }
        break;

      case 'reply':
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'reply', to: msg.to, text: msg.text }));
        }
        sendResponse({ ok: true });
        break;

      default:
        sendResponse({});
    }
  })();

  return true; // response is async
});

chrome.notifications.onClicked.addListener((id) => chrome.notifications.clear(id));

/* ------------------------------------------------------------------ startup */

async function boot(): Promise<void> {
  await loadSettings();
  connect();
}

chrome.runtime.onInstalled.addListener(() => void boot());
chrome.runtime.onStartup.addListener(() => void boot());
void boot();
