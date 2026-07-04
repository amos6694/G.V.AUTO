import { Router, type IRouter } from "express";
import { Client, PrivateKey, TopicMessageSubmitTransaction } from "@hashgraph/sdk";
import { findInRegistry, getRegistryTopicId, type FingerprintMessage } from "../lib/hedera-registry";

const router: IRouter = Router();

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

interface RegistrationResult {
  transactionId: string;
  topicId: string;
  network: string;
  explorerUrl: string;
  alreadyRegistered: boolean;
  originalTimestamp?: string;
  ownerAccountId?: string;
}

router.post("/fingerprint/register", async (req, res): Promise<void> => {
  const { hash, filename, fileSize, timestamp, visibility: rawVisibility } = req.body as {
    hash?: string;
    filename?: string;
    fileSize?: number;
    timestamp?: string;
    visibility?: string;
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

  const visibility: "private" | "semi-public" | "public" =
    rawVisibility === "private" ? "private"
    : rawVisibility === "semi-public" ? "semi-public"
    : "public";

  const ownerAccountId = process.env.HEDERA_ACCOUNT_ID ?? "unknown";

  let topicId: string;
  try {
    topicId = getRegistryTopicId();
  } catch (err) {
    req.log.error({ err }, "Registry topic not configured");
    res.status(503).json({ error: "Registry topic not configured." });
    return;
  }

  // Step 1: check if this hash is already on-chain via Mirror Node.
  // ALL registrations block re-registration — including private ones.
  // We reveal nothing about the existing record (no owner, no visibility, no timestamp).
  try {
    const existing = await findInRegistry(topicId, hash);
    if (existing) {
      req.log.info(
        { hash: hash.slice(0, 16) },
        "Duplicate registration attempt blocked"
      );
      res.status(409).json({
        error: "This content already exists in the registry and cannot be registered again.",
      });
      return;
    }
  } catch (err) {
    req.log.warn({ err }, "Mirror Node lookup failed; proceeding with registration");
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
      visibility,
      ownerAccountId,
    } satisfies FingerprintMessage);

    const msgTx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message)
      .execute(client);

    await msgTx.getReceipt(client);
    const transactionId = msgTx.transactionId.toString();

    req.log.info(
      { transactionId, topicId, hash: hash.slice(0, 16), visibility },
      "Fingerprint registered on Hedera testnet"
    );

    const result: RegistrationResult = {
      transactionId,
      topicId,
      network: "testnet",
      explorerUrl: `https://hashscan.io/testnet/topic/${topicId}`,
      alreadyRegistered: false,
      ownerAccountId,
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
