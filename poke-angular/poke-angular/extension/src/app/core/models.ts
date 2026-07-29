export type Status = 'offline' | 'connecting' | 'online';

export interface Person {
  id: string;
  name: string;
}

export interface GifRef {
  url: string;
  name: string;
}

export interface GifItem extends GifRef {
  /** Blob URL for the thumbnail, resolved lazily. */
  thumb: string | null;
}

export interface Settings {
  serverUrl: string;
  name: string;
  userId: string;
  gif: GifRef | null;
  note: string;
  sound: boolean;
  focusWindow: boolean;
}

export interface AppState {
  status: Status;
  lastError: string;
  people: Person[];
  settings: Settings;
}

export const EMPTY_SETTINGS: Settings = {
  serverUrl: '',
  name: '',
  userId: '',
  gif: null,
  note: '',
  sound: true,
  focusWindow: false,
};

export const EMPTY_STATE: AppState = {
  status: 'offline',
  lastError: '',
  people: [],
  settings: EMPTY_SETTINGS,
};
