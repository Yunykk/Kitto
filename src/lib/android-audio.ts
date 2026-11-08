import type { AudioPlaybackSnapshot, AudioProgress } from "./audio-desktop";
import type { EqualizerSettings } from "./equalizer";
import type { RepeatMode } from "./settings";
import type { QueueTrack } from "./types";
import type { TuningTarget } from "./tuning";

export type AndroidPlayback = {
  serviceId?: string;
  equalizerAvailable?: boolean;
  path: string | null;
  index: number;
  position: number;
  duration: number;
  playing: boolean;
  buffering: boolean;
  ended: boolean;
  error: string | null;
  revision: number;
  canNext: boolean;
  canPrevious: boolean;
  shuffle: boolean;
  repeatMode: RepeatMode;
};

type Request = <T>(command: string, payload?: Record<string, unknown>) => Promise<T>;
const emptyState = (): AndroidPlayback => ({
  path: null, index: -1, position: 0, duration: 0, playing: false,
  buffering: false, ended: false, error: null, revision: 0,
  canNext: false, canPrevious: false, shuffle: false, repeatMode: "off",
});

/** The service owns the playlist; the WebView only renders its current state. */
export function createAndroidAudio(request: Request) {
  let state = emptyState();
  let generation = 0;
  let loadId = 0;
  let context: QueueTrack[] = [];
  let chain: Promise<unknown> = Promise.resolve();
  let connection: Promise<AndroidPlayback> | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let polling = false;
  let pendingCommands = 0;
  let disposed = false;
  let lastError: string | null = null;
  const states = new Set<(value: AndroidPlayback) => void>();
  const progress = new Set<(value: AudioProgress) => void>();
  const playback = new Set<(value: AudioPlaybackSnapshot) => void>();
  const errors = new Set<() => void>();
  const ended = new Set<() => void>();

  function snapshot(): AudioPlaybackSnapshot {
    return { loadId, path: state.path, currentTime: state.position, duration: state.duration,
      active: state.playing && !state.buffering && !state.ended && !state.error,
      seeking: state.buffering, ended: state.ended, playbackRate: 1 };
  }
  function publish() {
    for (const listener of states) listener({ ...state });
    for (const listener of progress) listener({ currentTime: state.position, duration: state.duration });
    for (const listener of playback) listener(snapshot());
  }
  function accept(value: AndroidPlayback, expected = generation) {
    if (disposed || expected !== generation || !value || typeof value.revision !== "number") return;
    // An older in-flight poll must never rewind a newer command or track.
    if ((!value.serviceId || value.serviceId === state.serviceId) && value.revision < state.revision) return;
    const didEnd = value.ended && !state.ended;
    if (state.path !== value.path) loadId++;
    state = { ...value, position: Math.max(0, Number.isFinite(value.position) ? value.position : 0),
      duration: Math.max(0, Number.isFinite(value.duration) ? value.duration : 0) };
    publish();
    if (value.error && value.error !== lastError) for (const listener of errors) listener();
    lastError = value.error;
    if (didEnd) for (const listener of ended) listener();
  }
  function report(error: unknown) {
    state = { ...state, playing: false, buffering: false,
      error: error instanceof Error ? error.message : String(error) };
    publish();
    if (state.error !== lastError) for (const listener of errors) listener();
    lastError = state.error;
  }
  function command(name: string, payload: Record<string, unknown> = {}) {
    const expected = ++generation;
    pendingCommands++;
    const result = chain.catch(() => {}).then(() => request<AndroidPlayback>(name, payload));
    chain = result;
    return result.then(value => { accept(value, expected); return value; }).catch(error => {
      if (expected === generation && !disposed) report(error);
      throw error;
    }).finally(() => { pendingCommands--; });
  }
  const fire = (name: string, payload: Record<string, unknown> = {}) => { void command(name, payload).catch(() => {}); };
  async function refresh() {
    if (polling || pendingCommands > 0 || disposed) return;
    polling = true;
    const expected = generation;
    try { accept(await request<AndroidPlayback>("snapshot"), expected); }
    catch (error) { if (expected === generation) report(error); }
    finally { polling = false; }
  }
  function connect() {
    if (!connection) {
      connection = command("snapshot").then(value => {
        if (!disposed && !timer) timer = setInterval(() => { void refresh(); }, 500);
        return value;
      }).catch(error => { connection = null; throw error; });
    }
    return connection;
  }
  function setContext(tracks: readonly QueueTrack[]) { context = tracks.map(track => ({ ...track })); }
  function queuePayload(path: string | null, position: number, autoplay: boolean, preserveCurrent: boolean) {
    const tracks = context.length ? context : path ? [{ id: path, path, title: path.split("/").pop() ?? path }] : [];
    return { tracks, index: Math.max(0, tracks.findIndex(track => track.path === path)), position, autoplay, preserveCurrent };
  }
  function loadAudio(path: string, position = 0) {
    loadId++;
    state = { ...state, path, position: Number.isFinite(position) ? Math.max(0, position) : 0,
      playing: false, duration: 0, ended: false, error: null, buffering: true };
    publish();
    fire("setQueue", queuePayload(path, state.position, false, false));
  }
  function syncQueue(tracks: readonly QueueTrack[]) {
    setContext(tracks);
    if (!state.path) return;
    fire("setQueue", queuePayload(state.path, state.position, state.playing, true));
  }
  function subscribe<T>(listeners: Set<(value: T) => void>, listener: (value: T) => void, value: T) {
    listeners.add(listener); listener(value);
    return () => { listeners.delete(listener); };
  }
  return {
    connect, refresh, setContext, syncQueue,
    get state() { return { ...state }; },
    onState: (callback: (value: AndroidPlayback) => void) => subscribe(states, callback, { ...state }),
    setOptions: (shuffle: boolean, repeatMode: RepeatMode) => fire("options", { shuffle, repeatMode }),
    next: () => fire("next"), previous: () => fire("previous"),
    loadAudio,
    unloadAudio() { state = { ...emptyState(), revision: state.revision }; loadId++; publish(); fire("stop"); },
    async playAudio() { await command("play"); },
    pauseAudio() { state = { ...state, playing: false }; publish(); fire("pause"); },
    setVolume: (volume: number) => fire("volume", { volume: Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 1 }),
    seekTo(position: number) {
      if (!Number.isFinite(position)) return;
      state = { ...state, position: Math.max(0, Math.min(position, state.duration || position)) };
      publish(); fire("seek", { position: state.position });
    },
    configureEqualizer: (settings: EqualizerSettings) => fire("equalizer", { ...settings }),
    configureTuning: async (target: TuningTarget) => { await command("tuning", { frequency: target }); },
    getAudioProgress: (): AudioProgress => ({ currentTime: state.position, duration: state.duration }),
    getAudioPlayback: snapshot,
    onAudioProgress: (callback: (value: AudioProgress) => void) => subscribe(progress, callback, { currentTime: state.position, duration: state.duration }),
    onAudioPlayback: (callback: (value: AudioPlaybackSnapshot) => void) => subscribe(playback, callback, snapshot()),
    onAudioEnded(callback: () => void) { ended.add(callback); return () => { ended.delete(callback); }; },
    onAudioError(callback: () => void) { errors.add(callback); return () => { errors.delete(callback); }; },
    // Activity teardown must not stop the foreground service.
    dispose() { disposed = true; if (timer) clearInterval(timer); timer = undefined;
      states.clear(); progress.clear(); playback.clear(); errors.clear(); ended.clear(); },
  };
}
