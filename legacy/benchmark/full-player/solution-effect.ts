// 方案 E：Effect-TS
// 能力在类型系统中自动追踪，不需要手动 @capability

import { Effect, Context, Ref, pipe } from "effect";

// ── 类型定义 ──

interface Track { id: string; title: string; artist: string; url: string; duration: number; }
type PlayState = "playing" | "paused" | "stopped";
type RepeatMode = "off" | "one" | "all";
interface PlayerState { playlist: Track[]; currentIndex: number; playState: PlayState; volume: number; repeatMode: RepeatMode; position: number; }

class EmptyPlaylistError { readonly _tag = "EmptyPlaylistError" as const; }

// ── 服务定义（≈ 能力声明，但在类型系统中）──

class AudioEngine extends Context.Tag("AudioEngine")<AudioEngine, {
  readonly play: (url: string, position: number) => Effect.Effect<void>;
  readonly pause: () => Effect.Effect<void>;
  readonly setVolume: (v: number) => Effect.Effect<void>;
  readonly getCurrentPosition: () => Effect.Effect<number>;
}>() {}

class TrackStore extends Context.Tag("TrackStore")<TrackStore, {
  readonly fetchPlaylist: (id: string) => Effect.Effect<readonly Track[], EmptyPlaylistError>;
}>() {}

// ── 纯状态转换 ──

/** @capability */
function initState(): PlayerState {
  return { playlist: [], currentIndex: -1, playState: "stopped", volume: 80, repeatMode: "off", position: 0 };
}

/** @capability */
function nextIndex(state: PlayerState): number | null {
  const next = state.currentIndex + 1;
  if (next >= state.playlist.length) return state.repeatMode === "all" ? 0 : null;
  return next;
}

/** @capability */
function prevIndex(state: PlayerState): number {
  if (state.position > 3) return state.currentIndex;
  const prev = state.currentIndex - 1;
  return prev < 0 ? (state.repeatMode === "all" ? state.playlist.length - 1 : 0) : prev;
}

/** @capability */
function clampVolume(v: number): number {
  return Math.max(0, Math.min(100, v));
}

/** @capability */
function clampPosition(pos: number, duration: number): number {
  return Math.max(0, Math.min(pos, duration));
}

// ── Effect 组合（类型自动追踪能力）──

// loadPlaylist: Effect<void, EmptyPlaylistError, TrackStore | Ref<PlayerState>>
/** @capability IO Fallible Mutable */
const loadPlaylist_IO_Fallible_Mutable = (id: string) =>
  Effect.gen(function* () {
    const store = yield* TrackStore;
    const ref = yield* Ref.get(stateRef).pipe(Effect.flatMap(() => stateRef));
    const tracks = yield* store.fetchPlaylist(id);
    if (tracks.length === 0) yield* Effect.fail(new EmptyPlaylistError());
    yield* Ref.set(ref, { ...yield* Ref.get(ref), playlist: [...tracks], currentIndex: 0, playState: "stopped" as const, position: 0 });
  });

// 不行，这样写太绕了。用 Effect 的正确方式是完全拥抱它的模式，
// 而不是在外面套一层。让我重写。

// ── 实际上 Effect 播放器应该这样写 ──

// 每个操作是一个 Effect，类型参数自动编码需要什么服务
/** @capability IO Mutable */
const play = Effect.gen(function* () {
  const ref = yield* StateRef;
  const state = yield* Ref.get(ref);
  if (state.playlist.length === 0) return;
  const idx = state.currentIndex < 0 ? 0 : state.currentIndex;
  const track = state.playlist[idx];
  yield* Ref.set(ref, { ...state, currentIndex: idx, playState: "playing" as const });
  const engine = yield* AudioEngine;
  yield* engine.play(track.url, state.position);
});

/** @capability IO Mutable */
const pause = Effect.gen(function* () {
  const ref = yield* StateRef;
  const state = yield* Ref.get(ref);
  if (state.playState !== "playing") return;
  const engine = yield* AudioEngine;
  const pos = yield* engine.getCurrentPosition();
  yield* engine.pause();
  yield* Ref.set(ref, { ...state, playState: "paused" as const, position: pos });
});

/** @capability IO Mutable */
const next = Effect.gen(function* () {
  const ref = yield* StateRef;
  const state = yield* Ref.get(ref);
  if (state.playlist.length === 0) return;
  const idx = nextIndex(state);
  if (idx === null) {
    yield* Ref.set(ref, { ...state, playState: "stopped" as const });
    return;
  }
  yield* Ref.set(ref, { ...state, currentIndex: idx, position: 0 });
  if (state.playState === "playing") {
    const engine = yield* AudioEngine;
    yield* engine.play(state.playlist[idx].url, 0);
  }
});

/** @capability IO Mutable */
const prev = Effect.gen(function* () {
  const ref = yield* StateRef;
  const state = yield* Ref.get(ref);
  if (state.playlist.length === 0) return;
  const idx = prevIndex(state);
  yield* Ref.set(ref, { ...state, currentIndex: idx, position: 0 });
  if (state.playState === "playing") {
    const engine = yield* AudioEngine;
    yield* engine.play(state.playlist[idx].url, 0);
  }
});

/** @capability IO Mutable */
const seek = (position: number) => Effect.gen(function* () {
  const ref = yield* StateRef;
  const state = yield* Ref.get(ref);
  const duration = state.playlist[state.currentIndex]?.duration ?? 0;
  const pos = clampPosition(position, duration);
  yield* Ref.set(ref, { ...state, position: pos });
  if (state.playState === "playing") {
    const engine = yield* AudioEngine;
    yield* engine.play(state.playlist[state.currentIndex].url, pos);
  }
});

/** @capability IO Mutable */
const setVolume = (v: number) => Effect.gen(function* () {
  const ref = yield* StateRef;
  const state = yield* Ref.get(ref);
  const vol = clampVolume(v);
  yield* Ref.set(ref, { ...state, volume: vol });
  const engine = yield* AudioEngine;
  yield* engine.setVolume(vol);
});

/** @capability Mutable */
const setRepeatMode = (mode: RepeatMode) => Effect.gen(function* () {
  const ref = yield* StateRef;
  const state = yield* Ref.get(ref);
  yield* Ref.set(ref, { ...state, repeatMode: mode });
});

/** @capability Mutable */
const getState = Effect.gen(function* () {
  const ref = yield* StateRef;
  return yield* Ref.get(ref);
});

// StateRef 服务：持有播放器状态
class StateRef extends Context.Tag("StateRef")<StateRef, Ref.Ref<PlayerState>>() {}

/** @capability IO Fallible Mutable */
const loadPlaylist = (id: string) => Effect.gen(function* () {
  const store = yield* TrackStore;
  const tracks = yield* store.fetchPlaylist(id);
  const ref = yield* StateRef;
  yield* Ref.set(ref, { ...yield* Ref.get(ref), playlist: [...tracks], currentIndex: 0, playState: "stopped" as const, position: 0 });
});
