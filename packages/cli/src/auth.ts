import * as p from "@clack/prompts";
import pc from "picocolors";
import open from "open";
import type { ApiClient } from "./api.js";
import { loadConfig, saveConfig, type CliConfig } from "./config.js";

/** Ensure we have a valid auth token, running the device flow if needed. */
export async function ensureAuth(
  config: CliConfig,
  api: ApiClient,
): Promise<CliConfig> {
  if (config.token) return config;

  p.log.info("You need to sign in to share skills.");
  const { token, deviceCode, verifyUrl } = await api.startCliAuth();

  p.note(
    `${pc.bold("Device code:")} ${pc.cyan(deviceCode)}\n\nOpen this URL and approve:\n${pc.underline(verifyUrl)}`,
    "Authorize SkillShare CLI",
  );

  // Best-effort: open the browser automatically.
  try {
    await open(verifyUrl);
  } catch {
    /* user can open manually */
  }

  const spin = p.spinner();
  spin.start("Waiting for authorization…");

  const deadline = Date.now() + 10 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2500));
    const result = await api.pollCliAuth(token);
    if (result.status === "approved") {
      spin.stop("Authorized!");
      const updated: CliConfig = {
        ...config,
        token: result.token,
        userId: result.userId,
      };
      await saveConfig(updated);
      return updated;
    }
    if (result.status === "expired" || result.status === "invalid") {
      spin.stop("Authorization failed.");
      throw new Error("Device code expired. Run the command again.");
    }
  }
  spin.stop("Timed out.");
  throw new Error("Authorization timed out.");
}

export async function logout(): Promise<void> {
  const config = await loadConfig();
  await saveConfig({ baseUrl: config.baseUrl });
  p.log.success("Signed out.");
}
