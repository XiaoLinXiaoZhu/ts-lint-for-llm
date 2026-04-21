# unregistered

【诊断】类型，严重性：错误。

## 触发条件

函数体内存在未解析的调用（unresolvedCalls），且被调函数：
1. 不在【外部声明文件】中
2. 不在【内置能力表】中

此时该调用按全能力（5 个）处理，同时产生此诊断。

同一个未注册函数在同一个调用方内只报一次。

## 示例

```ts
import { createClient } from "some-sdk";

/** @capability IO */
function init() {
  const client = createClient();  // ✗ unregistered: createClient 未注册
}
```

createClient 来自第三方库，不在项目内（调用解析失败），也不在内置能力表和外部声明文件中。工具无法知道它的能力，按全能力处理。

### 修复方式 1：创建外部声明文件

```ts
// some-sdk.cap.ts
/** @capability IO */
declare function createClient(): any;
```

### 修复方式 2：添加到内置能力表

若该 API 足够通用，可直接加入【内置能力表】。

### 修复后不再报 unregistered

```ts
/** @capability IO */
function init() {
  const client = createClient();  // ✓ 已通过 .cap.ts 注册，IO 匹配
}
```

## --fix 行为

无法自动修复——需要人确认外部函数的能力并创建声明。
