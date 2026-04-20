// 方案 C：状态机（v2 完整版）

interface Track { id: string; title: string; artist: string; url: string; duration: number; }
interface AudioEngine { play(url: string, position: number): Promise<void>; pause(): void; setVolume(v: number): void; getCurrentPosition(): number; }
interface TrackStore { fetchPlaylist(playlistId: string): Promise<Track[]>; }
type PlayState = "playing" | "paused" | "stopped";
type RepeatMode = "off" | "one" | "all";
interface PlayerState { playlist: Track[]; currentIndex: number; playState: PlayState; volume: number; repeatMode: RepeatMode; position: number; }
interface Player { loadPlaylist(playlistId: string): Promise<void>; play(): Promise<void>; pause(): void; next(): Promise<void>; prev(): Promise<void>; seek(position: number): Promise<void>; setVolume(v: number): void; setRepeatMode(mode: RepeatMode): void; getState(): PlayerState; }

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
function transition(state: PlayerState, event: PlayerEvent): Transition {
  switch (event.type) {
    case "playlist-loaded": {
      if (event.tracks.length === 0) return { state, effect: { type: "none" } };
      return { state: { ...state, playlist: event.tracks, currentIndex: 0, playState: "stopped", position: 0 }, effect: { type: "none" } };
    }
    case "play": {
      if (state.playlist.length === 0) return { state, effect: { type: "none" } };
      const idx = state.currentIndex < 0 ? 0 : state.currentIndex;
      return { state: { ...state, currentIndex: idx, playState: "playing" }, effect: { type: "play-audio", url: state.playlist[idx].url, position: state.position } };
    }
    case "pause": {
      if (state.playState !== "playing") return { state, effect: { type: "none" } };
      return { state: { ...state, playState: "paused", position: event.currentPosition }, effect: { type: "pause-audio" } };
    }
    case "next": {
      if (state.playlist.length === 0) return { state, effect: { type: "none" } };
      let next = state.currentIndex + 1;
      if (next >= state.playlist.length) {
        if (state.repeatMode === "all") next = 0;
        else return { state: { ...state, playState: "stopped" }, effect: { type: "pause-audio" } };
      }
      const ns = { ...state, currentIndex: next, position: 0 };
      return { state: ns, effect: state.playState === "playing" ? { type: "play-audio", url: state.playlist[next].url, position: 0 } : { type: "none" } };
    }
    case "prev": {
      if (state.playlist.length === 0) return { state, effect: { type: "none" } };
      let prev: number;
      if (state.position > 3) prev = state.currentIndex;
      else { prev = state.currentIndex - 1; if (prev < 0) prev = state.repeatMode === "all" ? state.playlist.length - 1 : 0; }
      const ns = { ...state, currentIndex: prev, position: 0 };
      return { state: ns, effect: state.playState === "playing" ? { type: "play-audio", url: state.playlist[prev].url, position: 0 } : { type: "none" } };
    }
    case "seek": {
      const d = state.playlist[state.currentIndex]?.duration ?? 0;
      const p = Math.max(0, Math.min(event.position, d));
      const ns = { ...state, position: p };
      return { state: ns, effect: state.playState === "playing" ? { type: "play-audio", url: state.playlist[state.currentIndex].url, position: p } : { type: "none" } };
    }
    case "set-volume": {
      const v = Math.max(0, Math.min(100, event.volume));
      return { state: { ...state, volume: v }, effect: { type: "set-volume", volume: v } };
    }
    case "set-repeat":
      return { state: { ...state, repeatMode: event.mode }, effect: { type: "none" } };
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

/** @capability IO Async Fallible Mutable */
function createPlayer_IO_Async_Fallible_Mutable(engine: AudioEngine, store: TrackStore): Player {
  let state: PlayerState = { playlist: [], currentIndex: -1, playState: "stopped", volume: 80, repeatMode: "off", position: 0 };

  async function dispatch(event: PlayerEvent): Promise<void> {
    const result = transition(state, event);
    state = result.state;
    await executeEffect_IO_Async(engine, result.effect);
  }

  return {
    async loadPlaylist(playlistId: string): Promise<void> {
      const tracks = await store.fetchPlaylist(playlistId);
      if (tracks.length === 0) throw new Error("Empty playlist");
      await dispatch({ type: "playlist-loaded", tracks });
    },
    async play(): Promise<void> { await dispatch({ type: "play" }); },
    pause(): void { const pos = engine.getCurrentPosition(); const r = transition(state, { type: "pause", currentPosition: pos }); state = r.state; if (r.effect.type === "pause-audio") engine.pause(); },
    async next(): Promise<void> { await dispatch({ type: "next" }); },
    async prev(): Promise<void> { await dispatch({ type: "prev" }); },
    async seek(position: number): Promise<void> { await dispatch({ type: "seek", position }); },
    setVolume(v: number): void { const r = transition(state, { type: "set-volume", volume: v }); state = r.state; if (r.effect.type === "set-volume") engine.setVolume(r.effect.volume); },
    setRepeatMode(mode: RepeatMode): void { const r = transition(state, { type: "set-repeat", mode }); state = r.state; },
    getState(): PlayerState { return { ...state }; },
  };
}
