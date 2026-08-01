import {
  EFFECT_DESCRIPTIONS,
  GUARANTEE_FORBIDS,
  type Advice,
  type Diagnostic,
  type Effect,
  type FunctionFact,
  type ProjectSnapshot,
} from "@lm-linter/model";

export interface AnalysisResult {
  effects: Map<string, Set<Effect>>;
  diagnostics: Diagnostic[];
}

export type AnalysisMode = "check" | "audit" | "effects" | "pass-through" | "looseness";

export function analyzeProject(snapshot: ProjectSnapshot, mode: AnalysisMode): AnalysisResult {
  const rawEffects = inferEffects(snapshot);
  const effects = applyProvenHandling(snapshot, rawEffects);
  const effectDiagnostics = [...checkContracts(snapshot, effects), ...checkHandling(snapshot, rawEffects)];
  const structureDiagnostics = checkStructure(snapshot);
  const loosenessDiagnostics = checkLooseness(snapshot);
  const diagnostics = mode === "check" || mode === "effects"
    ? effectDiagnostics
    : mode === "pass-through"
      ? structureDiagnostics
      : mode === "looseness"
        ? loosenessDiagnostics
        : [...effectDiagnostics, ...structureDiagnostics, ...loosenessDiagnostics];
  return { effects, diagnostics };
}

function inferEffects(snapshot: ProjectSnapshot): Map<string, Set<Effect>> {
  const result = new Map<string, Set<Effect>>();
  for (const [id, fn] of snapshot.functions) result.set(id, new Set(fn.ownEffects));
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, fn] of snapshot.functions) {
      const current = result.get(id)!;
      const before = current.size;
      for (const call of fn.calls) {
        if (call.targetId) {
          for (const effect of result.get(call.targetId) ?? []) current.add(effect);
        } else {
          for (const effect of externalEffects(snapshot, call.targetName)) current.add(effect);
        }
      }
      if (current.size !== before) changed = true;
    }
  }
  return result;
}

function externalEffects(snapshot: ProjectSnapshot, name: string): Effect[] {
  const declared = snapshot.externalEffects.get(name);
  if (declared) return declared;
  const effects: Record<string, Effect[]> = {
    fetch: ["io", "async", "may-return-none"],
    readFileSync: ["io", "may-return-none"],
    writeFileSync: ["io", "may-return-none"],
    readFile: ["io", "async", "may-return-none"],
    writeFile: ["io", "async", "may-return-none"],
    random: ["nondeterministic"],
    now: ["nondeterministic"],
    parse: ["may-return-none"],
  };
  return effects[name] ?? [];
}

function applyProvenHandling(snapshot: ProjectSnapshot, raw: Map<string, Set<Effect>>) {
  const result = new Map<string, Set<Effect>>();
  for (const [id, fn] of snapshot.functions) {
    const current = new Set(raw.get(id) ?? []);
    for (const effect of fn.contract?.handles ?? []) {
      if (handlingEvidence(fn, effect) && !fn.ownEffects.includes(effect)) current.delete(effect);
    }
    result.set(id, current);
  }
  return result;
}

function checkContracts(snapshot: ProjectSnapshot, effects: Map<string, Set<Effect>>): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const [id, fn] of snapshot.functions) {
    if (!fn.contract) continue;
    const actual = effects.get(id) ?? new Set<Effect>();
    for (const guarantee of fn.contract.guarantees) {
      for (const effect of GUARANTEE_FORBIDS[guarantee]) {
        if (!actual.has(effect)) continue;
        diagnostics.push({
          kind: "contract-violation",
          severity: "error",
          message: `${fn.name} 声明 @is ${guarantee}，但实际具有 ${effect}：${EFFECT_DESCRIPTIONS[effect]}`,
          filePath: fn.filePath,
          line: fn.line,
          functionName: fn.name,
          effect,
          guarantee,
          evidence: [{ kind: "inferred-effect", message: EFFECT_DESCRIPTIONS[effect], functionName: fn.name }],
          advice: adviceForEffect(effect),
        });
      }
    }
  }
  return diagnostics;
}

function checkHandling(snapshot: ProjectSnapshot, effects: Map<string, Set<Effect>>): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const [id, fn] of snapshot.functions) {
    if (!fn.contract) continue;
    const actual = effects.get(id) ?? new Set<Effect>();
    for (const effect of fn.contract.handles) {
      const evidence = handlingEvidence(fn, effect);
      if (!evidence) {
        diagnostics.push({
          kind: "unproven-handling",
          severity: "error",
          message: `${fn.name} 声明处理 ${effect}，但未找到足够的代码证据`,
          filePath: fn.filePath,
          line: fn.line,
          functionName: fn.name,
          effect,
          evidence: [],
        });
      } else if (fn.ownEffects.includes(effect)) {
        diagnostics.push({
          kind: "unproven-handling",
          severity: "error",
          message: `${fn.name} 处理了 ${effect}，但自身仍产生该效果，不能阻断传播`,
          filePath: fn.filePath,
          line: fn.line,
          functionName: fn.name,
          effect,
          evidence: [{ kind: "own-effect", message: "函数自身仍具有该效果" }],
        });
      }
    }
  }
  return diagnostics;
}

function handlingEvidence(fn: FunctionFact, effect: Effect): boolean {
  const body = fn.bodyText ?? "";
  if (effect === "may-return-none") return body.includes("??") || /\bif\s*\(/.test(body);
  if (effect === "mutates-input") return body.includes("...") || body.includes("structuredClone");
  if (effect === "async") return body.includes("await") && !/\basync\s+function\b/.test(body);
  return false;
}

function checkStructure(snapshot: ProjectSnapshot): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const [id, fn] of snapshot.functions) {
    for (const parameter of fn.parameters) {
      if (parameter.forwardedTo.length > 0 && parameter.localUses === 0) {
        const advice: Advice[] = [{
          code: "dependency-lowering",
          message: `考虑将下游依赖预先绑定，再把绑定后的函数传入 ${fn.name}，避免参数经过当前函数透传。`,
          confidence: "high",
        }];
        diagnostics.push({
          kind: "pass-through-parameter",
          severity: fn.exported ? "error" : "warning",
          message: `${fn.name}.${parameter.name} 只被转发给下游调用，没有本地消费`,
          filePath: fn.filePath,
          line: parameter.line,
          functionName: fn.name,
          evidence: parameter.forwardedTo.map(target => ({
            kind: "forward",
            message: `转发给 ${target.callee}`,
            line: target.line,
          })),
          advice,
        });
      } else if (parameter.forwardedTo.length === 0 && parameter.localUses === 0) {
        diagnostics.push({
          kind: "unused-parameter",
          severity: "warning",
          message: `${fn.name}.${parameter.name} 完全未使用`,
          filePath: fn.filePath,
          line: parameter.line,
          functionName: fn.name,
          evidence: [],
        });
      }
    }
  }
  return diagnostics;
}

function checkLooseness(snapshot: ProjectSnapshot): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const file of snapshot.files) {
    const lines = file.text.split(/\r?\n/);
    lines.forEach((line, index) => {
      const lineNumber = index + 1;
      const signals: Array<{ code: string; message: string }> = [];
      if (/\bany\b/.test(line)) signals.push({ code: "any", message: "使用 any，类型边界失去约束" });
      if (/\bunknown\b/.test(line)) signals.push({ code: "unknown", message: "使用 unknown，需要显式收窄" });
      if (/@ts-ignore|@ts-expect-error/.test(line)) signals.push({ code: "suppression", message: "使用 TypeScript 错误抑制注释" });
      if (/\b\w+\s*:\s*boolean\b/.test(line)) signals.push({ code: "boolean-flag", message: "boolean 参数可能隐藏多个状态" });
      if (/\b\w+\??\s*:\s*[^=;]+/.test(line) && line.includes("?")) {
        signals.push({ code: "optional-field", message: "可选字段可能扩大无效状态空间" });
      }
      for (const signal of signals) {
        diagnostics.push({
          kind: "type-looseness",
          severity: "warning",
          message: signal.message,
          filePath: file.filePath,
          line: lineNumber,
          evidence: [{ kind: "type-looseness", message: signal.code }],
          advice: [{
            code: `tighten-${signal.code}`,
            message: "收窄类型边界，优先使用显式联合类型或解析后的领域类型。",
            confidence: "medium",
          }],
        });
      }
    });
  }
  return diagnostics;
}

function adviceForEffect(effect: Effect): Advice[] {
  const advice: Record<Effect, Advice> = {
    io: { code: "isolate-io", message: "将 IO 限制在边界函数，并让内部转换函数保持纯净。", confidence: "medium" },
    nondeterministic: { code: "inject-environment", message: "将时间、随机数或全局状态作为显式依赖传入。", confidence: "high" },
    "may-return-none": { code: "parse-early", message: "尽早解析并转换为确定值，使用默认值或显式 Result 类型收敛分支。", confidence: "high" },
    async: { code: "separate-async-boundary", message: "将异步边界限制在少数入口函数。", confidence: "medium" },
    "mutates-input": { code: "use-readonly", message: "优先使用 readonly 输入，或在边界创建局部副本。", confidence: "high" },
  };
  return [advice[effect]];
}
