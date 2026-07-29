import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { Person } from '../core/models';

const COOLDOWN_MS = 1200;

@Component({
  selector: 'poke-roster',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="micro-row">
      <span class="micro">Who gets poked</span>
      <span class="micro dim">{{ people().length ? people().length + ' online' : '' }}</span>
    </div>

    @if (people().length) {
      <ul>
        @for (person of people(); track person.id) {
          <li>
            <span class="badge">{{ initials(person.name) }}</span>
            <span class="name">{{ person.name }}</span>
            <button
              class="key"
              type="button"
              [disabled]="cooling().has(person.id)"
              (click)="send(person.id)"
            >
              Poke
            </button>
          </li>
        }
      </ul>
    } @else {
      <p class="empty">Nobody else is connected yet.</p>
    }
  `,
  styles: `
    :host { display: block; }
    ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
    li {
      display: flex; align-items: center; gap: 10px;
      padding: 7px 8px 7px 9px;
      border: 1px solid var(--edge); border-radius: 4px;
      background: var(--chassis-hi);
    }
    .badge {
      width: 26px; height: 26px; flex: none;
      display: grid; place-items: center; border-radius: 50%;
      background: var(--ink); color: var(--chassis-hi);
      font: 600 10px/1 var(--mono);
    }
    .name { flex: 1; font-weight: 550; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .empty { margin: 0; font-size: 12px; color: var(--muted); }
  `,
})
export class RosterList {
  readonly people = input.required<Person[]>();
  readonly poke = output<string>();

  protected readonly cooling = signal(new Set<string>());

  protected initials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase();
  }

  protected send(id: string): void {
    this.poke.emit(id);
    this.cooling.update((set) => new Set(set).add(id));
    setTimeout(() => {
      this.cooling.update((set) => {
        const next = new Set(set);
        next.delete(id);
        return next;
      });
    }, COOLDOWN_MS);
  }
}
