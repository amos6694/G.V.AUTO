import { Router, type IRouter } from "express";
import { Client, PrivateKey, TopicMessageSubmitTransaction } from "@hashgraph/sdk";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const MIRROR_BASE = "https://testnet.mirrornode.hedera.com/api/v1";

function parsePrivateKey(raw: string): PrivateKey {
  const stripped = raw.startsWith("0x") ? raw.slice(2) : raw;
  const isDer = stripped.startsWith("3020") || stripped.startsWith("3030");
  const formats: Array<() => PrivateKey> = isDer
    ? [
        () => PrivateKey.fromStringDer(stripped),
        () => PrivateKey.fromStringDer(raw),
      ]
    : [
        () => PrivateKey.fromStringED25519(stripped),
        () => PrivateKey.fromStringECDSA(stripped),
        () => PrivateKey.fromStringED25519(raw),
        () => PrivateKey.fromStringECDSA(raw),
      ];
  for (const attempt of formats) {
    try { return attempt(); } catch { /* try next */ }
  }
  throw new Error("Could not parse HEDERA_PRIVATE_KEY.");
}

function getHederaClient(): Client {
  const accountId = process.env.HEDERA_ACCOUNT_ID;
  const privateKey = process.env.HEDERA_PRIVATE_KEY;
  if (!accountId || !privateKey) throw new Error("HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY must be set");
  const client = Client.forTestnet();
  client.setOperator(accountId, parsePrivateKey(privateKey));
  return client;
}

function getRegistryTopicId(): string {
  const id = process.env.HEDERA_REGISTRY_TOPIC_ID;
  if (!id) throw new Error("HEDERA_REGISTRY_TOPIC_ID must be set");
  return id;
}

interface FingerprintMessage {
  sha256: string;
  filename: string;
  fileSize: number;
  timestamp: string;
  registeredAt: string;
}

interface RegistrationResult {
  transactionId: string;
  topicId: string;
  network: string;
  explorerUrl: string;
  alreadyRegistered: boolean;
  originalTimestamp?: string;
}

/**
 * Query the Hedera Mirror Node to find an existing registration for a given SHA-256 hash.
 * Scans all messages on the registry topic and returns the first match.
 */
async function findExistingRegistration(
  topicId: string,
  hash: string
): Promise<{ transactionId: string; message: FingerprintMessage } | null> {
  let nextUrl: string | null =
    `${MIRROR_BASE}/topics/${topicId}/messages?limit=100&order=asc`;

  while (nextUrl) {
    const res = await fetch(nextUrl);
    if (!res.ok) {
      logger.warn({ status: res.status, url: nextUrl }, "Mirror Node query failed");
      return null;
    }

    const data = await res.json() as {
      messages: Array<{ message: string; consensus_timestamp: string; chunk_info?: unknown }>;
      links?: { next?: string };
    };

    for (const msg of data.messages) {
      try {
        const decoded = Buffer.from(msg.message, "base64").toString("utf8");
        const parsed = JSON.parse(decoded) as Partial<FingerprintMessage>;
        if (parsed.sha256 === hash) {
          // Reconstruct a transaction ID from the consensus timestamp
          const tsNs = msg.consensus_timestamp; // e.g. "1234567890.123456789"
          return {
            transactionId: `registry-topic:${topicId}@${tsNs}`,
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

router.post("/fingerprint/register", async (req, res): Promise<void> => {
  const { hash, filename, fileSize, timestamp } = req.body as {
    hash?: string;
    filename?: string;
    fileSize?: number;
    timestamp?: string;
  };

  if (!hash || typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) {
    res.status(400).json({ error: "Invalid or missing hash. Expected a 64-char hex SHA-256 digest." });
    return;
  }
  if (!filename || typeof filename !== "string") {
    res.status(400).json({ error: "Missing filename." });
    return;
  }
  if (fileSize == null || typeof fileSize !== "number") {
    res.status(400).json({ error: "Missing fileSize." });
    return;
  }
  if (!timestamp || typeof timestamp !== "string") {
    res.status(400).json({ error: "Missing timestamp." });
    return;
  }

  let topicId: string;
  try {
    topicId = getRegistryTopicId();
  } catch (err) {
    req.log.error({ err }, "Registry topic not configured");
    res.status(503).json({ error: "Registry topic not configured." });
    return;
  }

  // Step 1: check if this hash is already on-chain
  let existing: { transactionId: string; message: FingerprintMessage } | null = null;
  try {
    existing = await findExistingRegistration(topicId, hash);
  } catch (err) {
    req.log.warn({ err }, "Mirror Node lookup failed; proceeding with registration");
  }

  if (existing) {
    req.log.info({ hash: hash.slice(0, 16) }, "Fingerprint already registered — returning existing record");
    const result: RegistrationResult = {
      transactionId: existing.transactionId,
      topicId,
      network: "testnet",
      explorerUrl: `https://hashscan.io/testnet/topic/${topicId}`,
      alreadyRegistered: true,
      originalTimestamp: existing.message.registeredAt ?? existing.message.timestamp,
    };
    res.json(result);
    return;
  }

  // Step 2: new fingerprint — write to registry topic
  let client: Client;
  try {
    client = getHederaClient();
  } catch (err) {
    req.log.error({ err }, "Hedera client init failed");
    res.status(503).json({ error: "Hedera credentials not configured." });
    return;
  }

  try {
    const registeredAt = new Date().toISOString();
    const message = JSON.stringify({
      sha256: hash,
      filename,
      fileSize,
      timestamp,
      registeredAt,
    } satisfies FingerprintMessage);

    const msgTx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message)
      .execute(client);

    await msgTx.getReceipt(client);
    const transactionId = msgTx.transactionId.toString();

    req.log.info({ transactionId, topicId, hash: hash.slice(0, 16) }, "Fingerprint registered on Hedera testnet");

    const result: RegistrationResult = {
      transactionId,
      topicId,
      network: "testnet",
      explorerUrl: `https://hashscan.io/testnet/topic/${topicId}`,
      alreadyRegistered: false,
    };
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Hedera transaction failed");
    res.status(502).json({ error: "Failed to register fingerprint on Hedera. Check server logs." });
  } finally {
    client!.close();
  }
});

export default router;
