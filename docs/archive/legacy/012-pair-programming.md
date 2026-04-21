# 结对编程 (Pair Programming)

## 是什么

两名开发者坐在同一台电脑前协作编程。一人扮演"驾驶员"（写代码），一人扮演"领航员"（审查每一行、思考全局设计）。两人频繁轮换角色。

## 历史相关渊源

Kent Beck 在 1996–1999 年间将结对编程纳入极限编程 (XP) 的核心实践。他在克莱斯勒 C3 项目（1996）中大规模实践了这一方法。

2000 年 Laurie Williams 和 Robert Kessler 的研究表明，结对编程使开发时间仅增加 15%，但缺陷减少 15%。这一数据被广泛引用。

2000–2004 年间结对编程达到热度巅峰，许多敏捷团队将其作为必须的日常实践。ThoughtWorks 等公司以此为文化标志。

2005 年后逐渐退潮，到 2010 年代已降为"偶尔使用的工具"而非常规实践。远程工作的兴起进一步降低了采用率。

## TypeScript 代码举例

```typescript
// 结对编程本身不改变代码结构，但它产生的效果可以用代码审查对话来展示。
// 以下模拟一次结对过程中的"领航员干预"：

// 驾驶员第一版：
function findUser(users: User[], query: string): User | undefined {
  for (let i = 0; i < users.length; i++) {
    if (users[i].name.toLowerCase().includes(query.toLowerCase())) {
      return users[i];
    }
    if (users[i].email.toLowerCase().includes(query.toLowerCase())) {
      return users[i];
    }
  }
  return undefined;
}

// 领航员: "query.toLowerCase() 在每次循环迭代都重复计算了。
//          而且 name 和 email 的匹配逻辑重复了——
//          如果以后加 phone 字段还要再复制一遍。"

// 驾驶员重写（领航员实时指导后）：
function findUser(users: User[], query: string): User | undefined {
  const normalizedQuery: string = query.toLowerCase();
  const searchableFields: (keyof User)[] = ["name", "email"];

  return users.find((user: User): boolean =>
    searchableFields.some((field: keyof User): boolean =>
      String(user[field]).toLowerCase().includes(normalizedQuery)
    )
  );
}

// 领航员: "好多了。但 String(user[field]) 的类型安全性不够——
//          如果 User 有 number 类型的 age 字段被加进来会怎样？
//          应该约束 searchableFields 只包含 string 类型的字段。"

type StringKeysOf<T> = {
  [K in keyof T]: T[K] extends string ? K : never;
}[keyof T];

function findUser(users: User[], query: string): User | undefined {
  const normalizedQuery: string = query.toLowerCase();
  const searchableFields: StringKeysOf<User>[] = ["name", "email"];

  return users.find((user: User): boolean =>
    searchableFields.some((field: StringKeysOf<User>): boolean =>
      user[field].toLowerCase().includes(normalizedQuery)
    )
  );
}
```

## 为什么被抛弃

1. **人力成本翻倍**：管理层难以接受"两个人做一个人的活"
2. **社交疲劳**：内向型开发者感到持续结对令人精疲力竭
3. **水平不匹配**：一方远强于另一方时，强者觉得被拖累，弱者觉得紧张
4. **远程工作困难**：屏幕共享的延迟和沟通损耗让远程结对体验很差
5. **产出度量困难**：经理用"提交数""故事点"衡量个人，结对使归因模糊

## 是否应该在 LLM 时代重新启用

**不需要原样复兴——因为 LLM 本身就是永远在线的结对伙伴。** 理由：

- 结对编程的核心价值是"实时审查 + 知识共享 + 保持思路"。LLM 提供了其中的"实时审查"和"知识提示"，而且不会疲劳、不介意重复解释、不会因为水平差距而紧张。
- LLM 作为"领航员"的优势：能即时指出类型安全问题、性能隐患、命名不一致；缺点是无法理解业务上下文和团队政治。
- 但结对编程中"两个人交替思考同一个问题"带来的创造力碰撞，LLM 目前无法替代——LLM 更像是一个反应式的审查者，而非主动式的设计伙伴。
- 真正应该复兴的是"人 + LLM 结对"模式：人负责设计决策和业务判断，LLM 负责实时审查、补全、提出类型安全建议。这比两个人结对的成本低得多。

建议：将 LLM 作为默认的"虚拟领航员"集成到开发环境中。对于复杂的设计决策，仍然安排人与人的临时结对会议（30 分钟而非全天）。

## 我的看法

这里的例子本身我认为实际上是由上下游的不确定性带来的系统性panic。

不过这里的看法是对的，围绕pr进行审查是更好的流水线模式。

## AI 回复

同意你的结论。这属于开发流程而非代码写法。

你提到的"上下游不确定性带来的系统性 panic"很有意思——这又回到了 004/006 的核心论点。如果类型系统在边界处建立了确定性，上下游之间的"panic"就不需要存在。结对编程试图通过"两个人互相检查"来缓解不确定性，但正确的方案是通过类型从根本上消除不确定性。