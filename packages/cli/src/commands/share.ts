import * as p from "@clack/prompts";
import pc from "picocolors";
import qrcode from "qrcode-terminal";
import {
  scanAll,
  formatSize,
  originLabel,
  packSkillBase64,
  LARGE_SKILL_WARN_BYTES,
  type ClassifiedSkill,
  type Origin,
} from "@skillshare/core";
import { loadConfig } from "../config.js";
import { createApiClient, type UploadItem } from "../api.js";
import { ensureAuth } from "../auth.js";

export async function shareCommand(): Promise<void> {
  p.intro(pc.bgMagenta(pc.white(" SkillShare ")));

  let config = await loadConfig();
  const api = createApiClient(config);

  // 1. Scan
  const spin = p.spinner();
  spin.start("Scanning your machine for skills…");
  const scanned = await scanAll();
  spin.stop(`Found ${pc.bold(String(scanned.length))} skills.`);

  if (scanned.length === 0) {
    p.outro("No skills found. Nothing to share.");
    return;
  }

  // 2. Detect origin (batched)
  spin.start("Checking which skills are public vs. original…");
  let detections: Awaited<ReturnType<typeof api.detect>> = [];
  try {
    detections = await api.detect(
      scanned.map((s) => ({
        contentHash: s.contentHash,
        name: s.name,
        descriptionSnippet: s.description?.slice(0, 200),
      })),
    );
  } catch (err) {
    spin.stop("Detection unavailable — treating all as unknown.");
    p.log.warn(err instanceof Error ? err.message : String(err));
  }
  const byHash = new Map(detections.map((d) => [d.contentHash, d]));

  const classified: ClassifiedSkill[] = scanned.map((s) => {
    const d = byHash.get(s.contentHash);
    const origin: Origin = d?.origin ?? "unknown";
    return {
      ...s,
      origin,
      githubUrl: d?.githubUrl,
      originLabel: originLabel(origin, s.sourceTool),
    };
  });
  if (detections.length) spin.stop("Origin check complete.");

  // 3. Sort: originals first (most worth sharing), then unknown, then public.
  const rank: Record<Origin, number> = { original: 0, unknown: 1, public: 2 };
  classified.sort((a, b) => {
    const r = rank[a.origin] - rank[b.origin];
    return r !== 0 ? r : a.name.localeCompare(b.name);
  });

  // 4. Interactive multi-select
  const options = classified.map((s) => ({
    value: s.contentHash,
    label: `${s.origin === "original" ? pc.yellow("★ ") : ""}${pc.bold(s.name)} ${pc.dim(`(${s.sourceTool}, ${formatSize(s.sizeBytes)})`)}`,
    hint: s.originLabel,
  }));

  const selected = await p.multiselect({
    message: "Select skills to share (originals are pinned to the top):",
    options,
    required: false,
  });

  if (p.isCancel(selected) || (selected as string[]).length === 0) {
    p.outro("Nothing selected.");
    return;
  }
  const chosenHashes = new Set(selected as string[]);
  const chosen = classified.filter((s) => chosenHashes.has(s.contentHash));

  // Warn on large originals before upload.
  for (const s of chosen) {
    if (s.origin === "original" && s.sizeBytes > LARGE_SKILL_WARN_BYTES) {
      const go = await p.confirm({
        message: `"${s.name}" is ${formatSize(s.sizeBytes)}. Upload anyway?`,
      });
      if (p.isCancel(go) || !go) {
        chosenHashes.delete(s.contentHash);
      }
    }
  }
  const finalChosen = chosen.filter((s) => chosenHashes.has(s.contentHash));
  if (finalChosen.length === 0) {
    p.outro("Nothing to upload.");
    return;
  }

  // 5. Auth (only needed once we know we're uploading)
  config = await ensureAuth(config, api);

  // 6. Build upload payload — bundle content only for originals.
  spin.start("Preparing upload…");
  const items: UploadItem[] = [];
  for (const s of finalChosen) {
    const item: UploadItem = {
      name: s.name,
      sourceTool: s.sourceTool,
      origin: s.origin === "unknown" ? "original" : s.origin,
      description: s.description,
      version: s.version,
      contentHash: s.contentHash,
      githubUrl: s.githubUrl,
      sizeBytes: s.sizeBytes,
    };
    if (item.origin === "original") {
      const { base64, byteSize } = await packSkillBase64(s.path);
      item.bundleBase64 = base64;
      item.sizeBytes = byteSize;
    }
    items.push(item);
  }
  spin.stop("Upload prepared.");

  // 7. Upload
  spin.start("Uploading…");
  const { shared } = await api.upload(config.token!, items);
  spin.stop(`Shared ${pc.bold(String(shared.length))} skills!`);

  // 8. Show results with QR for the first link.
  for (const r of shared) {
    const tag =
      r.origin === "original" ? pc.yellow("★ original") : pc.green("✓ public");
    p.log.success(`${pc.bold(r.name)} ${tag}\n  ${pc.cyan(r.url)}`);
  }
  if (shared[0]) {
    p.log.message("Scan to share:");
    qrcode.generate(shared[0].url, { small: true });
  }

  p.outro(
    pc.dim(
      `View your dashboard: ${config.baseUrl}/dashboard — climb the leaderboard!`,
    ),
  );
}
