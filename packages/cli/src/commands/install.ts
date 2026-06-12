import { homedir } from "node:os";
import { join } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import {
  scanAll,
  unpackSkillBase64,
  isValidShortCode,
  formatSize,
  type SourceTool,
} from "@skillshare/core";
import { loadConfig } from "../config.js";
import { createApiClient } from "../api.js";

/** Map a skill's source tool to the local install directory. */
function installDir(tool: SourceTool, home = homedir()): string {
  switch (tool) {
    case "claude":
      return join(home, ".claude", "skills");
    case "codex":
      return join(home, ".codex", "skills");
    case "openclaw":
      return join(home, ".openclaw", "skills");
    case "agents":
      return join(home, ".agents", "skills");
    default:
      return join(home, ".claude", "skills");
  }
}

export async function installCommand(code: string): Promise<void> {
  p.intro(pc.bgCyan(pc.black(" SkillShare install ")));

  if (!isValidShortCode(code)) {
    p.cancel("Invalid share code.");
    return;
  }

  const config = await loadConfig();
  const api = createApiClient(config);

  const spin = p.spinner();
  spin.start("Fetching shared skill…");
  const meta = await api.getSkill(code);
  if (!meta) {
    spin.stop("Not found.");
    p.cancel(`No skill found for code "${code}".`);
    return;
  }
  spin.stop(`Found "${pc.bold(meta.name)}".`);

  // Diff against local skills.
  spin.start("Comparing with your local skills…");
  const local = await scanAll();
  spin.stop("Comparison done.");

  const exact = local.find((s) => s.contentHash === meta.contentHash);
  const sameName = local.find((s) => s.name === meta.name);

  if (exact) {
    p.log.info(
      `${pc.green("Already installed")} — identical content at ${exact.path}`,
    );
    p.outro("Nothing to do.");
    return;
  }

  const tag =
    meta.origin === "original" ? pc.yellow("★ original") : pc.green("✓ public");
  p.note(
    [
      `${pc.bold(meta.name)} ${tag}`,
      meta.description ? pc.dim(meta.description) : "",
      `Tool: ${meta.sourceTool} · Size: ${formatSize(meta.sizeBytes)}`,
      sameName
        ? pc.yellow(
            `⚠ A different version named "${meta.name}" already exists at ${sameName.path}`,
          )
        : pc.dim("Not present on your machine."),
      meta.origin === "public" && meta.githubUrl
        ? `Source: ${meta.githubUrl}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    "Skill details",
  );

  const proceed = await p.confirm({
    message:
      meta.origin === "original"
        ? "Download and install this original skill? Review its contents before running it."
        : "This is a public skill. Install a copy locally?",
  });
  if (p.isCancel(proceed) || !proceed) {
    p.outro("Cancelled.");
    return;
  }

  // Public skills with a GitHub source and no stored bundle: point the user there.
  spin.start("Downloading…");
  const { bundleBase64 } = await api.download(code, config.token);
  if (!bundleBase64) {
    spin.stop("No bundle stored.");
    if (meta.githubUrl) {
      p.log.info(
        `This public skill isn't stored on SkillShare. Get it from:\n  ${pc.cyan(meta.githubUrl)}`,
      );
    } else {
      p.log.warn("No downloadable content available for this skill.");
    }
    p.outro("Done.");
    return;
  }

  const baseDir = installDir(meta.sourceTool);
  const target = join(baseDir, sameName ? `${meta.name}-shared` : meta.name);
  await unpackSkillBase64(bundleBase64, target);
  spin.stop("Installed.");

  p.log.success(`Installed "${meta.name}" to ${target}`);
  p.outro(
    pc.dim("Review the skill's files before running any of its scripts."),
  );
}
