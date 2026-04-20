// 方案 D：极致分离 — 纯状态转换 + 最小 IO 表面
// 得分：能力负担 4.0，松散度 0

interface Track { id: string; title: string; artist: string; url: string; duration: number; }
interface AudioEngine { play(url: string, position: number): Promise<void>; pause(): void; setVolume(v: number): void; getCurrentPosition(): number; }
interface TrackStore { fetchPlaylist(playlistId: string): Promise<Track[]>; }
type PlayState = "playing" | "paused" | "stopped";
type RepeatMode = "off" | "one" | "all";

interface PlayerState { playlist: Track[]; currentIndex: number; playState: PlayState; volume: number; repeatMode: RepeatMode; position: number; }

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

/** @capability IO */
function fetchTracks_IO(store: TrackStore, id: string): Promise<Track[]> { return store.fetchPlaylist(id); }

/** @capability IO */
function playAudio_IO(e: AudioEngine, url: string, pos: number): Promise<void> { return e.play(url, pos); }

/** @capability IO */
function pauseAudio_IO(e: AudioEngine): void { e.pause(); }

/** @capability IO */
function setVolumeAudio_IO(e: AudioEngine, v: number): void { e.setVolume(v); }
