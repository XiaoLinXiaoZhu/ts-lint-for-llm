/**
 * 类型松散度检测
 *
 * 扫描 AST 中的类型松散信号（any, unknown, Object, Function 等），
 * 逐条报告具体位置和问题描述。不做评分累加。
 */

import { SyntaxKind, Node, type SourceFile } from "ts-morph";

export interface LooseSignal {
  type: string;
  line: number;
  desc: string;
}

export interface LoosenessResult {
  signals: LooseSignal[];
}

export function scoreLooseness(sf: SourceFile): LoosenessResult {
  const signals: LooseSignal[] = [];
  const source = sf.getFullText();
  const lines = source.split("\n");

  sf.forEachDescendant(node => {
    const line = node.getStartLineNumber();
    const kind = node.getKind();

    if (kind === SyntaxKind.AnyKeyword) {
      const parent = node.getParent();
      if (parent && Node.isAsExpression(parent)) {
        signals.push({ type: "as-any", line, desc: "as any 类型断言" });
      } else {
        signals.push({ type: "any", line, desc: "any 类型" });
      }
      return;
    }

    if (kind === SyntaxKind.UnknownKeyword) {
      signals.push({ type: "unknown", line, desc: "unknown 类型（需运行时收窄）" });
      return;
    }

    if (kind === SyntaxKind.ObjectKeyword) {
      signals.push({ type: "object", line, desc: "object 类型（无结构信息）" });
      return;
    }

    if (Node.isTypeReference(node)) {
      const typeName = node.getTypeName();
      const name = Node.isIdentifier(typeName) ? typeName.getText() : null;
      if (name === "Object") {
        signals.push({ type: "Object", line, desc: "Object 类型（应使用具体类型）" });
      } else if (name === "Function") {
        signals.push({ type: "Function", line, desc: "Function 类型（应使用具体函数签名）" });
      } else if (name === "Record") {
        const args = node.getTypeArguments();
        if (args.length === 2) {
          const valKind = args[1].getKind();
          if (valKind === SyntaxKind.AnyKeyword) {
            signals.push({ type: "Record<string,any>", line, desc: "Record<string, any>（值无约束）" });
          } else if (valKind === SyntaxKind.UnknownKeyword) {
            signals.push({ type: "Record<string,unknown>", line, desc: "Record<string, unknown>（值需收窄）" });
          }
        }
      }
      return;
    }

    if (Node.isTypeLiteral(node) && node.getMembers().length === 0) {
      signals.push({ type: "{}", line, desc: "{} 空类型字面量" });
      return;
    }

    if (Node.isNonNullExpression(node)) {
      signals.push({ type: "non-null-assert", line, desc: "非空断言 (!)（应收窄类型代替）" });
      return;
    }

    if (Node.isParameterDeclaration(node)) {
      const typeNode = node.getTypeNode();
      if (typeNode && typeNode.getKind() === SyntaxKind.BooleanKeyword) {
        signals.push({ type: "bool-param", line, desc: `boolean 参数 '${node.getName()}'（考虑用枚举替代）` });
      }
      return;
    }

    if (Node.isPropertySignature(node) && node.hasQuestionToken()) {
      signals.push({ type: "optional-field", line, desc: `可选字段 '${node.getName()}'` });
      return;
    }
  });

  // @ts-ignore / @ts-expect-error
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.includes("@ts-ignore")) {
      signals.push({ type: "@ts-ignore", line: i + 1, desc: "@ts-ignore（绕过类型检查）" });
    } else if (trimmed.includes("@ts-expect-error")) {
      signals.push({ type: "@ts-expect-error", line: i + 1, desc: "@ts-expect-error（绕过类型检查）" });
    }
  }

  return { signals };
}
