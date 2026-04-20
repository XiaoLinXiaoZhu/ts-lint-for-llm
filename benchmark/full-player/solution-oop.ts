// 方案 A：内聚 OOP（v2 完整版）

interface Track { id: string; title: string; artist: string; url: string; duration: number; }
interface AudioEngine { play(url: string, position: number): Promise<void>; pause(): void; setVolume(v: number): void; getCurrentPosition(): number; }
interface TrackStore { fetchPlaylist(playlistId: string): Promise<Track[]>; }
type PlayState = "playing" | "paused" | "stopped";
type RepeatMode = "off" | "one" | "all";
interface PlayerState { playlist: Track[]; currentIndex: number; playState: PlayState; volume: number; repeatMode: RepeatMode; position: number; }
interface Player { loadPlaylist(playlistId: string): Promise<void>; play(): Promise<void>; pause(): void; next(): Promise<void>; prev(): Promise<void>; seek(position: number): Promise<void>; setVolume(v: number): void; setRepeatMode(mode: RepeatMode): void; getState(): PlayerState; }

/** @capability IO Async Fallible Mutable */
function createPlayer_IO_Async_Fallible_Mutable(engine: AudioEngine, store: TrackStore): Player {
  const state: PlayerState = {
    playlist: [], currentIndex: -1, playState: "stopped", volume: 80, repeatMode: "off", position: 0,
  };

  async function loadPlaylist(playlistId: string): Promise<void> {
    const tracks = await store.fetchPlaylist(playlistId);
    if (tracks.length === 0) throw new Error("Empty playlist");
    state.playlist = tracks;
    state.currentIndex = 0;
    state.playState = "stopped";
    state.position = 0;
  }

  async function play(): Promise<void> {
    if (state.playlist.length === 0) return;
    if (state.currentIndex < 0) state.currentIndex = 0;
    await engine.play(state.playlist[state.currentIndex].url, state.position);
    state.playState = "playing";
  }

  function pause(): void {
    if (state.playState !== "playing") return;
    state.position = engine.getCurrentPosition();
    engine.pause();
    state.playState = "paused";
  }

  async function next(): Promise<void> {
    if (state.playlist.length === 0) return;
    let idx = state.currentIndex + 1;
    if (idx >= state.playlist.length) {
      if (state.repeatMode === "all") idx = 0;
      else { state.playState = "stopped"; return; }
    }
    state.currentIndex = idx;
    state.position = 0;
    if (state.playState === "playing") await engine.play(state.playlist[idx].url, 0);
  }

  async function prev(): Promise<void> {
    if (state.playlist.length === 0) return;
    if (state.position > 3) {
      state.position = 0;
      if (state.playState === "playing") await engine.play(state.playlist[state.currentIndex].url, 0);
      return;
    }
    let idx = state.currentIndex - 1;
    if (idx < 0) idx = state.repeatMode === "all" ? state.playlist.length - 1 : 0;
    state.currentIndex = idx;
    state.position = 0;
    if (state.playState === "playing") await engine.play(state.playlist[idx].url, 0);
  }

  async function seek(position: number): Promise<void> {
    state.position = Math.max(0, Math.min(position, state.playlist[state.currentIndex]?.duration ?? 0));
    if (state.playState === "playing") await engine.play(state.playlist[state.currentIndex].url, state.position);
  }

  function setVolume(v: number): void {
    state.volume = Math.max(0, Math.min(100, v));
    engine.setVolume(state.volume);
  }

  function setRepeatMode(mode: RepeatMode): void { state.repeatMode = mode; }

  function getState(): PlayerState { return { ...state }; }

  return { loadPlaylist, play, pause, next, prev, seek, setVolume, setRepeatMode, getState };
}
