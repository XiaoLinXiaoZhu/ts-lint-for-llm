// 方案 D v2：xlxz 的极致分离 + 补上 runtime（v2 完整版）

interface Track { id: string; title: string; artist: string; url: string; duration: number; }
interface AudioEngine { play(url: string, position: number): Promise<void>; pause(): void; setVolume(v: number): void; getCurrentPosition(): number; }
interface TrackStore { fetchPlaylist(playlistId: string): Promise<Track[]>; }
type PlayState = "playing" | "paused" | "stopped";
type RepeatMode = "off" | "one" | "all";
interface PlayerState { playlist: Track[]; currentIndex: number; playState: PlayState; volume: number; repeatMode: RepeatMode; position: number; }
interface Player { loadPlaylist(playlistId: string): Promise<void>; play(): Promise<void>; pause(): void; next(): Promise<void>; prev(): Promise<void>; seek(position: number): Promise<void>; setVolume(v: number): void; setRepeatMode(mode: RepeatMode): void; getState(): PlayerState; }

type Effect =
  | { kind: "play"; url: string; position: number }
  | { kind: "pause" }
  | { kind: "volume"; v: number }
  | { kind: "error"; message: string }
  | null;

interface Step { state: PlayerState; effect: Effect; }

/** @capability */
function init(): PlayerState {
  return { playlist: [], currentIndex: -1, playState: "stopped", volume: 80, repeatMode: "off", position: 0 };
}

/** @capability */
function onPlaylistLoaded(s: PlayerState, tracks: Track[]): Step {
  if (tracks.length === 0) return { state: s, effect: { kind: "error", message: "Empty playlist" } };
  return { state: { ...s, playlist: tracks, currentIndex: 0, playState: "stopped", position: 0 }, effect: null };
}

/** @capability */
function onPlay(s: PlayerState): Step {
  if (s.playlist.length === 0) return { state: s, effect: null };
  const idx = s.currentIndex < 0 ? 0 : s.currentIndex;
  return { state: { ...s, currentIndex: idx, playState: "playing" }, effect: { kind: "play", url: s.playlist[idx].url, position: s.position } };
}

/** @capability */
function onPause(s: PlayerState, currentPosition: number): Step {
  if (s.playState !== "playing") return { state: s, effect: null };
  return { state: { ...s, playState: "paused", position: currentPosition }, effect: { kind: "pause" } };
}

/** @capability */
function onNext(s: PlayerState): Step {
  if (s.playlist.length === 0) return { state: s, effect: null };
  const next = s.currentIndex + 1;
  if (next >= s.playlist.length) {
    if (s.repeatMode === "all") return playAt(s, 0);
    return { state: { ...s, playState: "stopped" }, effect: { kind: "pause" } };
  }
  return playAt(s, next);
}

/** @capability */
function onPrev(s: PlayerState): Step {
  if (s.playlist.length === 0) return { state: s, effect: null };
  if (s.position > 3) return playAt(s, s.currentIndex);
  const prev = s.currentIndex - 1;
  if (prev < 0) return playAt(s, s.repeatMode === "all" ? s.playlist.length - 1 : 0);
  return playAt(s, prev);
}

/** @capability */
function playAt(s: PlayerState, idx: number): Step {
  const ns = { ...s, currentIndex: idx, position: 0 };
  return { state: ns, effect: s.playState === "playing" ? { kind: "play", url: s.playlist[idx].url, position: 0 } : null };
}

/** @capability */
function onSeek(s: PlayerState, position: number): Step {
  const duration = s.playlist[s.currentIndex]?.duration ?? 0;
  const clamped = Math.max(0, Math.min(position, duration));
  const ns = { ...s, position: clamped };
  return { state: ns, effect: s.playState === "playing" ? { kind: "play", url: s.playlist[s.currentIndex].url, position: clamped } : null };
}

/** @capability */
function onSetVolume(s: PlayerState, v: number): Step {
  const vol = Math.max(0, Math.min(100, v));
  return { state: { ...s, volume: vol }, effect: { kind: "volume", v: vol } };
}

/** @capability */
function onSetRepeat(s: PlayerState, mode: RepeatMode): Step {
  return { state: { ...s, repeatMode: mode }, effect: null };
}

// ── runtime：补上调用方代码，一起计分 ──

/** @capability IO Async */
async function runEffect_IO_Async(engine: AudioEngine, effect: Effect): Promise<void> {
  if (!effect) return;
  switch (effect.kind) {
    case "play": await engine.play(effect.url, effect.position); break;
    case "pause": engine.pause(); break;
    case "volume": engine.setVolume(effect.v); break;
    case "error": throw new Error(effect.message);
  }
}

/** @capability IO Async Fallible Mutable */
function createPlayer_IO_Async_Fallible_Mutable(engine: AudioEngine, store: TrackStore): Player {
  let state = init();

  async function apply(step: Step): Promise<void> {
    state = step.state;
    await runEffect_IO_Async(engine, step.effect);
  }

  return {
    async loadPlaylist(id: string): Promise<void> {
      const tracks = await store.fetchPlaylist(id);
      await apply(onPlaylistLoaded(state, tracks));
    },
    async play(): Promise<void> { await apply(onPlay(state)); },
    pause(): void { const step = onPause(state, engine.getCurrentPosition()); state = step.state; if (step.effect?.kind === "pause") engine.pause(); },
    async next(): Promise<void> { await apply(onNext(state)); },
    async prev(): Promise<void> { await apply(onPrev(state)); },
    async seek(pos: number): Promise<void> { await apply(onSeek(state, pos)); },
    setVolume(v: number): void { const step = onSetVolume(state, v); state = step.state; if (step.effect?.kind === "volume") engine.setVolume(step.effect.v); },
    setRepeatMode(mode: RepeatMode): void { state = onSetRepeat(state, mode).state; },
    getState(): PlayerState { return { ...state }; },
  };
}
