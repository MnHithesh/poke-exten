import { Injectable, computed, signal } from '@angular/core';
import { AppState, EMPTY_STATE, Settings } from './models';

/**
 * The single conversation between the popup and the background worker.
 * Everything the UI renders comes out of the `state` signal, which the
 * worker refreshes whenever the roster or the connection changes.
 */
@Injectable({ providedIn: 'root' })
export class PokeService {
  private readonly state = signal<AppState>(EMPTY_STATE);

  readonly status = computed(() => this.state().status);
  readonly people = computed(() => this.state().people);
  readonly settings = computed(() => this.state().settings);
  readonly lastError = computed(() => this.state().lastError);

  readonly configured = computed(() => {
    const s = this.settings();
    return !!s.serverUrl && !!s.name;
  });

  readonly serverBase = computed(() => this.settings().serverUrl.replace(/\/+$/, ''));

  /** Transient one-liner shown at the bottom of the popup. */
  readonly toast = signal('');
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  /** Bumped by the worker when someone uploads a GIF, so the strip reloads. */
  readonly libraryVersion = signal(0);

  constructor() {
    chrome.runtime.onMessage.addListener((msg: any) => {
      if (msg?.type === 'state') this.state.set(msg.state);
      if (msg?.type === 'toast') this.flash(msg.text);
      if (msg?.type === 'library-changed') this.libraryVersion.update((n) => n + 1);
    });
    void this.refresh();
  }

  flash(text: string): void {
    this.toast.set(text);
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toast.set(''), 2200);
  }

  async refresh(): Promise<void> {
    this.state.set(await this.send<AppState>({ type: 'get-state' }));
  }

  async save(patch: Partial<Settings>): Promise<void> {
    this.state.set(await this.send<AppState>({ type: 'save-settings', patch }));
  }

  async reconnect(): Promise<void> {
    this.state.set(await this.send<AppState>({ type: 'connect' }));
  }

  async poke(personId: string): Promise<void> {
    const res = await this.send<{ ok: boolean; error?: string }>({ type: 'poke', to: personId });
    if (!res?.ok) this.flash(res?.error ?? 'Could not send that.');
  }

  private send<T>(message: unknown): Promise<T> {
    return chrome.runtime.sendMessage(message) as Promise<T>;
  }
}
