/**
 * The overlay a poked person sees.
 *
 * Deliberately plain DOM rather than Angular. A content script runs on every
 * page the person opens, so its cost is paid constantly while the overlay
 * itself appears for a few seconds a day. Shipping the framework runtime into
 * every tab to render six elements is the wrong trade. The popup, where state
 * actually accumulates, is where Angular earns its place.
 *
 * Lives in a closed shadow root so page CSS cannot reach it, and it cannot
 * reach the page's styles either.
 */

interface PokeOverlayMessage {
  type: 'poke-overlay';
  fromId: string;
  fromName: string;
  note: string;
  gif: string | null;
}

declare global {
  interface Window {
    __pokeOverlayReady?: boolean;
  }
}

(() => {
  if (window.__pokeOverlayReady) return;
  window.__pokeOverlayReady = true;

  const HOLD_MS = 14000;
  let host: HTMLDivElement | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }

    .scrim {
      position: fixed; inset: 0; z-index: 2147483647;
      display: grid; place-items: center;
      background: rgba(20, 19, 16, .62);
      backdrop-filter: blur(3px);
      animation: fade .18s ease-out;
    }
    .panel {
      width: min(420px, 88vw);
      background: #E6E2D9;
      border: 1px solid #C9C3B6; border-radius: 6px;
      box-shadow: 0 24px 60px rgba(0,0,0,.45), inset 0 1px 0 #F4F1EA;
      overflow: hidden;
      animation: drop .26s cubic-bezier(.16,.9,.3,1.2);
    }
    .bar {
      display: flex; align-items: center; gap: 8px;
      padding: 9px 14px;
      background: #2B34E0; color: #EDECFF;
      font: 600 10px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
      letter-spacing: .16em; text-transform: uppercase;
    }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: #EDECFF; animation: pulse 1s ease-in-out infinite; }
    .who { padding: 18px 20px 12px; }
    .who h1 { font-size: 21px; font-weight: 700; letter-spacing: -.01em; color: #1B1A17; }
    .who p  { margin-top: 5px; font-size: 13.5px; line-height: 1.4; color: #6E6858; }
    figure { margin: 0 14px; background: #1B1A17; border-radius: 4px; overflow: hidden; }
    figure img { display: block; width: 100%; max-height: 240px; object-fit: contain; }
    .row { display: flex; gap: 8px; padding: 14px; }
    button {
      flex: 1; padding: 11px 10px; border-radius: 4px; cursor: pointer;
      font: 600 12.5px/1 system-ui, sans-serif;
      border: 1px solid #C9C3B6; background: #F4F1EA; color: #1B1A17;
      transition: transform .06s ease, background .12s ease;
    }
    button:hover { background: #FBF9F4; }
    button:active { transform: translateY(1px); }
    button:focus-visible { outline: 2px solid #2B34E0; outline-offset: 2px; }
    button.primary { background: #2B34E0; border-color: #2B34E0; color: #fff; }
    button.primary:hover { background: #3A42EC; }
    .hold { height: 3px; background: #C9C3B6; }
    .hold i { display: block; height: 100%; background: #2B34E0; transform-origin: left; animation: drain var(--hold) linear forwards; }

    @keyframes fade  { from { opacity: 0 } }
    @keyframes drop  { from { opacity: 0; transform: translateY(-14px) } }
    @keyframes pulse { 50% { opacity: .25 } }
    @keyframes drain { to { transform: scaleX(0) } }

    @media (prefers-reduced-motion: reduce) { .scrim, .panel, .dot { animation: none; } }
  `;

  function close(): void {
    clearTimeout(timer);
    host?.remove();
    host = null;
    document.removeEventListener('keydown', onKey, true);
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  }

  function reply(toId: string, text: string): void {
    void chrome.runtime.sendMessage({ type: 'reply', to: toId, text }).catch(() => {});
    close();
  }

  function button(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
    const el = document.createElement('button');
    el.textContent = label;
    if (primary) el.className = 'primary';
    el.addEventListener('click', onClick);
    return el;
  }

  function show({ fromId, fromName, note, gif }: PokeOverlayMessage): void {
    close();

    host = document.createElement('div');
    host.style.cssText = 'all:initial;position:fixed;inset:0;z-index:2147483647';
    const root = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = CSS;

    const scrim = document.createElement('div');
    scrim.className = 'scrim';

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.setProperty('--hold', `${HOLD_MS}ms`);

    const bar = document.createElement('div');
    bar.className = 'bar';
    const dot = document.createElement('span');
    dot.className = 'dot';
    bar.append(dot, document.createTextNode('Shoulder tap'));

    const who = document.createElement('div');
    who.className = 'who';
    const heading = document.createElement('h1');
    heading.textContent = `${fromName} needs you`;
    const sub = document.createElement('p');
    sub.textContent = note || 'Headphones off for a second?';
    who.append(heading, sub);

    panel.append(bar, who);

    if (gif) {
      const figure = document.createElement('figure');
      const img = document.createElement('img');
      img.src = gif;
      img.alt = '';
      figure.append(img);
      panel.append(figure);
    }

    const coming = button('On my way', true, () => reply(fromId, 'On my way'));
    const row = document.createElement('div');
    row.className = 'row';
    row.append(
      coming,
      button('Give me 5', false, () => reply(fromId, 'Give me 5 minutes')),
      button('Dismiss', false, close)
    );

    const hold = document.createElement('div');
    hold.className = 'hold';
    hold.append(document.createElement('i'));

    panel.append(row, hold);
    scrim.append(panel);
    root.append(style, scrim);
    document.documentElement.append(host);

    coming.focus();
    document.addEventListener('keydown', onKey, true);
    timer = setTimeout(close, HOLD_MS);
  }

  chrome.runtime.onMessage.addListener((msg: PokeOverlayMessage) => {
    if (msg?.type === 'poke-overlay') show(msg);
  });
})();

export {};
