/**
 * 类型松散度评分器
 *
 * 检测 AST 中的类型松散信号（any, unknown, Object, Function 等），
 * 按权重累加得分。基于 ts-morph 的 AST 遍历。
 */

import { SyntaxKind, Node, type SourceFile } from "ts-morph";

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

export function scoreLooseness(sf: SourceFile): LoosenessResult {
  const signals: LooseSignal[] = [];
  const source = sf.getFullText();
  const lines = source.split("\n");

  sf.forEachDescendant(node => {
    const line = node.getStartLineNumber();
    const kind = node.getKind();

    // any (10)
    if (kind === SyntaxKind.AnyKeyword) {
      // 检查是否是 as any
      const parent = node.getParent();
      if (parent && Node.isAsExpression(parent)) {
        signals.push({ type: "as-any", line, penalty: 8, desc: "as any" });
      } else {
        signals.push({ type: "any", line, penalty: 10, desc: "any" });
      }
      return;
    }

    // unknown (3)
    if (kind === SyntaxKind.UnknownKeyword) {
      signals.push({ type: "unknown", line, penalty: 3, desc: "unknown" });
      return;
    }

    // object 小写 (5)
    if (kind === SyntaxKind.ObjectKeyword) {
      signals.push({ type: "object", line, penalty: 5, desc: "object (无结构信息)" });
      return;
    }

    // 类型引用：Object/Function/Record<string,any>
    if (Node.isTypeReference(node)) {
      const typeName = node.getTypeName();
      const name = Node.isIdentifier(typeName) ? typeName.getText() : null;

      if (name === "Object") {
        signals.push({ type: "Object", line, penalty: 8, desc: "Object (应使用 object 或具体类型)" });
      } else if (name === "Function") {
        signals.push({ type: "Function", line, penalty: 6, desc: "Function (应使用具体函数签名)" });
      } else if (name === "Record") {
        const args = node.getTypeArguments();
        if (args.length === 2) {
          const valKind = args[1].getKind();
          if (valKind === SyntaxKind.AnyKeyword) {
            signals.push({ type: "Record<string,any>", line, penalty: 8, desc: "Record<string, any>" });
          } else if (valKind === SyntaxKind.UnknownKeyword) {
            signals.push({ type: "Record<string,unknown>", line, penalty: 5, desc: "Record<string, unknown>" });
          }
        }
      }
      return;
    }

    // {} 空类型字面量 (5)
    if (Node.isTypeLiteral(node) && node.getMembers().length === 0) {
      signals.push({ type: "{}", line, penalty: 5, desc: "{} (空类型字面量)" });
      return;
    }

    // x! 非空断言 (2)
    if (Node.isNonNullExpression(node)) {
      signals.push({ type: "non-null-assert", line, penalty: 2, desc: "非空断言 (!)" });
      return;
    }

    // 函数参数 boolean (2)
    if (Node.isParameterDeclaration(node)) {
      const typeNode = node.getTypeNode();
      if (typeNode && typeNode.getKind() === SyntaxKind.BooleanKeyword) {
        signals.push({ type: "bool-param", line, penalty: 2, desc: `boolean 参数 '${node.getName()}'` });
      }
      return;
    }

    // 可选属性 (1)
    if (Node.isPropertySignature(node) && node.hasQuestionToken()) {
      signals.push({ type: "optional-field", line, penalty: 1, desc: `optional '${node.getName()}'` });
      return;
    }
  });

  // @ts-ignore / @ts-expect-error (10)
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.includes("@ts-ignore")) {
      signals.push({ type: "@ts-ignore", line: i + 1, penalty: 10, desc: "@ts-ignore" });
    } else if (trimmed.includes("@ts-expect-error")) {
      signals.push({ type: "@ts-expect-error", line: i + 1, penalty: 10, desc: "@ts-expect-error" });
    }
  }

  // 汇总
  const byType: Record<string, { count: number; penalty: number }> = {};
  for (const s of signals) {
    if (!byType[s.type]) byType[s.type] = { count: 0, penalty: 0 };
    byType[s.type].count++;
    byType[s.type].penalty += s.penalty;
  }
  const total = signals.reduce((s, sig) => s + sig.penalty, 0);

  return { signals, byType, total };
}
