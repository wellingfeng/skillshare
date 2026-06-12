import * as p from "@clack/prompts";
import pc from "picocolors";
import qrcode from "qrcode-terminal";
import {
  scanAll,
  formatSize,
  packSkillBase64,
  FREE_MAX_BUNDLE_BYTES,
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
    // The server only ever confirms `public`. Anything it doesn't yet know
    // about comes back `unknown`, which we present to the user as "original"
    // (their own work) — the background scanner may reclassify it later.
    const origin: Origin = d?.origin === "public" ? "public" : "unknown";
    return {
      ...s,
      origin,
      githubUrl: d?.githubUrl,
      originLabel:
        origin === "public"
          ? "✅ safe — already public, free to share"
          : `★ original — not on the server yet, treated as yours`,
    };
  });
  if (detections.length) spin.stop("Origin check complete.");

  // 3. Sort: likely-originals first (most worth sharing), then public.
  const rank: Record<Origin, number> = { original: 0, unknown: 0, public: 1 };
  classified.sort((a, b) => {
    const r = rank[a.origin] - rank[b.origin];
    return r !== 0 ? r : a.name.localeCompare(b.name);
  });

  // 4. Interactive multi-select
  const options = classified.map((s) => ({
    value: s.contentHash,
    label: `${s.origin !== "public" ? pc.yellow("★ ") : ""}${pc.bold(s.name)} ${pc.dim(`(${s.sourceTool}, ${formatSize(s.sizeBytes)})`)}`,
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

  const finalChosen = chosen.filter((s) => chosenHashes.has(s.contentHash));
  if (finalChosen.length === 0) {
    p.outro("Nothing selected.");
    return;
  }

  // 5. Auth (only needed once we know we're uploading)
  config = await ensureAuth(config, api);

  // 6. Build upload payload. We send the content bundle for everything the
  // server hasn't already confirmed public — the server decides origin later
  // via the background scanner and keeps content only while needed. The
  // compressed bundle is checked against the free-tier limit; oversize skills
  // are flagged here and the server enforces the real per-plan limit (402).
  spin.start("Preparing upload…");
  const items: UploadItem[] = [];
  const oversize: string[] = [];
  for (const s of finalChosen) {
    const item: UploadItem = {
      name: s.name,
      sourceTool: s.sourceTool,
      description: s.description,
      version: s.version,
      contentHash: s.contentHash,
      sizeBytes: s.sizeBytes,
    };
    if (s.origin !== "public") {
      const { base64, byteSize } = await packSkillBase64(s.path);
      item.bundleBase64 = base64;
      item.sizeBytes = byteSize;
      if (byteSize > FREE_MAX_BUNDLE_BYTES) {
        oversize.push(`${s.name} (${formatSize(byteSize)})`);
      }
    }
    items.push(item);
  }
  spin.stop("Upload prepared.");

  if (oversize.length > 0) {
    p.log.warn(
      `These exceed the free ${formatSize(FREE_MAX_BUNDLE_BYTES)} limit and need a Pro plan:\n  ${oversize.join("\n  ")}`,
    );
  }

  // 7. Upload
  spin.start("Uploading…");
  let shared;
  try {
    ({ shared } = await api.upload(config.token!, items));
  } catch (err) {
    spin.stop("Upload failed.");
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("402") || /too large|limit/i.test(msg)) {
      p.log.error(
        `A skill is over your plan's size limit.\n${msg}\nUpgrade to Pro for larger skills: ${config.baseUrl}/pricing`,
      );
    } else {
      p.log.error(msg);
    }
    p.outro("Nothing shared.");
    return;
  }
  spin.stop(`Shared ${pc.bold(String(shared.length))} skills!`);

  // 8. Show results with QR for the first link.
  for (const r of shared) {
    const tag =
      r.origin === "public"
        ? pc.green("✓ public")
        : pc.yellow("★ pending review");
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
