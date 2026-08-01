#!/usr/bin/env bun
import { parseArgs } from "./args.js";
import { runAnalysis } from "./commands/analyze.js";
import { printHelp } from "./commands/help.js";

const options = parseArgs(process.argv.slice(2));
if (options.command === "help") {
  printHelp();
  process.exit(0);
}
runAnalysis(options);
