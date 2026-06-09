import { logger } from "./logger";

export const MIRROR_BASE = "https://testnet.mirrornode.hedera.com/api/v1";

export interface FingerprintMessage {
  sha256: string;
  filename?: string;
  fileSize?: number;
  timestamp?: string;
  registeredAt: string;
  /**
   * "private"     — hidden from all external lookups.
   * "semi-public" — verifiable; ownerAccountId always shown.
   * "public"      — freely discoverable. Omitted on old records → treated as "public".
   */
  visibility?: "private" | "semi-public" | "public";
  ownerAccountId?: string;
  /** "registration" (default) or "visibility-update" */
  type?: "registration" | "visibility-update";
}

export interface RegistryMatch {
  consensusTimestamp: string;
  message: FingerprintMessage;
}

/**
 * Scan all messages on the registry topic via the public Mirror Node REST API.
 * Returns the EFFECTIVE record for `hash` — the base data from the first
 * registration message merged with the visibility from the most-recent message.
 * Returns null if no record exists.
 */
export async function findInRegistry(
  topicId: string,
  hash: string
): Promise<RegistryMatch | null> {
  const matches: Array<{ consensusTimestamp: string; message: Partial<FingerprintMessage> }> = [];

  let nextUrl: string | null =
    `${MIRROR_BASE}/topics/${topicId}/messages?limit=100&order=asc`;

  while (nextUrl) {
    const res = await fetch(nextUrl);
    if (!res.ok) {
      logger.warn({ status: res.status, url: nextUrl }, "Mirror Node query failed");
      return null;
    }

    const data = await res.json() as {
      messages: Array<{ message: string; consensus_timestamp: string }>;
      links?: { next?: string };
    };

    for (const msg of data.messages) {
      try {
        const decoded = Buffer.from(msg.message, "base64").toString("utf8");
        const parsed = JSON.parse(decoded) as Partial<FingerprintMessage>;
        if (parsed.sha256 === hash) {
          matches.push({ consensusTimestamp: msg.consensus_timestamp, message: parsed });
        }
      } catch { /* malformed — skip */ }
    }

    nextUrl = data.links?.next ? `${MIRROR_BASE}${data.links.next}` : null;
  }

  if (matches.length === 0) return null;

  // Base data from the first registration message (has filename / fileSize)
  const base = matches.find(m => m.message.filename != null)?.message ?? matches[0].message;
  // Current visibility from the most-recent message
  const latest = matches[matches.length - 1];

  return {
    consensusTimestamp: latest.consensusTimestamp,
    message: {
      sha256: base.sha256!,
      filename: base.filename,
      fileSize: base.fileSize,
      timestamp: base.timestamp,
      registeredAt: base.registeredAt!,
      visibility: latest.message.visibility ?? base.visibility,
      ownerAccountId: base.ownerAccountId ?? latest.message.ownerAccountId,
      type: base.type ?? "registration",
    },
  };
}

/**
 * Scan all messages and return every non-private record owned by accountId.
 * Deduplicates by sha256, resolving to the latest visibility state for each hash.
 */
export async function findVisibleByOwner(
  topicId: string,
  accountId: string
): Promise<RegistryMatch[]> {
  type Entry = {
    base: Partial<FingerprintMessage>;
    baseTimestamp: string;
    latestVisibility: "private" | "semi-public" | "public";
    latestTimestamp: string;
  };
  const byHash = new Map<string, Entry>();

  let nextUrl: string | null =
    `${MIRROR_BASE}/topics/${topicId}/messages?limit=100&order=asc`;

  while (nextUrl) {
    const res = await fetch(nextUrl);
    if (!res.ok) {
      logger.warn({ status: res.status, url: nextUrl }, "Mirror Node profile query failed");
      break;
    }

    const data = await res.json() as {
      messages: Array<{ message: string; consensus_timestamp: string }>;
      links?: { next?: string };
    };

    for (const msg of data.messages) {
      try {
        const decoded = Buffer.from(msg.message, "base64").toString("utf8");
        const parsed = JSON.parse(decoded) as Partial<FingerprintMessage>;
        if (parsed.ownerAccountId !== accountId || !parsed.sha256) continue;

        const hash = parsed.sha256;
        const vis = parsed.visibility ?? "public";

        if (!byHash.has(hash)) {
          byHash.set(hash, {
            base: parsed,
            baseTimestamp: msg.consensus_timestamp,
            latestVisibility: vis,
            latestTimestamp: msg.consensus_timestamp,
          });
        } else {
          const entry = byHash.get(hash)!;
          // Keep earliest base data (registration message has filename)
          if (parsed.filename && !entry.base.filename) {
            entry.base = { ...entry.base, ...parsed };
          }
          // Always update to latest visibility
          entry.latestVisibility = vis;
          entry.latestTimestamp = msg.consensus_timestamp;
        }
      } catch { /* malformed — skip */ }
    }

    nextUrl = data.links?.next ? `${MIRROR_BASE}${data.links.next}` : null;
  }

  const results: RegistryMatch[] = [];
  for (const [, entry] of byHash) {
    if (entry.latestVisibility === "private") continue;
    results.push({
      consensusTimestamp: entry.latestTimestamp,
      message: {
        sha256: entry.base.sha256!,
        filename: entry.base.filename,
        fileSize: entry.base.fileSize,
        timestamp: entry.base.timestamp,
        registeredAt: entry.base.registeredAt ?? entry.baseTimestamp,
        visibility: entry.latestVisibility,
        ownerAccountId: entry.base.ownerAccountId,
      },
    });
  }
  return results;
}

export function getRegistryTopicId(): string {
  const id = process.env.HEDERA_REGISTRY_TOPIC_ID;
  if (!id) throw new Error("HEDERA_REGISTRY_TOPIC_ID must be set");
  return id;
}
