// AUTO-GENERATED from player/
// Do not edit — modify the .fts/.type.fts sources instead.

// 外部依赖（本项目无外部依赖）

// ── display-line-with-active-flag ──

export type DisplayLineWithActiveFlag = {
  readonly index: number;
  readonly text: string;
  readonly active: boolean;
}

// ── immutable-player-state ──

export type ImmutablePlayerState = {
  readonly lyrics: readonly LyricLineWithTimestamp[];
  readonly currentTime: number;
  readonly playing: boolean;
  readonly activeLine: number;
}

// ── lyric-line-with-timestamp ──

export type LyricLineWithTimestamp = {
  readonly time: number;
  readonly text: string;
}

// ── advance-player-by-delta-seconds ──

/** @capability */
export const advancePlayerByDeltaSeconds = (state: Readonly<ImmutablePlayerState>, deltaSeconds: number): ImmutablePlayerState => {
  if (!state.playing) return state;
  const currentTime = state.currentTime + deltaSeconds;
  const activeLine = findActiveLyricIndexAtTime(state.lyrics, currentTime);
  return { ...state, currentTime, activeLine };
}

// ── build-visible-lyric-window ──

/** @capability */
export const buildVisibleLyricWindow = (state: Readonly<ImmutablePlayerState>, windowSize: number): DisplayLineWithActiveFlag[] => {
  const { lyrics, activeLine } = state;
  const half = Math.floor(windowSize / 2);
  const start = Math.max(0, activeLine - half);
  const end = Math.min(lyrics.length, start + windowSize);
  const display: DisplayLineWithActiveFlag[] = [];
  for (let i = start; i < end; i++) {
    display.push({ index: i, text: lyrics[i].text, active: i === activeLine });
  }
  return display;
}

// ── create-initial-player-state ──

/** @capability */
export const createInitialPlayerState = (lyrics: readonly LyricLineWithTimestamp[]): ImmutablePlayerState =>
  ({ lyrics, currentTime: 0, playing: false, activeLine: -1 })

// ── find-active-lyric-index-at-time ──

/** @capability */
export const findActiveLyricIndexAtTime = (lyrics: readonly LyricLineWithTimestamp[], time: number): number => {
  let idx = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].time <= time) idx = i;
    else break;
  }
  return idx;
}

// ── find-lyric-index-by-text-query ──

/** @capability */
export const findLyricIndexByTextQuery = (lyrics: readonly LyricLineWithTimestamp[], query: string): number => {
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].text.includes(query)) return i;
  }
  return -1;
}

// ── format-seconds-to-mm-ss ──

/** @capability */
export const formatSecondsToMmSs = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── parse-lrc-text-to-lyric-lines ──

/** @capability Fallible */
export const parseLrcTextToLyricLines = (raw: string): LyricLineWithTimestamp[] => {
  const lines: LyricLineWithTimestamp[] = [];
  for (const line of raw.split("\n")) {
    const m = line.match(/^\[(\d+):(\d+)\.(\d+)\](.*)$/);
    if (!m) continue;
    const time = Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 100;
    lines.push({ time, text: m[4].trim() });
  }
  return lines.sort((a, b) => a.time - b.time);
}

// ── render-player-to-string ──

/** @capability */
export const renderPlayerToString = (state: Readonly<ImmutablePlayerState>, windowSize: number): string => {
  const lines = buildVisibleLyricWindow(state, windowSize);
  const header = `♪ ${formatSecondsToMmSs(state.currentTime)} ${state.playing ? "▶" : "⏸"}`;
  const body = lines
    .map(l => l.active ? `  ▸ ${l.text}` : `    ${l.text}`)
    .join("\n");
  return `${header}\n${body}`;
}

// ── seek-player-to-matching-lyric ──

/** @capability */
export const seekPlayerToMatchingLyric = (state: Readonly<ImmutablePlayerState>, query: string): ImmutablePlayerState => {
  const idx = findLyricIndexByTextQuery(state.lyrics, query);
  if (idx === -1) return state;
  return seekPlayerToTime(state, state.lyrics[idx].time);
}

// ── seek-player-to-time ──

/** @capability */
export const seekPlayerToTime = (state: Readonly<ImmutablePlayerState>, time: number): ImmutablePlayerState => {
  const activeLine = findActiveLyricIndexAtTime(state.lyrics, time);
  return { ...state, currentTime: time, activeLine };
}

// ── toggle-player-playing-state ──

/** @capability */
export const togglePlayerPlayingState = (state: Readonly<ImmutablePlayerState>): ImmutablePlayerState =>
  ({ ...state, playing: !state.playing })
