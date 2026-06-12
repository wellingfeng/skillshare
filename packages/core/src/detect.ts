import type { DetectionResult, Origin, SourceTool } from "./types.js";

/** Build the human label shown for an original/public skill in the CLI list. */
export function originLabel(origin: Origin, sourceTool: SourceTool): string {
  switch (origin) {
    case "public":
      return "✅ safe — found online, free to share";
    case "original":
      return `★ original — maybe built by ${sourceTool}`;
    default:
      return "… not checked yet";
  }
}

export interface DetectClient {
  /**
   * Ask the backend to classify a batch of content hashes. The backend checks
   * its cache, then GitHub, then a general search engine, and returns one
   * result per hash.
   */
  detect(
    inputs: { contentHash: string; name: string; descriptionSnippet?: string }[],
  ): Promise<DetectionResult[]>;
}

/** HTTP-backed detection client used by the CLI against the web API. */
export function createHttpDetectClient(
  baseUrl: string,
  fetchImpl: typeof fetch = fetch,
): DetectClient {
  return {
    async detect(inputs) {
      const res = await fetchImpl(`${baseUrl.replace(/\/$/, "")}/api/detect`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: inputs }),
      });
      if (!res.ok) {
        throw new Error(`Detection failed: ${res.status} ${res.statusText}`);
      }
      const data = (await res.json()) as { results: DetectionResult[] };
      return data.results;
    },
  };
}
