import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { GifItem } from '../core/models';

@Component({
  selector: 'poke-gif-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="micro-row">
      <span class="micro">GIF that lands on their screen</span>
      <button class="linky" type="button" (click)="reload.emit()">Refresh</button>
    </div>

    <div class="strip">
      @for (gif of gifs(); track gif.url) {
        <button
          class="tile"
          type="button"
          [class.chosen]="gif.url === selected()"
          [title]="gif.name"
          (click)="choose.emit(gif)"
        >
          @if (gif.thumb) {
            <img [src]="gif.thumb" [alt]="gif.name" />
          }
        </button>
      }

      <label class="tile add" tabindex="0" (keydown.enter)="file.click()">
        <input #file type="file" accept="image/gif" hidden (change)="onPick($event)" />
        <span>+</span>
        <em class="micro">Add</em>
      </label>
    </div>
  `,
  styles: `
    :host { display: block; }
    .strip { display: flex; gap: 7px; overflow-x: auto; padding-bottom: 4px; }
    .tile {
      flex: 0 0 66px; height: 56px; padding: 0;
      border: 1px solid var(--edge); border-radius: 4px;
      background: var(--chassis-hi); overflow: hidden; cursor: pointer;
    }
    .tile img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .tile.chosen { border-color: var(--signal); box-shadow: 0 0 0 2px rgb(43 52 224 / .28); }
    .tile:focus-visible { outline: 2px solid var(--signal); outline-offset: 1px; }
    .add {
      display: grid; place-items: center; align-content: center; gap: 2px;
      border-style: dashed; color: var(--muted);
    }
    .add span { font-size: 18px; line-height: 1; }
  `,
})
export class GifStrip {
  readonly gifs = input.required<GifItem[]>();
  readonly selected = input<string | null>(null);

  readonly choose = output<GifItem>();
  readonly upload = output<File>();
  readonly reload = output<void>();

  protected onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.upload.emit(file);
    input.value = '';
  }
}
