/**
 * CLI 参数解析
 */

export interface CliOptions {
  command: "assert" | "type" | "infer" | "minimal" | "help";
  tsconfig?: string;
  summary: boolean;
  help: boolean;
  all: boolean;
  paths: string[];
}

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    command: "assert",
    summary: false,
    help: false,
    all: false,
    paths: [],
  };

  let i = 0;
  while (i < args.length) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") { options.help = true; i++; continue; }
    if (arg === "--summary") { options.summary = true; i++; continue; }
    if (arg === "--all") { options.all = true; i++; continue; }
    if (arg === "--tsconfig" && i + 1 < args.length) { options.tsconfig = args[++i]; i++; continue; }

    if (arg === "assert" || arg === "type" || arg === "infer" || arg === "minimal") {
      options.command = arg;
      i++;
      continue;
    }

    if (!arg.startsWith("--")) {
      options.paths.push(arg);
    }
    i++;
  }

  if (args.length === 0) options.help = true;

  return options;
}
