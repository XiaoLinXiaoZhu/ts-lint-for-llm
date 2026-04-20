/**
 * 类型松散度评分器
 *
 * 检测 AST 中的类型松散信号，按权重累加得分。
 * 每个信号都是事实（"这里有一个 any"），不是判断（"你不该用 any"）。
 * LLM 的目标是总分尽可能低。
 */

interface ASTNode {
  type: string;
  loc?: { start: { line: number } };
  [key: string]: unknown;
}

export interface LooseSignal {
  type: string;
  line: number;
  penalty: number;
  desc: string;
}

export interface LoosenessResult {
  signals: LooseSignal[];
  byType: Record<string, { count: number; penalty: number }>;
  total: number;
}

function walkAST(node: ASTNode, visitor: (n: ASTNode) => void) {
  if (!node || typeof node !== "object") return;
  visitor(node);
  for (const key of Object.keys(node)) {
    if (key === "parent" || key === "loc" || key === "range") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof (item as ASTNode).type === "string") walkAST(item as ASTNode, visitor);
      }
    } else if (child && typeof (child as ASTNode).type === "string") {
      walkAST(child as ASTNode, visitor);
    }
  }
}

export function scoreLooseness(source: string, ast: ASTNode): LoosenessResult {
  const signals: LooseSignal[] = [];
  const lines = source.split("\n");

  walkAST(ast, (node) => {
    const line = node.loc?.start?.line ?? 0;

    // ── any (10) ──
    if (node.type === "TSAnyKeyword") {
      signals.push({ type: "any", line, penalty: 10, desc: "any" });
    }

    // ── Object 大写 (8) — TS 官方不推荐，约等于 any ──
    if (node.type === "TSTypeReference" && (node as any).typeName?.name === "Object") {
      signals.push({ type: "Object", line, penalty: 8, desc: "Object (应使用 object 或具体类型)" });
    }

    // ── as any (8) — 类型断言绕过检查 ──
    if (node.type === "TSAsExpression") {
      const typeAnn = (node as any).typeAnnotation;
      if (typeAnn?.type === "TSAnyKeyword") {
        signals.push({ type: "as-any", line, penalty: 8, desc: "as any" });
      }
    }

    // ── Record<string, any> (8) ──
    if (node.type === "TSTypeReference" && (node as any).typeName?.name === "Record") {
      const params = (node as any).typeArguments?.params || (node as any).typeParameters?.params || [];
      if (params.length === 2 && params[0]?.type === "TSStringKeyword") {
        if (params[1]?.type === "TSAnyKeyword") {
          signals.push({ type: "Record<string,any>", line, penalty: 8, desc: "Record<string, any>" });
        } else if (params[1]?.type === "TSUnknownKeyword") {
          // ── Record<string, unknown> (5) ──
          signals.push({ type: "Record<string,unknown>", line, penalty: 5, desc: "Record<string, unknown>" });
        }
      }
    }

    // ── Function 大写 (6) — 无参数/返回值信息 ──
    if (node.type === "TSTypeReference" && (node as any).typeName?.name === "Function") {
      signals.push({ type: "Function", line, penalty: 6, desc: "Function (应使用具体函数签名)" });
    }

    // ── object 小写 (5) — 无结构信息 ──
    if (node.type === "TSObjectKeyword") {
      signals.push({ type: "object", line, penalty: 5, desc: "object (无结构信息)" });
    }

    // ── {} 空类型字面量 (5) — 约等于 object ──
    if (node.type === "TSTypeLiteral") {
      const members = (node as any).members || [];
      if (members.length === 0) {
        signals.push({ type: "{}", line, penalty: 5, desc: "{} (空类型字面量)" });
      }
    }

    // ── unknown (3) ──
    if (node.type === "TSUnknownKeyword") {
      signals.push({ type: "unknown", line, penalty: 3, desc: "unknown" });
    }

    // ── x! 非空断言 (2) ──
    if (node.type === "TSNonNullExpression") {
      signals.push({ type: "non-null-assert", line, penalty: 2, desc: "非空断言 (!)" });
    }

    // ── 函数参数 boolean (2) ──
    if (node.type === "Identifier" && (node as any).typeAnnotation?.typeAnnotation?.type === "TSBooleanKeyword") {
      signals.push({ type: "bool-param", line, penalty: 2, desc: `boolean '${(node as any).name}'` });
    }

    // ── 可选属性 (1) ──
    if (node.type === "TSPropertySignature" && (node as any).optional) {
      signals.push({ type: "optional-field", line, penalty: 1, desc: `optional '${(node as any).key?.name || "?"}'` });
    }
  });

  // ── @ts-ignore / @ts-expect-error (10) — 逐行扫描注释 ──
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.includes("@ts-ignore") || trimmed.includes("@ts-expect-error")) {
      signals.push({ type: "@ts-ignore", line: i + 1, penalty: 10, desc: trimmed.includes("@ts-expect-error") ? "@ts-expect-error" : "@ts-ignore" });
    }
  }

  const byType: Record<string, { count: number; penalty: number }> = {};
  for (const s of signals) {
    if (!byType[s.type]) byType[s.type] = { count: 0, penalty: 0 };
    byType[s.type].count++;
    byType[s.type].penalty += s.penalty;
  }
  const total = signals.reduce((s, sig) => s + sig.penalty, 0);

  return { signals, byType, total };
}
