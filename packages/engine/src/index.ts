import {
  Node,
  Project,
  type FunctionDeclaration,
  type FunctionExpression,
  type MethodDeclaration,
  type SourceFile,
  type VariableDeclaration,
} from "ts-morph";
import type {
  Contract,
  Effect,
  FunctionFact,
  ParameterFact,
  ProjectSnapshot,
} from "@lm-linter/model";

type FunctionNode = FunctionDeclaration | FunctionExpression | MethodDeclaration | import("ts-morph").ArrowFunction;
type Candidate = { name: string; node: FunctionNode; position: Node };

export function loadProject(tsconfigPath: string): ProjectSnapshot {
  const project = new Project({ tsConfigFilePath: tsconfigPath });
  const sourceFiles = project.getSourceFiles().filter(sf => isScannable(sf));
  const functions = new Map<string, FunctionFact>();
  const externalEffects = new Map<string, Effect[]>();
  const candidates: Candidate[] = [];

  for (const sf of sourceFiles) collectCandidates(sf, candidates);
  for (const sf of sourceFiles) collectExternalEffects(sf, externalEffects);
  for (const candidate of candidates) {
    const id = makeId(candidate.position.getSourceFile().getFilePath(), candidate.position.getStart());
    functions.set(id, {
      id,
      name: candidate.name,
      filePath: candidate.position.getSourceFile().getFilePath(),
      line: candidate.position.getStartLineNumber(),
      exported: isExported(candidate.position),
      parameters: candidate.node.getParameters().map(parameter => parameterFact(parameter, candidate.node)),
      calls: [],
      ownEffects: inferOwnEffects(candidate.node),
      contract: parseContract(candidate.position) ?? parseContract(candidate.node),
      bodyText: candidate.node.getBody()?.getText(),
    });
  }

  for (const sf of sourceFiles) resolveCalls(sf, functions);
  return {
    tsconfigPath,
    filesScanned: sourceFiles.length,
    functions,
    externalEffects,
    files: sourceFiles.map(sf => ({ filePath: sf.getFilePath(), text: sf.getFullText() })),
  };
}

function isScannable(sf: SourceFile): boolean {
  const path = sf.getFilePath();
  return !path.includes("node_modules") && !path.endsWith(".d.ts") && !path.endsWith(".cap.ts");
}

function collectCandidates(sf: SourceFile, out: Candidate[]) {
  for (const fn of sf.getFunctions()) {
    if (fn.getName() && !fn.hasDeclareKeyword()) out.push({ name: fn.getName()!, node: fn, position: fn });
  }
  for (const variable of sf.getVariableDeclarations()) {
    const init = variable.getInitializer();
    if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
      out.push({ name: variable.getName(), node: init, position: variable });
    }
  }
  for (const cls of sf.getClasses()) {
    for (const method of cls.getMethods()) out.push({ name: method.getName(), node: method, position: method });
  }
  sf.forEachDescendant(node => {
    if (Node.isMethodDeclaration(node) && Node.isObjectLiteralExpression(node.getParent())) {
      out.push({ name: node.getName(), node, position: node });
    }
    if (Node.isPropertyAssignment(node) && Node.isObjectLiteralExpression(node.getParent())) {
      const init = node.getInitializer();
      if (init && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
        out.push({ name: node.getName(), node: init, position: node });
      }
    }
  });
}

function collectExternalEffects(sf: SourceFile, out: Map<string, Effect[]>) {
  sf.forEachDescendant(node => {
    const comments = node.getLeadingCommentRanges();
    if (comments.length === 0) return;
    const match = comments.map(comment => comment.getText().match(/@effect\s+([^\n*]+)/)).find(Boolean);
    if (!match) return;
    const effects = match[1].trim().split(/[\s,]+/).filter(token =>
      ["io", "nondeterministic", "may-return-none", "async", "mutates-input"].includes(token),
    ) as Effect[];
    if (effects.length === 0) return;
    if (Node.isFunctionDeclaration(node) && node.getName()) out.set(node.getName()!, effects);
    if (Node.isVariableDeclaration(node)) out.set(node.getName(), effects);
  });
}

function resolveCalls(sf: SourceFile, functions: Map<string, FunctionFact>) {
  sf.forEachDescendant(node => {
    if (!Node.isCallExpression(node)) return;
    const owner = findOwner(node, sf.getFilePath(), functions);
    if (!owner) return;
    const expr = node.getExpression();
    const targetName = Node.isIdentifier(expr)
      ? expr.getText()
      : Node.isPropertyAccessExpression(expr) ? expr.getName() : expr.getText();
    let targetId: string | null = null;
    try {
      const symbol = expr.getSymbol();
      const declaration = symbol?.getDeclarations()[0];
      if (declaration) {
        const id = makeId(declaration.getSourceFile().getFilePath(), declaration.getStart());
        if (functions.has(id)) targetId = id;
        if (Node.isVariableDeclaration(declaration)) {
          const variableId = makeId(declaration.getSourceFile().getFilePath(), declaration.getStart());
          if (functions.has(variableId)) targetId = variableId;
        }
      }
    } catch {
      // Unresolved calls remain external evidence.
    }
    owner.calls.push({ targetId, targetName, line: node.getStartLineNumber() });
  });
}

function findOwner(node: Node, filePath: string, functions: Map<string, FunctionFact>): FunctionFact | null {
  let current = node.getParent();
  while (current) {
    if (Node.isFunctionDeclaration(current) || Node.isArrowFunction(current) ||
        Node.isFunctionExpression(current) || Node.isMethodDeclaration(current)) {
      const direct = functions.get(makeId(filePath, current.getStart()));
      if (direct) return direct;
      const parent = current.getParent();
      if (parent && (Node.isVariableDeclaration(parent) || Node.isPropertyAssignment(parent))) {
        const wrapped = functions.get(makeId(filePath, parent.getStart()));
        if (wrapped) return wrapped;
      }
    }
    current = current.getParent();
  }
  return null;
}

function makeId(filePath: string, position: number) {
  return `${filePath}:${position}`;
}

function parameterFact(parameter: import("ts-morph").ParameterDeclaration, fn: FunctionNode): ParameterFact {
  const type = parameter.getType();
  const typeText = parameter.getTypeNode()?.getText() ?? type.getText();
  const isReference = !type.isString() && !type.isNumber() && !type.isBoolean() && !type.isEnum();
  const isReadonly = /^(readonly\s|Readonly<|ReadonlyArray<|ReadonlyMap<|ReadonlySet<)/.test(typeText);
  const forwardedTo: { callee: string; line: number }[] = [];
  let localUses = 0;
  const symbol = parameter.getNameNode().getSymbol();
  const body = fn.getBody();
  if (symbol && body) {
    for (const ref of body.getDescendants()) {
      if (!Node.isIdentifier(ref) || ref.getSymbol() !== symbol) continue;
      let current: Node = ref;
      let parent = current.getParent();
      let forwarded = false;
      while (parent && parent !== body) {
        if (Node.isPropertyAccessExpression(parent) && parent.getExpression() === current) {
          current = parent;
          parent = current.getParent();
          continue;
        }
        if (Node.isCallExpression(parent)) {
          if (parent.getArguments().some(arg => arg === current)) {
            const expr = parent.getExpression();
            const callee = Node.isIdentifier(expr) ? expr.getText()
              : Node.isPropertyAccessExpression(expr) ? expr.getName() : expr.getText();
            forwardedTo.push({ callee, line: parent.getStartLineNumber() });
            forwarded = true;
          }
          break;
        }
        break;
      }
      if (!forwarded) localUses++;
    }
  }
  return { name: parameter.getName(), line: parameter.getStartLineNumber(), typeText, isReadonly, isReference, writes: 0, forwardedTo, localUses };
}

function inferOwnEffects(node: FunctionNode): Effect[] {
  const effects = new Set<Effect>();
  if (node.isAsync?.()) effects.add("async");
  const returnType = node.getReturnType();
  if (isNullable(returnType)) effects.add("may-return-none");
  const body = node.getBody();
  if (body) {
    for (const descendant of body.getDescendants()) {
      if (Node.isCallExpression(descendant)) {
        // External effects are applied by rules after call resolution.
      }
    }
    if (hasInputWrite(node)) effects.add("mutates-input");
  }
  return [...effects];
}

function hasInputWrite(node: FunctionNode): boolean {
  const body = node.getBody();
  if (!body) return false;
  for (const parameter of node.getParameters()) {
    const symbol = parameter.getNameNode().getSymbol();
    if (!symbol) continue;
    for (const descendant of body.getDescendants()) {
      if (!Node.isIdentifier(descendant) || descendant.getSymbol() !== symbol) continue;
      const parent = descendant.getParent();
      if (parent && Node.isPropertyAccessExpression(parent) && parent.getExpression() === descendant) {
        const next = parent.getParent();
        if (next && Node.isBinaryExpression(next) && next.getLeft() === parent) return true;
        if (next && Node.isCallExpression(next) && next.getExpression() === parent &&
            ["push", "pop", "shift", "unshift", "splice", "sort", "reverse", "set", "add", "delete", "clear"].includes(parent.getName())) {
          return true;
        }
      }
    }
  }
  return false;
}

function isNullable(type: import("ts-morph").Type): boolean {
  if (type.isNull() || type.isUndefined()) return true;
  if (type.isUnion()) return type.getUnionTypes().some(isNullable);
  return type.getTypeArguments().some(isNullable);
}

function parseContract(node: Node): Contract | null {
  const comments = node.getLeadingCommentRanges().map(range => range.getText());
  const guarantees = new Set<Contract["guarantees"][number]>();
  const handles = new Set<Effect>();
  let found = false;
  for (const text of comments) {
    const isMatch = text.match(/@is\s+([^\n*]+)/);
    if (isMatch) {
      found = true;
      for (const token of isMatch[1].trim().split(/[\s,]+/)) {
        if (["pure", "total", "readonly", "sync", "deterministic", "local", "minimal"].includes(token)) {
          guarantees.add(token as Contract["guarantees"][number]);
        }
      }
    }
    const handlesMatch = text.match(/@handles\s+([^\n*]+)/);
    if (handlesMatch) {
      found = true;
      for (const token of handlesMatch[1].trim().split(/[\s,]+/)) {
        if (["io", "nondeterministic", "may-return-none", "async", "mutates-input"].includes(token)) {
          handles.add(token as Effect);
        }
      }
    }
  }
  return found ? { guarantees: [...guarantees], handles: [...handles], source: "is" } : null;
}

function isExported(node: Node): boolean {
  const sourceText = node.getSourceFile().getFullText();
  const before = sourceText.slice(0, node.getStart());
  const lineStart = before.lastIndexOf("\n") + 1;
  return /\bexport\s+(async\s+)?(function|const|class)\b/.test(sourceText.slice(lineStart, node.getStart() + 20));
}

export type { ProjectSnapshot };
