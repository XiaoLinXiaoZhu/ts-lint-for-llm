// AUTO-GENERATED from player/
// Do not edit — modify the .fts/.tts sources instead.

// 外部依赖（本项目无外部依赖）

// ── display-line ──

export type DisplayLine = {
  readonly index: number;
  readonly text: string;
  readonly active: boolean;
}

// ── lyric-line ──

export type LyricLine = {
  readonly time: number;
  readonly text: string;
}

// ── player-state ──

export type PlayerState = {
  readonly lyrics: readonly LyricLine[];
  readonly currentTime: number;
  readonly playing: boolean;
  readonly activeLine: number;
}

// ── build-display ──

export const buildDisplay = (state: Readonly<PlayerState>, windowSize: number): DisplayLine[] => {
  const { lyrics, activeLine } = state;
  const half = Math.floor(windowSize / 2);
  const start = Math.max(0, activeLine - half);
  const end = Math.min(lyrics.length, start + windowSize);
  const display: DisplayLine[] = [];
  for (let i = start; i < end; i++) {
    display.push({ index: i, text: lyrics[i].text, active: i === activeLine });
  }
  return display;
}

// ── create-player ──

export const createPlayer = (lyrics: readonly LyricLine[]): PlayerState =>
  ({ lyrics, currentTime: 0, playing: false, activeLine: -1 })

// ── find-active-line ──

export const findActiveLine = (lyrics: readonly LyricLine[], time: number): number => {
  let idx = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].time <= time) idx = i;
    else break;
  }
  return idx;
}

// ── format-time ──

export const formatTime = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ── parse-lrc ──

/** @capability Fallible */
export const parseLrc = (raw: string): LyricLine[] => {
  const lines: LyricLine[] = [];
  for (const line of raw.split("\n")) {
    const m = line.match(/^\[(\d+):(\d+)\.(\d+)\](.*)$/);
    if (!m) continue;
    const time = Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 100;
    lines.push({ time, text: m[4].trim() });
  }
  return lines.sort((a, b) => a.time - b.time);
}

// ── render ──

export const render = (state: Readonly<PlayerState>, windowSize: number): string => {
  const lines = buildDisplay(state, windowSize);
  const header = `♪ ${formatTime(state.currentTime)} ${state.playing ? "▶" : "⏸"}`;
  const body = lines
    .map(l => l.active ? `  ▸ ${l.text}` : `    ${l.text}`)
    .join("\n");
  return `${header}\n${body}`;
}

// ── search-lyric ──

export const searchLyric = (lyrics: readonly LyricLine[], query: string): number => {
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].text.includes(query)) return i;
  }
  return -1;
}

// ── seek ──

export const seek = (state: Readonly<PlayerState>, time: number): PlayerState => {
  const activeLine = findActiveLine(state.lyrics, time);
  return { ...state, currentTime: time, activeLine };
}

// ── seek-by-text ──

export const seekByText = (state: Readonly<PlayerState>, query: string): PlayerState => {
  const idx = searchLyric(state.lyrics, query);
  if (idx === -1) return state;
  return seek(state, state.lyrics[idx].time);
}

// ── tick ──

export const tick = (state: Readonly<PlayerState>, deltaSeconds: number): PlayerState => {
  if (!state.playing) return state;
  const currentTime = state.currentTime + deltaSeconds;
  const activeLine = findActiveLine(state.lyrics, currentTime);
  return { ...state, currentTime, activeLine };
}

// ── toggle-play ──

export const togglePlay = (state: Readonly<PlayerState>): PlayerState =>
  ({ ...state, playing: !state.playing })
