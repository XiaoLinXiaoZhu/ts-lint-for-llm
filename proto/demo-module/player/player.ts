/**
 * 歌词滚动播放器 — 标准单文件模块
 */

// ── 类型 ──

export type LyricLine = {
  readonly time: number;
  readonly text: string;
};

export type PlayerState = {
  readonly lyrics: readonly LyricLine[];
  readonly currentTime: number;
  readonly playing: boolean;
  readonly activeLine: number;
};

export type Tick = {
  readonly state: PlayerState;
  readonly display: readonly DisplayLine[];
};

export type DisplayLine = {
  readonly index: number;
  readonly text: string;
  readonly active: boolean;
};

// ── 解析 ──

/** @capability Fallible */
export function parseLrc(raw: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const line of raw.split("\n")) {
    const m = line.match(/^\[(\d+):(\d+)\.(\d+)\](.*)$/);
    if (!m) continue;
    const time = Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 100;
    lines.push({ time, text: m[4].trim() });
  }
  return lines.sort((a, b) => a.time - b.time);
}

// ── 状态管理 ──

/** @capability */
export function createPlayer(lyrics: readonly LyricLine[]): PlayerState {
  return { lyrics, currentTime: 0, playing: false, activeLine: -1 };
}

/** @capability */
export function findActiveLine(lyrics: readonly LyricLine[], time: number): number {
  let idx = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].time <= time) idx = i;
    else break;
  }
  return idx;
}

/** @capability */
export function tick(state: PlayerState, deltaSeconds: number): PlayerState {
  if (!state.playing) return state;
  const currentTime = state.currentTime + deltaSeconds;
  const activeLine = findActiveLine(state.lyrics, currentTime);
  return { ...state, currentTime, activeLine };
}

/** @capability */
export function seek(state: PlayerState, time: number): PlayerState {
  const activeLine = findActiveLine(state.lyrics, time);
  return { ...state, currentTime: time, activeLine };
}

/** @capability */
export function searchLyric(lyrics: readonly LyricLine[], query: string): number {
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].text.includes(query)) return i;
  }
  return -1;
}

/** @capability */
export function seekByText(state: PlayerState, query: string): PlayerState {
  const idx = searchLyric(state.lyrics, query);
  if (idx === -1) return state;
  return seek(state, state.lyrics[idx].time);
}

/** @capability */
export function togglePlay(state: PlayerState): PlayerState {
  return { ...state, playing: !state.playing };
}

// ── 渲染 ──

/** @capability */
export function buildDisplay(state: PlayerState, windowSize: number): DisplayLine[] {
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

/** @capability */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** @capability */
export function render(state: PlayerState, windowSize: number): string {
  const lines = buildDisplay(state, windowSize);
  const header = `♪ ${formatTime(state.currentTime)} ${state.playing ? "▶" : "⏸"}`;
  const body = lines
    .map(l => l.active ? `  ▸ ${l.text}` : `    ${l.text}`)
    .join("\n");
  return `${header}\n${body}`;
}
