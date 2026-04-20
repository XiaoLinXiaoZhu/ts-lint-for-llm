// 方案 B：散沙 FP
// 得分：能力负担 162，松散度 0

interface Track { id: string; title: string; artist: string; url: string; duration: number; }
interface AudioEngine { play(url: string, position: number): Promise<void>; pause(): void; setVolume(v: number): void; getCurrentPosition(): number; }
interface TrackStore { fetchPlaylist(playlistId: string): Promise<Track[]>; }
type PlayState = "playing" | "paused" | "stopped";
type RepeatMode = "off" | "one" | "all";

interface PlayerState { playlist: Track[]; currentIndex: number; playState: PlayState; volume: number; repeatMode: RepeatMode; position: number; }

/** @capability */
function initialState(): PlayerState {
  return { playlist: [], currentIndex: -1, playState: "stopped", volume: 80, repeatMode: "off", position: 0 };
}
/** @capability */
function withPlaylist(state: PlayerState, tracks: Track[]): PlayerState {
  return { ...state, playlist: tracks, currentIndex: 0, playState: "stopped", position: 0 };
}
/** @capability */
function withPlaying(state: PlayerState): PlayerState {
  const idx = state.currentIndex < 0 ? 0 : state.currentIndex;
  return { ...state, currentIndex: idx, playState: "playing" };
}
/** @capability */
function withPaused(state: PlayerState, position: number): PlayerState {
  return { ...state, playState: "paused", position };
}
/** @capability */
function calcNextIndex(state: PlayerState): number | null {
  const next = state.currentIndex + 1;
  if (next >= state.playlist.length) return state.repeatMode === "all" ? 0 : null;
  return next;
}
/** @capability */
function withNextTrack(state: PlayerState, nextIndex: number): PlayerState {
  return { ...state, currentIndex: nextIndex, position: 0 };
}
/** @capability */
function withStopped(state: PlayerState): PlayerState {
  return { ...state, playState: "stopped" };
}
/** @capability */
function calcPrevIndex(state: PlayerState): number {
  if (state.position > 3) return state.currentIndex;
  const prev = state.currentIndex - 1;
  return prev < 0 ? (state.repeatMode === "all" ? state.playlist.length - 1 : 0) : prev;
}
/** @capability */
function withPrevTrack(state: PlayerState, prevIndex: number): PlayerState {
  return { ...state, currentIndex: prevIndex, position: 0 };
}
/** @capability */
function clampPosition(position: number, maxDuration: number): number {
  return Math.max(0, Math.min(position, maxDuration));
}
/** @capability */
function withPosition(state: PlayerState, position: number): PlayerState {
  return { ...state, position };
}
/** @capability */
function clampVolume(v: number): number {
  return Math.max(0, Math.min(100, v));
}
/** @capability */
function withVolume(state: PlayerState, volume: number): PlayerState {
  return { ...state, volume };
}
/** @capability */
function withRepeatMode(state: PlayerState, mode: RepeatMode): PlayerState {
  return { ...state, repeatMode: mode };
}
/** @capability */
function currentTrackUrl(state: PlayerState): string | null {
  return state.playlist[state.currentIndex]?.url ?? null;
}
/** @capability */
function currentTrackDuration(state: PlayerState): number {
  return state.playlist[state.currentIndex]?.duration ?? 0;
}

/** @capability IO Async Fallible */
async function fetchPlaylist_IO_Async_Fallible(store: TrackStore, playlistId: string): Promise<Track[]> {
  const tracks = await store.fetchPlaylist(playlistId);
  if (tracks.length === 0) throw new Error("Empty playlist");
  return tracks;
}
/** @capability IO Async */
async function playTrack_IO_Async(engine: AudioEngine, url: string, position: number): Promise<void> {
  await engine.play(url, position);
}
/** @capability IO */
function pauseEngine_IO(engine: AudioEngine): void { engine.pause(); }
/** @capability IO */
function getEnginePosition_IO(engine: AudioEngine): number { return engine.getCurrentPosition(); }
/** @capability IO */
function setEngineVolume_IO(engine: AudioEngine, volume: number): void { engine.setVolume(volume); }

/** @capability IO Async Fallible */
async function loadPlaylist_IO_Async_Fallible(state: PlayerState, store: TrackStore, playlistId: string): Promise<PlayerState> {
  const tracks = await fetchPlaylist_IO_Async_Fallible(store, playlistId);
  return withPlaylist(state, tracks);
}
/** @capability IO Async */
async function play_IO_Async(state: PlayerState, engine: AudioEngine): Promise<PlayerState> {
  if (state.playlist.length === 0) return state;
  const newState = withPlaying(state);
  const url = currentTrackUrl(newState);
  if (url) await playTrack_IO_Async(engine, url, newState.position);
  return newState;
}
/** @capability IO */
function pause_IO(state: PlayerState, engine: AudioEngine): PlayerState {
  if (state.playState !== "playing") return state;
  const pos = getEnginePosition_IO(engine);
  pauseEngine_IO(engine);
  return withPaused(state, pos);
}
/** @capability IO Async */
async function next_IO_Async(state: PlayerState, engine: AudioEngine): Promise<PlayerState> {
  if (state.playlist.length === 0) return state;
  const nextIdx = calcNextIndex(state);
  if (nextIdx === null) return withStopped(state);
  const newState = withNextTrack(state, nextIdx);
  if (newState.playState === "playing") {
    const url = currentTrackUrl(newState);
    if (url) await playTrack_IO_Async(engine, url, 0);
  }
  return newState;
}
/** @capability IO Async */
async function prev_IO_Async(state: PlayerState, engine: AudioEngine): Promise<PlayerState> {
  if (state.playlist.length === 0) return state;
  const prevIdx = calcPrevIndex(state);
  const newState = prevIdx === state.currentIndex ? withPosition(state, 0) : withPrevTrack(state, prevIdx);
  if (newState.playState === "playing") {
    const url = currentTrackUrl(newState);
    if (url) await playTrack_IO_Async(engine, url, 0);
  }
  return newState;
}
/** @capability IO Async */
async function seek_IO_Async(state: PlayerState, engine: AudioEngine, position: number): Promise<PlayerState> {
  const clamped = clampPosition(position, currentTrackDuration(state));
  const newState = withPosition(state, clamped);
  if (newState.playState === "playing") {
    const url = currentTrackUrl(newState);
    if (url) await playTrack_IO_Async(engine, url, clamped);
  }
  return newState;
}
/** @capability IO */
function setVolume_IO(state: PlayerState, engine: AudioEngine, v: number): PlayerState {
  const vol = clampVolume(v);
  setEngineVolume_IO(engine, vol);
  return withVolume(state, vol);
}
/** @capability */
function setRepeat(state: PlayerState, mode: RepeatMode): PlayerState {
  return withRepeatMode(state, mode);
}
