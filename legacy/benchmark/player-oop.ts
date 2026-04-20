// 方案 A：内聚 OOP
// 得分：能力负担 884，松散度 0

interface Track { id: string; title: string; artist: string; url: string; duration: number; }
interface AudioEngine { play(url: string, position: number): Promise<void>; pause(): void; setVolume(v: number): void; getCurrentPosition(): number; }
interface TrackStore { fetchPlaylist(playlistId: string): Promise<Track[]>; }
type PlayState = "playing" | "paused" | "stopped";
type RepeatMode = "off" | "one" | "all";

interface PlayerState {
  playlist: Track[];
  currentIndex: number;
  playState: PlayState;
  volume: number;
  repeatMode: RepeatMode;
  position: number;
}

function createPlayer(engine: AudioEngine, store: TrackStore) {
  const state: PlayerState = {
    playlist: [], currentIndex: -1, playState: "stopped", volume: 80, repeatMode: "off", position: 0,
  };

  /** @capability IO Async Fallible */
  async function loadPlaylist(playlistId: string): Promise<void> {
    const tracks = await store.fetchPlaylist(playlistId);
    if (tracks.length === 0) throw new Error("Empty playlist");
    state.playlist = tracks;
    state.currentIndex = 0;
    state.playState = "stopped";
    state.position = 0;
  }

  /** @capability IO Async Mutable */
  async function play(): Promise<void> {
    if (state.playlist.length === 0) return;
    if (state.currentIndex < 0) state.currentIndex = 0;
    const track = state.playlist[state.currentIndex];
    await engine.play(track.url, state.position);
    state.playState = "playing";
  }

  /** @capability Mutable */
  function pause(): void {
    if (state.playState !== "playing") return;
    state.position = engine.getCurrentPosition();
    engine.pause();
    state.playState = "paused";
  }

  /** @capability IO Async Mutable */
  async function next(): Promise<void> {
    if (state.playlist.length === 0) return;
    let nextIndex = state.currentIndex + 1;
    if (nextIndex >= state.playlist.length) {
      if (state.repeatMode === "all") {
        nextIndex = 0;
      } else {
        state.playState = "stopped";
        return;
      }
    }
    state.currentIndex = nextIndex;
    state.position = 0;
    if (state.playState === "playing") {
      await engine.play(state.playlist[nextIndex].url, 0);
    }
  }

  /** @capability IO Async Mutable */
  async function prev(): Promise<void> {
    if (state.playlist.length === 0) return;
    if (state.position > 3) {
      state.position = 0;
      if (state.playState === "playing") {
        await engine.play(state.playlist[state.currentIndex].url, 0);
      }
      return;
    }
    let prevIndex = state.currentIndex - 1;
    if (prevIndex < 0) {
      prevIndex = state.repeatMode === "all" ? state.playlist.length - 1 : 0;
    }
    state.currentIndex = prevIndex;
    state.position = 0;
    if (state.playState === "playing") {
      await engine.play(state.playlist[prevIndex].url, 0);
    }
  }

  /** @capability IO Async Mutable */
  async function seek(position: number): Promise<void> {
    state.position = Math.max(0, Math.min(position, state.playlist[state.currentIndex]?.duration ?? 0));
    if (state.playState === "playing") {
      await engine.play(state.playlist[state.currentIndex].url, state.position);
    }
  }

  /** @capability Mutable */
  function setVolume(v: number): void {
    state.volume = Math.max(0, Math.min(100, v));
    engine.setVolume(state.volume);
  }

  /** @capability Mutable */
  function setRepeatMode(mode: RepeatMode): void {
    state.repeatMode = mode;
  }

  /** @capability */
  function getState(): PlayerState {
    return { ...state };
  }

  return { loadPlaylist, play, pause, next, prev, seek, setVolume, setRepeatMode, getState };
}
