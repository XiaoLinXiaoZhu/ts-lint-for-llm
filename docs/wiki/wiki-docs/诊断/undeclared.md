# undeclared

【诊断】类型，严重性：错误。

## 触发条件

函数既无【后缀命名】也无【JSDoc声明】——isDeclared = false。

## 示例

```ts
// ✗ undeclared: 无任何能力声明
function helper(x: number): number {
  return x + 1;
}
```

helper 没有 `@capability` 也没有 `_IO` 之类的后缀，被视为携带全部 5 个能力，【函数得分】按最大惩罚计算。

### 修复后

```ts
/** @capability */
function helper(x: number): number {
  return x + 1;
}
```

空 `@capability` = 纯函数，零能力，得分为 0。

### 非纯函数的声明

```ts
/** @capability IO */
function saveToFile(data: string): void {
  writeFileSync("out.txt", data);
}
```

## 效果

函数被视为携带全部 5 个【能力】，【函数得分】按最大惩罚计算。

## --fix 行为

自动添加空 `@capability`（先标记为纯函数）。后续分析中，若该函数实际需要能力，会由 【missing_capability】 驱动逐步补全。

```ts
// --fix 前
function helper(x: number): number { return x + 1; }

// --fix 后（第一轮：标记为纯）
/** @capability */
function helper(x: number): number { return x + 1; }
```
