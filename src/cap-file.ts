/**
 * .cap.ts 外部能力声明文件解析器
 *
 * 格式：标准 TypeScript declare 语法 + @capability JSDoc
 *
 * 示例 (openai.cap.ts):
 *   /** @capability IO Async Fallible *\/
 *   declare function create(): any;
 *
 *   declare const client: {
 *     /** @capability IO Async Fallible *\/
 *     chat(...args: any[]): any;
 *   };
 *
 * 查找规则：扫描项目目录下所有 *.cap.ts 文件
 */

import { readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { Project, Node, SyntaxKind } from "ts-morph";
import { VALID_CAPABILITY_NAMES, type Capability } from "./capabilities.js";

export interface ExternalCapEntry {
  name: string;
  caps: Capability[];
  source: string;
}

/**
 * 扫描目录下所有 *.cap.ts，解析 @capability 声明
 */
export function loadCapFiles(rootDir: string): ExternalCapEntry[] {
  const capFiles = findCapFiles(rootDir);
  if (capFiles.length === 0) return [];

  const entries: ExternalCapEntry[] = [];
  const project = new Project({ compilerOptions: { strict: true } });

  for (const filePath of capFiles) {
    const sf = project.addSourceFileAtPath(filePath);

    // declare function xxx(): any;
    for (const fn of sf.getFunctions()) {
      const name = fn.getName();
      if (!name) continue;
      const caps = extractCapsFromComments(fn);
      if (caps) {
        entries.push({ name, caps, source: filePath });
      }
    }

    // declare const xxx: { method(): any; }
    for (const varDecl of sf.getVariableDeclarations()) {
      const typeNode = varDecl.getTypeNode();
      if (!typeNode || !Node.isTypeLiteral(typeNode)) continue;

      for (const member of typeNode.getMembers()) {
        if (Node.isMethodSignature(member) || Node.isPropertySignature(member)) {
          const name = member.getName();
          const caps = extractCapsFromComments(member);
          if (caps) {
            entries.push({ name, caps, source: filePath });
          }
        }
      }
    }

    // interface 声明中的方法
    for (const iface of sf.getInterfaces()) {
      for (const member of iface.getMembers()) {
        if (Node.isMethodSignature(member) || Node.isPropertySignature(member)) {
          const name = member.getName();
          const caps = extractCapsFromComments(member);
          if (caps) {
            entries.push({ name, caps, source: filePath });
          }
        }
      }
    }
  }

  return entries;
}

function extractCapsFromComments(node: Node): Capability[] | null {
  // 检查 JSDoc
  const jsDocs = node.getLeadingCommentRanges();
  for (const range of jsDocs) {
    const text = range.getText();
    const match = text.match(/@capability(?:\s+(.+))?/);
    if (match) {
      const caps: Capability[] = [];
      if (match[1]) {
        for (const word of match[1].trim().replace(/\*\/.*$/, "").trim().split(/[\s,]+/)) {
          if (VALID_CAPABILITY_NAMES.has(word as Capability)) {
            caps.push(word as Capability);
          }
        }
      }
      return caps;
    }
  }
  return null;
}

function findCapFiles(rootDir: string): string[] {
  const files: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".cap.ts")) {
        files.push(resolve(full));
      }
    }
  }

  walk(rootDir);
  return files;
}
