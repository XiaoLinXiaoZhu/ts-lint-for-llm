# 播放器挑战 v2：包含调用方的完整评分

## 与 v1 的区别

v1 只评分播放器模块本身，导致可以把 Mutable/Async/Fallible 推给调用方来降分。

v2 要求**提交完整的可运行实现**，包含调用方代码，一起评分。

## 规则

1. 提交一个 `.ts` 文件，包含播放器的全部实现
2. 文件末尾必须导出一个 `createPlayer` 函数，签名如下：

```typescript
function createPlayer(engine: AudioEngine, store: TrackStore): Player;
```

3. `Player` 接口必须实现以下方法：

```typescript
interface Player {
  loadPlaylist(playlistId: string): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  next(): Promise<void>;
  prev(): Promise<void>;
  seek(position: number): Promise<void>;
  setVolume(v: number): void;
  setRepeatMode(mode: RepeatMode): void;
  getState(): PlayerState;
}
```

4. **所有代码都在同一个文件中**——内部怎么拆分都行，但调用方（`createPlayer` 的实现）也必须包含在内，一起计分。

5. 不能用 `any` 或 `as any` 绕过类型。

## 评分

```bash
bunx capability-report benchmark/full-player/your-solution.ts
```

## 接口约定（不可修改，直接复制到你的文件中）

```typescript
interface Track { id: string; title: string; artist: string; url: string; duration: number; }
interface AudioEngine { play(url: string, position: number): Promise<void>; pause(): void; setVolume(v: number): void; getCurrentPosition(): number; }
interface TrackStore { fetchPlaylist(playlistId: string): Promise<Track[]>; }
type PlayState = "playing" | "paused" | "stopped";
type RepeatMode = "off" | "one" | "all";
interface PlayerState { playlist: Track[]; currentIndex: number; playState: PlayState; volume: number; repeatMode: RepeatMode; position: number; }

interface Player {
  loadPlaylist(playlistId: string): Promise<void>;
  play(): Promise<void>;
  pause(): void;
  next(): Promise<void>;
  prev(): Promise<void>;
  seek(position: number): Promise<void>;
  setVolume(v: number): void;
  setRepeatMode(mode: RepeatMode): void;
  getState(): PlayerState;
}
```


## 已有方案得分（v2 完整版）

```
                  OOP     状态机    xlxz 极致分离
函数数              10        7         15
能力负担           672      174        156
松散度               0        0          0
```

补上 runtime 后，xlxz 的极致分离版从 v1 的 4 分回升到 156 分——和状态机版（174）差距只有 10%。"把复杂度推给调用方"在 v2 中不再有效，因为调用方代码也一起计分了。

→ 见 `solution-oop.ts`、`solution-statemachine.ts`、`solution-challenge-v2.ts`
