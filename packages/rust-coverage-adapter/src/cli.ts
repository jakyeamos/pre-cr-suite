#!/usr/bin/env node

import {
  formatHelp,
  parseCliArgs,
  runRustCoverage,
  RustCoverageError
} from './index';

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  try {
    if (argv.includes('--help') || argv.includes('-h')) {
      process.stdout.write(`${formatHelp()}\n`);
      return 0;
    }

    const options = parseCliArgs(argv);
    if (!options) {
      process.stdout.write(`${formatHelp()}\n`);
      return 0;
    }

    const result = await runRustCoverage({
      workspaceRoot: process.cwd(),
      ...options
    });
    process.stdout.write(
      `pre-cr-rust-coverage: wrote ${result.outputPath} from ${result.rawProfileCount} raw profile(s) ` +
      `and ${result.objectPaths.length} object(s).\n`
    );
    if (result.profileDirectory) {
      process.stdout.write(`pre-cr-rust-coverage: preserved profiles at ${result.profileDirectory}\n`);
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const exitCode = error instanceof RustCoverageError ? error.exitCode : 1;
    process.stderr.write(`pre-cr-rust-coverage: ${message}\n`);
    if (error instanceof RustCoverageError && error.profileDirectory) {
      process.stderr.write(`pre-cr-rust-coverage: profiles preserved at ${error.profileDirectory}\n`);
    }
    return exitCode;
  }
}

if (require.main === module) {
  void main().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
