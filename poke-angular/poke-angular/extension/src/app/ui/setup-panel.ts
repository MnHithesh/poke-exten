import { ChangeDetectionStrategy, Component, input, linkedSignal, output } from '@angular/core';

@Component({
  selector: 'poke-setup',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <label class="micro" for="relay">Relay address</label>
    <input
      id="relay"
      type="text"
      spellcheck="false"
      placeholder="http://192.168.1.20:8787"
      [value]="url()"
      (input)="url.set($any($event.target).value)"
    />

    <label class="micro" for="who">Your name</label>
    <input
      id="who"
      type="text"
      maxlength="40"
      placeholder="Priya"
      [value]="who()"
      (input)="who.set($any($event.target).value)"
      (keydown.enter)="submit()"
    />

    <button class="key key-wide" type="button" (click)="submit()">Connect</button>

    <p class="hint" [class.bad]="!!problem()">
      {{ problem() || hint() || 'Everyone on the team points at the same address.' }}
    </p>
  `,
  styles: `
    :host { display: block; padding: 16px 14px 18px; }
    .micro { margin-bottom: 6px; }
    .micro + input { margin-bottom: 14px; }
    input {
      width: 100%; padding: 9px 10px;
      border: 1px solid var(--edge); border-radius: 3px;
      background: var(--chassis-hi); color: var(--ink);
      font: 13px/1.2 system-ui, sans-serif;
    }
    input:focus { outline: 2px solid var(--signal); outline-offset: 1px; border-color: var(--signal); }
    .hint { margin-top: 10px; font-size: 11.5px; color: var(--muted); }
    .hint.bad { color: #b2361f; }
  `,
})
export class SetupPanel {
  readonly serverUrl = input('');
  readonly personName = input('');
  readonly hint = input('');

  readonly connect = output<{ serverUrl: string; name: string }>();

  protected readonly url = linkedSignal(() => this.serverUrl());
  protected readonly who = linkedSignal(() => this.personName());
  protected readonly problem = linkedSignal<string>(() => '');

  protected submit(): void {
    const serverUrl = this.url().trim();
    const name = this.who().trim();

    if (!/^https?:\/\//.test(serverUrl)) {
      this.problem.set('The address needs to start with http:// or https://');
      return;
    }
    if (!name) {
      this.problem.set('Your teammates need a name to poke.');
      return;
    }
    this.problem.set('');
    this.connect.emit({ serverUrl, name });
  }
}
