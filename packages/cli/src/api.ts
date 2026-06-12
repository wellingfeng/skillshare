import type {
  DetectionResult,
  Origin,
  SourceTool,
} from "@skillshare/core";
import type { CliConfig } from "./config.js";

export interface ApiClient {
  detect(
    items: { contentHash: string; name: string; descriptionSnippet?: string }[],
  ): Promise<DetectionResult[]>;
  startCliAuth(): Promise<{
    token: string;
    deviceCode: string;
    verifyUrl: string;
  }>;
  pollCliAuth(token: string): Promise<
    | { status: "pending" }
    | { status: "approved"; token: string; userId: string }
    | { status: "expired" | "invalid" }
  >;
  upload(
    token: string,
    items: UploadItem[],
  ): Promise<{ shared: SharedResult[] }>;
  getSkill(code: string): Promise<SkillMeta | null>;
  download(
    code: string,
    token?: string,
  ): Promise<{ meta: SkillMeta; bundleBase64: string | null }>;
}

export interface UploadItem {
  name: string;
  sourceTool: SourceTool;
  description?: string;
  version?: string;
  contentHash: string;
  sizeBytes: number;
  /**
   * base64 tar.gz of the skill. Always sent: the server decides origin later
   * (via the background scanner) and keeps the content until/unless the skill
   * is confirmed public.
   */
  bundleBase64?: string;
}

export interface SharedResult {
  name: string;
  shortCode: string;
  url: string;
  origin: Origin;
  stored: boolean;
}

export interface SkillMeta {
  name: string;
  sourceTool: SourceTool;
  origin: Origin;
  description?: string | null;
  version?: string | null;
  githubUrl?: string | null;
  contentHash: string;
  sizeBytes: number;
}

export function createApiClient(config: CliConfig): ApiClient {
  const base = config.baseUrl.replace(/\/$/, "");

  async function json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${base}${path}`, init);
    if (!res.ok) {
      let detail = "";
      try {
        detail = ((await res.json()) as { error?: string }).error ?? "";
      } catch {
        /* ignore */
      }
      throw new Error(`${res.status} ${res.statusText}${detail ? `: ${detail}` : ""}`);
    }
    return (await res.json()) as T;
  }

  return {
    async detect(items) {
      const data = await json<{ results: DetectionResult[] }>("/api/detect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items }),
      });
      return data.results;
    },

    async startCliAuth() {
      return json("/api/auth/cli/start", { method: "POST" });
    },

    async pollCliAuth(token) {
      const res = await fetch(`${base}/api/auth/cli/poll`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      return (await res.json()) as Awaited<ReturnType<ApiClient["pollCliAuth"]>>;
    },

    async upload(token, items) {
      return json<{ shared: SharedResult[] }>("/api/skills/upload", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ items }),
      });
    },

    async getSkill(code) {
      try {
        const data = await json<{ skill: SkillMeta }>(`/api/skills/${code}`);
        return data.skill;
      } catch {
        return null;
      }
    },

    async download(code, token) {
      const headers: Record<string, string> = {};
      if (token) headers.authorization = `Bearer ${token}`;
      const meta = await json<SkillMeta & { bundleBase64: string | null }>(
        `/api/skills/${code}/download`,
        { headers },
      );
      const { bundleBase64, ...rest } = meta;
      return { meta: rest, bundleBase64 };
    },
  };
}
