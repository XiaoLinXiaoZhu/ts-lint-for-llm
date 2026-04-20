/**
 * 类型松散度评分器
 *
 * 检测 AST 中的类型松散信号，按权重累加得分。
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

export function scoreLooseness(_source: string, ast: ASTNode): LoosenessResult {
  const signals: LooseSignal[] = [];

  walkAST(ast, (node) => {
    const line = node.loc?.start?.line ?? 0;

    if (node.type === "TSAnyKeyword") {
      signals.push({ type: "any", line, penalty: 10, desc: "any" });
    }

    if (node.type === "TSUnknownKeyword") {
      signals.push({ type: "unknown", line, penalty: 3, desc: "unknown" });
    }

    if (node.type === "TSTypeReference" && (node as any).typeName?.name === "Record") {
      const params = (node as any).typeArguments?.params || (node as any).typeParameters?.params || [];
      if (params.length === 2 && params[0]?.type === "TSStringKeyword" && params[1]?.type === "TSAnyKeyword") {
        signals.push({ type: "record-string-any", line, penalty: 8, desc: "Record<string, any>" });
      }
    }

    if (node.type === "Identifier" && (node as any).typeAnnotation?.typeAnnotation?.type === "TSBooleanKeyword") {
      signals.push({ type: "bool-param", line, penalty: 2, desc: `boolean '${(node as any).name}'` });
    }

    if (node.type === "TSPropertySignature" && (node as any).optional) {
      signals.push({ type: "optional-field", line, penalty: 1, desc: `optional '${(node as any).key?.name || "?"}'` });
    }
  });

  const byType: Record<string, { count: number; penalty: number }> = {};
  for (const s of signals) {
    if (!byType[s.type]) byType[s.type] = { count: 0, penalty: 0 };
    byType[s.type].count++;
    byType[s.type].penalty += s.penalty;
  }
  const total = signals.reduce((s, sig) => s + sig.penalty, 0);

  return { signals, byType, total };
}
