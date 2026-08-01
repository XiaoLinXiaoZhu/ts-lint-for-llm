export interface CliOptions {
  command: "check" | "audit" | "help";
  auditAspect: "all" | "effects" | "pass-through" | "looseness";
  tsconfig?: string;
  summary: boolean;
  paths: string[];
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = { command: "help", auditAspect: "all", summary: false, paths: [] };
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === "check" || arg === "audit") options.command = arg;
    else if (options.command === "audit" && ["effects", "pass-through", "looseness"].includes(arg)) {
      options.auditAspect = arg as CliOptions["auditAspect"];
    }
    else if (arg === "--summary") options.summary = true;
    else if (arg === "--tsconfig" && args[i + 1]) options.tsconfig = args[++i];
    else if (arg === "--help" || arg === "-h") options.command = "help";
    else if (!arg.startsWith("--")) options.paths.push(arg);
    i++;
  }
  return options;
}
