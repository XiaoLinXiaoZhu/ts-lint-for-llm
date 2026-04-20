// 同一个音乐播放器，参数全部 readonly

// ── 类型 ──

interface Track {
  id: string;
  title: string;
  artist: string;
  duration: number;
}

interface PlayerState {
  playlist: Track[];
  currentIndex: number;
  playing: boolean;
  volume: number;
  history: Track[];
}

// ── 纯函数：构造 / 查询 ──

/** @capability */
function createTrack(id: string, title: string, artist: string, duration: number): Track {
  return { id, title, artist, duration };
}

/** @capability */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** @capability */
function currentTrack(state: Readonly<PlayerState>): Track | null {
  return state.playlist[state.currentIndex] ?? null;
}

/** @capability */
function totalDuration(playlist: readonly Track[]): number {
  return playlist.reduce((sum, t) => sum + t.duration, 0);
}

/** @capability */
function findTrackIndex(playlist: readonly Track[], trackId: string): number {
  return playlist.findIndex(t => t.id === trackId);
}

// ── 纯函数：构造新的播放列表 ──

/** @capability */
function withTrackAdded(playlist: readonly Track[], track: Readonly<Track>): Track[] {
  const result = [...playlist];
  result.push(track);
  return result;
}

/** @capability */
function withTrackRemoved(playlist: readonly Track[], trackId: string): Track[] {
  return playlist.filter(t => t.id !== trackId);
}

/** @capability */
function withPlaylistSorted(playlist: readonly Track[], by: "title" | "artist" | "duration"): Track[] {
  return [...playlist].sort((a, b) => {
    if (by === "duration") return a.duration - b.duration;
    return a[by].localeCompare(b[by]);
  });
}

/** @capability */
function withPlaylistShuffled(playlist: readonly Track[]): Track[] {
  const result = [...playlist];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** @capability */
function buildQueue(playlist: readonly Track[], fromIndex: number): Track[] {
  const queue: Track[] = [];
  for (let i = fromIndex; i < playlist.length; i++) {
    queue.push(playlist[i]);
  }
  return queue;
}

/** @capability */
function deduplicatePlaylist(playlist: readonly Track[]): Track[] {
  const seen = new Set<string>();
  const result: Track[] = [];
  for (const t of playlist) {
    if (!seen.has(t.id)) {
      seen.add(t.id);
      result.push(t);
    }
  }
  return result;
}

/** @capability */
function topArtists(history: readonly Track[]): { artist: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of history) {
    counts.set(t.artist, (counts.get(t.artist) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([artist, count]) => ({ artist, count }))
    .sort((a, b) => b.count - a.count);
}

// ── Mutable 函数：参数是非 readonly 的引用类型 ──

/** @capability Mutable */
function addToPlaylist(state: PlayerState, track: Track): void {
  state.playlist.push(track);
}

/** @capability Mutable */
function removeFromPlaylist(state: PlayerState, trackId: string): void {
  const idx = state.playlist.findIndex(t => t.id === trackId);
  if (idx !== -1) state.playlist.splice(idx, 1);
  if (state.currentIndex >= state.playlist.length) {
    state.currentIndex = Math.max(0, state.playlist.length - 1);
  }
}

/** @capability Mutable */
function play(state: PlayerState): void {
  state.playing = true;
  const track = currentTrack(state);
  if (track) state.history.push(track);
}

/** @capability Mutable */
function pause(state: PlayerState): void {
  state.playing = false;
}

/** @capability Mutable */
function next(state: PlayerState): void {
  if (state.currentIndex < state.playlist.length - 1) {
    state.currentIndex++;
    if (state.playing) {
      const track = currentTrack(state);
      if (track) state.history.push(track);
    }
  }
}

/** @capability Mutable */
function setVolume(state: PlayerState, volume: number): void {
  state.volume = Math.max(0, Math.min(1, volume));
}

// ── 组合 ──

/** @capability Mutable */
function skipToTrack(state: PlayerState, trackId: string): boolean {
  const idx = findTrackIndex(state.playlist, trackId);
  if (idx === -1) return false;
  state.currentIndex = idx;
  play(state);
  return true;
}

/** @capability Mutable */
function replacePlaylist(state: PlayerState, newPlaylist: readonly Track[]): void {
  state.playlist.length = 0;
  for (const t of newPlaylist) state.playlist.push(t);
  state.currentIndex = 0;
}

/** @capability IO Mutable */
function loadAndPlay(state: PlayerState, tracks: readonly Track[]): void {
  replacePlaylist(state, tracks);
  play(state);
  console.log(`Now playing: ${currentTrack(state)?.title}`);
}
