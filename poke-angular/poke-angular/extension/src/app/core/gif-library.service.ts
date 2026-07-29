import { Injectable, effect, inject, signal } from '@angular/core';
import { GifItem } from './models';
import { PokeService } from './poke.service';

const MAX_BYTES = 6 * 1024 * 1024;

/**
 * The GIF library lives on the relay so the whole team shares one set.
 *
 * Thumbnails are fetched as blobs rather than pointed at directly: the relay
 * usually runs on plain http, and the popup is a secure context that will not
 * render an http image. Blob URLs sidestep that.
 */
@Injectable({ providedIn: 'root' })
export class GifLibraryService {
  private readonly poke = inject(PokeService);
  private readonly blobs = new Map<string, string>();

  readonly gifs = signal<GifItem[]>([]);
  readonly loading = signal(false);

  constructor() {
    // Reload when the server address changes, or when someone else uploads.
    effect(() => {
      const base = this.poke.serverBase();
      this.poke.libraryVersion();
      if (base) void this.load();
    });
  }

  async load(): Promise<void> {
    const base = this.poke.serverBase();
    if (!base) return;
    this.loading.set(true);
    try {
      const res = await fetch(`${base}/gifs`);
      const data = (await res.json()) as { gifs: { url: string; name: string }[] };
      this.gifs.set(data.gifs.map((g) => ({ ...g, thumb: this.blobs.get(g.url) ?? null })));
      await Promise.all(data.gifs.map((g) => this.resolveThumb(g.url)));
    } catch {
      this.gifs.set([]);
      this.poke.flash('Could not reach the relay for GIFs.');
    } finally {
      this.loading.set(false);
    }
  }

  async upload(file: File): Promise<void> {
    const base = this.poke.serverBase();
    if (!base) return;
    if (file.type !== 'image/gif') return this.poke.flash('Pick a .gif file.');
    if (file.size > MAX_BYTES) return this.poke.flash('Under 6 MB, please.');

    this.poke.flash('Uploading…');
    try {
      const res = await fetch(`${base}/gifs`, {
        method: 'POST',
        headers: { 'Content-Type': 'image/gif', 'X-Filename': file.name },
        body: file,
      });
      const data = (await res.json()) as { url?: string; name?: string; error?: string };
      if (!res.ok || !data.url) return this.poke.flash(data.error ?? 'Upload failed.');
      await this.load();
      await this.poke.save({ gif: { url: data.url, name: data.name ?? 'poke' } });
      this.poke.flash('Added. It is now your poke GIF.');
    } catch {
      this.poke.flash('Upload failed. Is the relay running?');
    }
  }

  private async resolveThumb(url: string): Promise<void> {
    if (this.blobs.has(url)) return;
    try {
      const res = await fetch(this.poke.serverBase() + url);
      const blobUrl = URL.createObjectURL(await res.blob());
      this.blobs.set(url, blobUrl);
      this.gifs.update((list) => list.map((g) => (g.url === url ? { ...g, thumb: blobUrl } : g)));
    } catch {
      /* a missing thumbnail is not worth an error message */
    }
  }
}
