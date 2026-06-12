#!/usr/bin/env node
import { Command } from "commander";
import * as p from "@clack/prompts";
import { shareCommand } from "./commands/share.js";
import { installCommand } from "./commands/install.js";
import { scanCommand } from "./commands/scan.js";
import { logout } from "./auth.js";

const program = new Command();

program
  .name("skillshare")
  .description(
    "Collect, detect, and share your AI coding skills via short links.",
  )
  .version("0.1.0");

program
  .command("scan")
  .description("Preview the skills found on this machine")
  .action(async () => {
    await runSafely(scanCommand);
  });

program
  .command("share")
  .description("Scan, detect, pick, and share your skills — get short links")
  .action(async () => {
    await runSafely(shareCommand);
  });

program
  .command("install <code>")
  .description("Install a shared skill by its short code (diffs against local)")
  .action(async (code: string) => {
    await runSafely(() => installCommand(code));
  });

program
  .command("logout")
  .description("Sign out and clear the cached token")
  .action(async () => {
    await runSafely(logout);
  });

// Default command: `skillshare` with no args runs share.
program.action(async () => {
  await runSafely(shareCommand);
});

async function runSafely(fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (err) {
    p.log.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

program.parseAsync(process.argv);
