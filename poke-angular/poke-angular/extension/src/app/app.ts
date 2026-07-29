import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { GifLibraryService } from './core/gif-library.service';
import { PokeService } from './core/poke.service';
import { GifItem, Settings } from './core/models';
import { Controls } from './ui/controls';
import { GifStrip } from './ui/gif-strip';
import { RosterList } from './ui/roster-list';
import { SetupPanel } from './ui/setup-panel';

@Component({
  selector: 'poke-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SetupPanel, RosterList, GifStrip, Controls],
  template: `
    <header>
      <span class="wordmark">Poke</span>
      <button class="status" type="button" title="Reconnect" (click)="poke.reconnect()">
        <span class="led" [class]="poke.status()"></span>
        <span>{{ statusLabel() }}</span>
      </button>
    </header>

    @if (showSetup()) {
      <poke-setup
        [serverUrl]="settings().serverUrl"
        [personName]="settings().name"
        [hint]="setupHint()"
        (connect)="onConnect($event)"
      />
    } @else {
      <div class="block"><poke-roster [people]="poke.people()" (poke)="poke.poke($event)" /></div>

      <div class="block">
        <poke-gif-strip
          [gifs]="library.gifs()"
          [selected]="settings().gif?.url ?? null"
          (choose)="onChooseGif($event)"
          (upload)="library.upload($event)"
          (reload)="library.load()"
        />
      </div>

      <poke-controls [settings]="settings()" (change)="onChange($event)" (edit)="editing.set(true)" />
    }

    <p class="toast" [class.up]="!!poke.toast()">{{ poke.toast() }}</p>
  `,
  styles: `
    :host { display: block; }

    header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 11px 14px;
      background: var(--ink); color: var(--chassis-hi);
    }
    .wordmark { font: 700 13px/1 var(--mono); letter-spacing: .28em; text-transform: uppercase; }

    .status {
      display: flex; align-items: center; gap: 6px;
      padding: 4px 8px;
      border: 1px solid #3b3933; border-radius: 3px;
      background: none; color: #cfcabb;
      font: 600 9.5px/1 var(--mono); letter-spacing: .12em; text-transform: uppercase;
      cursor: pointer;
    }
    .status:hover { border-color: #56534a; }

    .led { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); }
    .led.online { background: var(--live); box-shadow: 0 0 0 3px rgb(46 125 79 / .2); }
    .led.connecting { background: #c9a227; }

    .block { padding: 12px 14px; border-bottom: 1px solid var(--edge); }

    .toast {
      position: fixed; left: 14px; right: 14px; bottom: 10px;
      margin: 0; padding: 8px 11px; border-radius: 4px;
      background: var(--ink); color: var(--chassis-hi); font-size: 12px;
      opacity: 0; transform: translateY(6px); pointer-events: none;
      transition: opacity .16s ease, transform .16s ease;
    }
    .toast.up { opacity: 1; transform: none; }

    @media (prefers-reduced-motion: reduce) { .toast { transition: none; } }
  `,
})
export class App {
  protected readonly poke = inject(PokeService);
  protected readonly library = inject(GifLibraryService);

  protected readonly settings = this.poke.settings;
  protected readonly editing = signal(false);

  protected readonly showSetup = computed(() => this.editing() || !this.poke.configured());

  protected readonly statusLabel = computed(() => {
    switch (this.poke.status()) {
      case 'online':
        return 'Online';
      case 'connecting':
        return 'Connecting';
      default:
        return 'Offline';
    }
  });

  protected readonly setupHint = computed(() =>
    this.poke.status() === 'offline' ? this.poke.lastError() : ''
  );

  protected async onConnect(details: { serverUrl: string; name: string }): Promise<void> {
    await this.poke.save(details);
    this.editing.set(false);
  }

  protected onChooseGif(gif: GifItem): void {
    void this.poke.save({ gif: { url: gif.url, name: gif.name } });
  }

  protected onChange(patch: Partial<Settings>): void {
    void this.poke.save(patch);
  }
}
