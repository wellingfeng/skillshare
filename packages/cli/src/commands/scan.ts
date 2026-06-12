import * as p from "@clack/prompts";
import pc from "picocolors";
import { scanAll, formatSize } from "@skillshare/core";

/** Preview the skills found on this machine without sharing anything. */
export async function scanCommand(): Promise<void> {
  p.intro(pc.bgMagenta(pc.white(" SkillShare scan ")));
  const spin = p.spinner();
  spin.start("Scanning…");
  const skills = await scanAll();
  spin.stop(`Found ${pc.bold(String(skills.length))} skills.`);

  const byTool = new Map<string, number>();
  for (const s of skills) {
    byTool.set(s.sourceTool, (byTool.get(s.sourceTool) ?? 0) + 1);
  }

  for (const s of skills) {
    console.log(
      `  ${pc.bold(s.name.padEnd(28))} ${pc.dim(s.sourceTool.padEnd(9))} ${pc.dim(formatSize(s.sizeBytes).padStart(9))}  ${s.isSymlink ? pc.dim("(symlink)") : ""}`,
    );
  }

  const summary = [...byTool.entries()]
    .map(([tool, n]) => `${tool}: ${n}`)
    .join(" · ");
  p.outro(`${summary}. Run ${pc.cyan("skillshare share")} to share them.`);
}
