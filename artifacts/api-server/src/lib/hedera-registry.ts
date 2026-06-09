import { logger } from "./logger";

export const MIRROR_BASE = "https://testnet.mirrornode.hedera.com/api/v1";

export interface FingerprintMessage {
  sha256: string;
  filename: string;
  fileSize: number;
  timestamp: string;
  registeredAt: string;
  /** "public" records are returned to anyone who verifies. "private" records are hidden from all external lookups. Defaults to "public" for backward-compatibility. */
  visibility?: "public" | "private";
}

export interface RegistryMatch {
  consensusTimestamp: string;
  message: FingerprintMessage;
}

/**
 * Scan all messages on the registry topic via the public Mirror Node REST API.
 * Returns the first message whose sha256 field matches the given hash.
 * No Hedera credentials required — Mirror Node is fully public.
 */
export async function findInRegistry(
  topicId: string,
  hash: string
): Promise<RegistryMatch | null> {
  let nextUrl: string | null =
    `${MIRROR_BASE}/topics/${topicId}/messages?limit=100&order=asc`;

  while (nextUrl) {
    const res = await fetch(nextUrl);
    if (!res.ok) {
      logger.warn({ status: res.status, url: nextUrl }, "Mirror Node query failed");
      return null;
    }

    const data = await res.json() as {
      messages: Array<{
        message: string;
        consensus_timestamp: string;
      }>;
      links?: { next?: string };
    };

    for (const msg of data.messages) {
      try {
        const decoded = Buffer.from(msg.message, "base64").toString("utf8");
        const parsed = JSON.parse(decoded) as Partial<FingerprintMessage>;
        if (parsed.sha256 === hash) {
          return {
            consensusTimestamp: msg.consensus_timestamp,
            message: parsed as FingerprintMessage,
          };
        }
      } catch {
        // malformed message — skip
      }
    }

    nextUrl = data.links?.next ? `${MIRROR_BASE}${data.links.next}` : null;
  }

  return null;
}

export function getRegistryTopicId(): string {
  const id = process.env.HEDERA_REGISTRY_TOPIC_ID;
  if (!id) throw new Error("HEDERA_REGISTRY_TOPIC_ID must be set");
  return id;
}
