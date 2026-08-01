export function printHelp() {
  console.log(`lm-linter — TypeScript effect and interface analysis

Usage:
  lm-linter check [path ...] [options]   检查 @is 契约和 @handles 证据
  lm-linter audit [aspect] [path ...] [options]   分维度审查

Audit aspects:
  effects       副作用来源、传播和 @handles
  pass-through  参数透传和依赖下沉
  looseness     any/unknown/boolean/可选字段等类型松散
  (none)        三类审查汇总

Options:
  --tsconfig <path>   指定 tsconfig.json
  --summary           只输出诊断汇总
  --help              显示帮助

Annotations:
  @is pure total readonly sync deterministic local minimal
  @handles may-return-none async mutates-input
  @effect io nondeterministic
`);
}
