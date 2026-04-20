# 全量显式类型标注 (Exhaustive Type Annotations)

## 是什么

在代码中为每一个变量声明、函数参数、返回值、类属性都写上显式的类型标注，不依赖任何类型推断。即使语言能自动推断出类型，也手动写明。

## 历史相关渊源

TypeScript 自 2012 年发布以来就支持类型推断，社区很快形成了"能推断就不写"的惯例。ESLint 的 `@typescript-eslint` 插件甚至曾有 `no-inferrable-types` 规则来禁止写多余类型。

但在 2020 年前后，随着大型代码库的维护问题暴露，部分团队开始重新讨论"是否应该全量标注"。TypeScript 4.x 引入了更严格的模式（`noUncheckedIndexedAccess` 等），社区对类型精确度的要求不断提高。

2022–2023 年，GitHub Copilot 和 ChatGPT 兴起后，人们发现 LLM 在缺少显式类型的代码中生成质量明显下降——推断出的类型对人可见，但对 LLM 上下文窗口中的纯文本是不可见的。

## TypeScript 代码举例

```typescript
// ❌ 依赖推断（对人来说够用，但 LLM 看到的是无类型的变量）
const users = db.query("SELECT * FROM users");
const filtered = users.filter(u => u.age > 18);
const names = filtered.map(u => u.name);

// ✅ 全量标注（上下文中类型信息完整，LLM 和人都能立刻理解）
interface User {
  id: number;
  name: string;
  age: number;
  email: string;
}

const users: User[] = db.query<User>("SELECT * FROM users");
const filtered: User[] = users.filter((u: User): boolean => u.age > 18);
const names: string[] = filtered.map((u: User): string => u.name);
```

## 为什么被抛弃

1. **冗长**：推断已经足够准确，手动写类型被视为噪音
2. **维护负担**：改了实现还要同步改类型标注，容易遗漏
3. **IDE 补偿**：现代 IDE 悬浮提示就能显示推断类型，人类开发者不需要写出来
4. **社区风格**：TypeScript 官方文档和知名开源项目都推崇简洁风格

## 是否应该在 LLM 时代重新启用

**应该，至少在公共 API 边界和关键数据流上。** 理由：

- LLM 读到的是纯文本，没有 IDE 的悬浮提示。显式类型 = 内联文档 = 更好的上下文。
- LLM 生成代码时，如果周围代码有显式类型，生成结果的类型正确率显著更高。
- 对于全量标注的"维护负担"问题，LLM 本身就能自动更新标注，成本趋近于零。
- 编译器仍然会校验标注与实现的一致性，不会引入正确性风险。

建议启用范围：函数签名、导出接口、关键中间变量。lambda 内部的临时变量仍可依赖推断。

## 我的看法

我认为这个应该只在函数上处理，较细颗粒的的地方（比如lambda内部）因为本身就很小，仅仅通过上下文能理解。

但是：
```
现代 IDE 悬浮提示就能显示推断类型，人类开发者不需要写出来
```

这个观点是正确的，比如我认为应该让模型在函数处显式的标记它的副作用。比如：

```typescript
// 无副作用
function add(a: number, b: number): number {
  return a + b;
}
// IO、阻塞
function readFile_IO_BLOCKING(path: string): string {
  return fs.readFileSync(path, 'utf8');
}
```

(这里只是一个草稿，具体如何标记还需要再讨论讨论)

## AI 回复

你说得对，我把重点放在了"写不写类型"上，但真正有意思的方向是你提出的**在标识符中编码元信息**——比如 `readFile_IO_BLOCKING`。

这让我想到了匈牙利命名法的历史。Charles Simonyi 在 1970 年代提出的"Apps Hungarian"原来不是标记数据类型（那是后来被曲解的"Systems Hungarian"），而是标记**语义属性**：`rwPosition` 表示行索引、`colPosition` 表示列索引，让你在混用时一眼就能看出 bug。这个精神和你说的 `_IO_BLOCKING` 后缀完全一致——把 IDE 不会告诉你的语义属性编码进名字。

对人来说这太繁琐了：谁愿意每个函数名后面都跟 `_IO_BLOCKING` / `_PURE` / `_THROWS`？但对 LLM 来说这是零成本的，而且反过来帮助 LLM 在调用时做出正确判断（"这个函数会阻塞，不应该在 async 上下文中直接调用"）。

这个方向值得单独展开成一篇新文档。我应该把 001 的关注点从"写不写类型"转向"**在标识符中编码哪些语义属性是值得的**"——类型标注只是其中最平庸的一种。
