# 播放器挑战：在内聚和低分之间找到最优解

## 命题

实现一个音乐播放器模块，满足以下功能需求：

- 加载播放列表（从远程获取）
- 播放 / 暂停 / 停止
- 上一曲 / 下一曲（支持列表循环）
- 跳转到指定位置（seek）
- 调节音量
- 设置循环模式（关闭 / 单曲 / 列表）

播放器有内部状态（播放列表、当前曲目索引、播放状态、音量、播放位置、循环模式），需要和外部 IO（音频引擎、曲库服务）交互。

## 接口约定

所有方案必须使用以下类型定义（不可修改）：

```typescript
interface Track {
  id: string;
  title: string;
  artist: string;
  url: string;
  duration: number;
}

interface AudioEngine {
  play(url: string, position: number): Promise<void>;
  pause(): void;
  setVolume(v: number): void;
  getCurrentPosition(): number;
}

interface TrackStore {
  fetchPlaylist(playlistId: string): Promise<Track[]>;
}

type PlayState = "playing" | "paused" | "stopped";
type RepeatMode = "off" | "one" | "all";
```

## 功能需求

1. **loadPlaylist(playlistId)**: 从 TrackStore 获取播放列表，空列表报错
2. **play()**: 从当前位置开始播放当前曲目，空列表无操作
3. **pause()**: 暂停播放，记录当前位置
4. **next()**: 切到下一曲。到末尾时：repeat=all 回到第一曲，否则停止
5. **prev()**: 如果当前位置 > 3 秒，重新播放当前曲目；否则切到上一曲。到开头时：repeat=all 跳到最后一曲
6. **seek(position)**: 跳转到指定位置（clamp 到 0~duration）
7. **setVolume(v)**: 设置音量（clamp 到 0~100）
8. **setRepeatMode(mode)**: 设置循环模式

## 评分规则

使用 `bunx capability-report` 评分，目标是**两个维度都尽可能低**：

```bash
bunx capability-report your-solution.ts
```

5 个能力（每个声明的能力 = 加权语句数计入该能力得分）：

| 能力 | 什么时候需要 |
|------|------------|
| IO | 调用 AudioEngine 或 TrackStore 的方法 |
| Async | 使用 await |
| Fallible | 可能抛出错误或返回错误 |
| Mutable | 修改外部可变状态（闭包中的 let 变量、传入的对象） |
| Impure | 依赖隐式环境（Date.now、Math.random 等） |

未声明能力的函数按 5 个全能力计算（惩罚最重）。

评分基于 AST 语句节点计数（不是物理行数），压缩代码到一行不会降分。

能力声明方式：
- 函数名后缀: `function playTrack_IO_Async(...)`
- JSDoc: `/** @capability IO Async */`
- 空声明 = 纯函数: `/** @capability */`

## 已有方案和得分

### 方案 A：内聚 OOP（基线）

闭包内共享 `state` 对象，每个方法直接修改状态。

| 指标 | 值 |
|------|-----|
| 函数数 | 10 |
| 能力负担 | **636** |
| 松散度 | 0 |

问题：几乎每个方法都携带 IO + Async + Mutable，能力弥散严重。

→ 见 `player-oop.ts`

### 方案 B：散沙 FP

每个操作拆成纯状态转换 + IO 调用，17 个微函数。

| 指标 | 值 |
|------|-----|
| 函数数 | 29 |
| 能力负担 | **150** |
| 松散度 | 0 |

问题：29 个函数太碎，理解工作流需要跳很多个。

→ 见 `player-fp.ts`

### 方案 C：状态机

Elm/Redux 风格：一个纯 `transition(state, event)` 函数包含全部业务逻辑，副作用作为数据返回，由薄 IO 层执行。

| 指标 | 值 |
|------|-----|
| 函数数 | 7 |
| 能力负担 | **110.5** |
| 松散度 | 0 |

→ 见 `player-statemachine.ts`

### 方案 D：极致分离（xlxz 提交）

把 IO 函数变成单行直通（不 await，返回 Promise），错误变成 effect 数据（不 throw），去掉 runtime 层。

| 指标 | 值 |
|------|-----|
| 函数数 | 14 |
| 能力负担 | **4** |
| 松散度 | 0 |

关键手法：IO 函数只做 `return engine.play(url, pos)` 不 await（不需要 Async），错误作为 `{ kind: "error" }` 返回（不需要 Fallible），没有 runtime 层（Mutable 推给调用方）。

代价：调用方需要自己管理 `let state`、自己 `await` IO 返回的 Promise、自己处理 error effect。模块内部很干净，但复杂度转移到了接口之外。

→ 见 `player-challenge.ts`

### 对比

```
                 OOP     散沙 FP   状态机    极致分离    你的方案
函数数             10       29        7        14        ?
能力负担          636      150      110.5       4        ?
松散度              0        0        0         0        ?
```

## 挑战

能否写出一个方案，满足：

1. **能力负担 < 4**（低于极致分离版）
2. **功能完整**（8 个操作都实现）
3. **不是散沙**（函数数合理，结构清晰可读）

把你的方案放在 `benchmark/` 目录下，运行：

```bash
bunx capability-report benchmark/your-solution.ts
```

## 提示

分数的主要来源：
- 每个 IO 函数的加权语句数 × 能力数
- 嵌套越深，语句权重越高（`weight = 1 + depth`），分支语句额外 +0.5
- 评分基于 AST 语句节点，不是物理行数——把多条语句压成一行不会降分
- 纯函数（无能力）贡献 0 分——但拆成纯函数不一定降分（IO 函数语句数可能不变）
- 只有提取出"能力更少"的代码才能降分——把 IO 调用拆到子函数里，父函数仍需声明 IO，分数不降反升
- Mutable 在有状态场景中很容易弥散——状态机模式通过"返回新状态"避免了这个问题
