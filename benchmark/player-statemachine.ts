// 方案 C：状态机（当前最优）
// 得分：能力负担 130，松散度 0

interface Track { id: string; title: string; artist: string; url: string; duration: number; }
interface AudioEngine { play(url: string, position: number): Promise<void>; pause(): void; setVolume(v: number): void; getCurrentPosition(): number; }
interface TrackStore { fetchPlaylist(playlistId: string): Promise<Track[]>; }
type PlayState = "playing" | "paused" | "stopped";
type RepeatMode = "off" | "one" | "all";

interface PlayerState { playlist: Track[]; currentIndex: number; playState: PlayState; volume: number; repeatMode: RepeatMode; position: number; }

type PlayerEvent =
  | { type: "playlist-loaded"; tracks: Track[] }
  | { type: "play" }
  | { type: "pause"; currentPosition: number }
  | { type: "next" }
  | { type: "prev" }
  | { type: "seek"; position: number }
  | { type: "set-volume"; volume: number }
  | { type: "set-repeat"; mode: RepeatMode };

type PlayerEffect =
  | { type: "play-audio"; url: string; position: number }
  | { type: "pause-audio" }
  | { type: "set-volume"; volume: number }
  | { type: "none" };

interface Transition { state: PlayerState; effect: PlayerEffect; }

/** @capability */
function initialState(): PlayerState {
  return { playlist: [], currentIndex: -1, playState: "stopped", volume: 80, repeatMode: "off", position: 0 };
}

/** @capability */
function transition(state: PlayerState, event: PlayerEvent): Transition {
  switch (event.type) {
    case "playlist-loaded": {
      if (event.tracks.length === 0) return { state, effect: { type: "none" } };
      return {
        state: { ...state, playlist: event.tracks, currentIndex: 0, playState: "stopped", position: 0 },
        effect: { type: "none" },
      };
    }
    case "play": {
      if (state.playlist.length === 0) return { state, effect: { type: "none" } };
      const idx = state.currentIndex < 0 ? 0 : state.currentIndex;
      const track = state.playlist[idx];
      return {
        state: { ...state, currentIndex: idx, playState: "playing" },
        effect: { type: "play-audio", url: track.url, position: state.position },
      };
    }
    case "pause": {
      if (state.playState !== "playing") return { state, effect: { type: "none" } };
      return {
        state: { ...state, playState: "paused", position: event.currentPosition },
        effect: { type: "pause-audio" },
      };
    }
    case "next": {
      if (state.playlist.length === 0) return { state, effect: { type: "none" } };
      let nextIndex = state.currentIndex + 1;
      if (nextIndex >= state.playlist.length) {
        if (state.repeatMode === "all") { nextIndex = 0; }
        else { return { state: { ...state, playState: "stopped" }, effect: { type: "pause-audio" } }; }
      }
      const newState = { ...state, currentIndex: nextIndex, position: 0 };
      const effect: PlayerEffect = state.playState === "playing"
        ? { type: "play-audio", url: state.playlist[nextIndex].url, position: 0 } : { type: "none" };
      return { state: newState, effect };
    }
    case "prev": {
      if (state.playlist.length === 0) return { state, effect: { type: "none" } };
      let prevIndex: number;
      if (state.position > 3) { prevIndex = state.currentIndex; }
      else {
        prevIndex = state.currentIndex - 1;
        if (prevIndex < 0) { prevIndex = state.repeatMode === "all" ? state.playlist.length - 1 : 0; }
      }
      const newState = { ...state, currentIndex: prevIndex, position: 0 };
      const effect: PlayerEffect = state.playState === "playing"
        ? { type: "play-audio", url: state.playlist[prevIndex].url, position: 0 } : { type: "none" };
      return { state: newState, effect };
    }
    case "seek": {
      const duration = state.playlist[state.currentIndex]?.duration ?? 0;
      const clamped = Math.max(0, Math.min(event.position, duration));
      const newState = { ...state, position: clamped };
      const effect: PlayerEffect = state.playState === "playing"
        ? { type: "play-audio", url: state.playlist[state.currentIndex].url, position: clamped } : { type: "none" };
      return { state: newState, effect };
    }
    case "set-volume": {
      const vol = Math.max(0, Math.min(100, event.volume));
      return { state: { ...state, volume: vol }, effect: { type: "set-volume", volume: vol } };
    }
    case "set-repeat": {
      return { state: { ...state, repeatMode: event.mode }, effect: { type: "none" } };
    }
  }
}

/** @capability IO Async */
async function executeEffect_IO_Async(engine: AudioEngine, effect: PlayerEffect): Promise<void> {
  switch (effect.type) {
    case "play-audio": await engine.play(effect.url, effect.position); break;
    case "pause-audio": engine.pause(); break;
    case "set-volume": engine.setVolume(effect.volume); break;
    case "none": break;
  }
}

/** @capability IO Async Fallible */
async function loadPlaylist_IO_Async_Fallible(store: TrackStore, playlistId: string): Promise<Track[]> {
  const tracks = await store.fetchPlaylist(playlistId);
  if (tracks.length === 0) throw new Error("Empty playlist");
  return tracks;
}

/** @capability IO Async Fallible Mutable */
function createPlayerRuntime_IO_Async_Fallible_Mutable(engine: AudioEngine, store: TrackStore) {
  let state = initialState();

  /** @capability IO Async Mutable */
  async function dispatch(event: PlayerEvent): Promise<PlayerState> {
    const result = transition(state, event);
    state = result.state;
    await executeEffect_IO_Async(engine, result.effect);
    return state;
  }

  /** @capability IO Async Fallible Mutable */
  async function loadAndPlay(playlistId: string): Promise<PlayerState> {
    const tracks = await loadPlaylist_IO_Async_Fallible(store, playlistId);
    await dispatch({ type: "playlist-loaded", tracks });
    return dispatch({ type: "play" });
  }

  return { dispatch, loadAndPlay, getState: () => ({ ...state }) };
}
