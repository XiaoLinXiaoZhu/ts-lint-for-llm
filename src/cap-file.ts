/**
 * .cap.ts 外部能力声明文件解析器
 */

import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { Project, Node } from "ts-morph";
import { VALID_CAPABILITY_NAMES, type Capability } from "./capabilities.js";

export interface ExternalCapEntry {
  name: string;
  caps: Capability[];
  source: string;
}

export function loadCapFiles(rootDir: string): ExternalCapEntry[] {
  const capFiles = findCapFiles(rootDir);
  if (capFiles.length === 0) return [];

  const entries: ExternalCapEntry[] = [];
  const project = new Project({ compilerOptions: { strict: true } });

  for (const filePath of capFiles) {
    const sf = project.addSourceFileAtPath(filePath);

    for (const fn of sf.getFunctions()) {
      const name = fn.getName();
      if (!name) continue;
      const caps = extractCapsFromComments(fn);
      if (caps) entries.push({ name, caps, source: filePath });
    }

    for (const varDecl of sf.getVariableDeclarations()) {
      const typeNode = varDecl.getTypeNode();
      if (!typeNode || !Node.isTypeLiteral(typeNode)) continue;
      for (const member of typeNode.getMembers()) {
        if (Node.isMethodSignature(member) || Node.isPropertySignature(member)) {
          const name = member.getName();
          const caps = extractCapsFromComments(member);
          if (caps) entries.push({ name, caps, source: filePath });
        }
      }
    }

    for (const iface of sf.getInterfaces()) {
      for (const member of iface.getMembers()) {
        if (Node.isMethodSignature(member) || Node.isPropertySignature(member)) {
          const name = member.getName();
          const caps = extractCapsFromComments(member);
          if (caps) entries.push({ name, caps, source: filePath });
        }
      }
    }
  }

  return entries;
}

function extractCapsFromComments(node: Node): Capability[] | null {
  for (const range of node.getLeadingCommentRanges()) {
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
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".cap.ts")) files.push(resolve(full));
    }
  }
  walk(rootDir);
  return files;
}
