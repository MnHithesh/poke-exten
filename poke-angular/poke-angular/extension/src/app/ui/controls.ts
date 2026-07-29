import { ChangeDetectionStrategy, Component, input, linkedSignal, output } from '@angular/core';
import { Settings } from '../core/models';

@Component({
  selector: 'poke-controls',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="block">
      <label class="micro" for="note">Message with the poke</label>
      <input
        id="note"
        type="text"
        maxlength="120"
        placeholder="Standup, 2 minutes"
        [value]="note()"
        (input)="note.set($any($event.target).value)"
        (change)="change.emit({ note: note().trim() })"
      />
    </div>

    <div class="block switches">
      <label class="switch">
        <input
          type="checkbox"
          [checked]="settings().sound"
          (change)="change.emit({ sound: $any($event.target).checked })"
        />
        <span>Play a chime</span>
      </label>

      <label class="switch">
        <input
          type="checkbox"
          [checked]="settings().focusWindow"
          (change)="change.emit({ focusWindow: $any($event.target).checked })"
        />
        <span>Bring Chrome to the front</span>
      </label>

      <button class="linky" type="button" (click)="edit.emit()">Change name or server</button>
    </div>
  `,
  styles: `
    :host { display: block; }
    .block { padding: 12px 14px; border-bottom: 1px solid var(--edge); }
    .block:last-child { border-bottom: 0; }
    .micro { margin-bottom: 6px; }
    input[type='text'] {
      width: 100%; padding: 9px 10px;
      border: 1px solid var(--edge); border-radius: 3px;
      background: var(--chassis-hi); color: var(--ink);
      font: 13px/1.2 system-ui, sans-serif;
    }
    input[type='text']:focus { outline: 2px solid var(--signal); outline-offset: 1px; border-color: var(--signal); }
    .switches { display: grid; gap: 9px; }
    .switch { display: flex; align-items: center; gap: 8px; font-size: 12.5px; cursor: pointer; }
    .switch input { accent-color: var(--signal); width: 14px; height: 14px; }
  `,
})
export class Controls {
  readonly settings = input.required<Settings>();

  readonly change = output<Partial<Settings>>();
  readonly edit = output<void>();

  protected readonly note = linkedSignal(() => this.settings().note);
}
