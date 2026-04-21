import { parseLrc, createPlayer, tick, seek, seekByText, togglePlay, render } from "./player/player";

const lrc = `[00:00.00]月亮代表我的心
[00:12.50]你问我爱你有多深
[00:17.30]我爱你有几分
[00:22.10]我的情也真
[00:26.80]我的爱也真
[00:31.50]月亮代表我的心
[00:40.00]你问我爱你有多深
[00:45.20]我爱你有几分
[00:50.00]你去想一想
[00:54.80]你去看一看
[00:59.50]月亮代表我的心
[01:08.00]轻轻的一个吻
[01:12.80]已经打动我的心
[01:17.50]深深的一段情
[01:22.30]教我思念到如今`;

const lyrics = parseLrc(lrc);
let state = createPlayer(lyrics);
state = togglePlay(state);

console.log("=== 初始 ===");
console.log(render(state, 5));

for (let i = 0; i < 18; i++) state = tick(state, 1);
console.log("\n=== 18秒 ===");
console.log(render(state, 5));

state = seek(state, 50);
console.log("\n=== seek 50s ===");
console.log(render(state, 5));

for (let i = 0; i < 20; i++) state = tick(state, 1);
console.log("\n=== 70秒 ===");
console.log(render(state, 5));

// 测试歌词反查跳转
state = seekByText(state, "打动我的心");
console.log("\n=== seekByText '打动我的心' ===");
console.log(render(state, 5));

console.log("\n✓ module 版本运行正常");
