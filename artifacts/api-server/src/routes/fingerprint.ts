import { Router, type IRouter } from "express";
import { Client, PrivateKey, TopicCreateTransaction, TopicMessageSubmitTransaction } from "@hashgraph/sdk";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function parsePrivateKey(raw: string): PrivateKey {
  // Strip optional 0x prefix
  const stripped = raw.startsWith("0x") ? raw.slice(2) : raw;

  // DER-encoded keys start with known ASN.1 prefixes:
  //   3020... = ED25519 DER
  //   3030... = ECDSA secp256k1 DER
  const isDer = stripped.startsWith("3020") || stripped.startsWith("3030");

  const formats: Array<[string, () => PrivateKey]> = isDer
    ? [
        ["fromStringDer(stripped)", () => PrivateKey.fromStringDer(stripped)],
        ["fromStringDer(raw)", () => PrivateKey.fromStringDer(raw)],
      ]
    : [
        ["fromStringED25519(stripped)", () => PrivateKey.fromStringED25519(stripped)],
        ["fromStringECDSA(stripped)", () => PrivateKey.fromStringECDSA(stripped)],
        ["fromStringED25519(raw)", () => PrivateKey.fromStringED25519(raw)],
        ["fromStringECDSA(raw)", () => PrivateKey.fromStringECDSA(raw)],
      ];

  for (const [name, attempt] of formats) {
    try {
      return attempt();
    } catch {
      // try next format
    }
  }
  throw new Error("Could not parse HEDERA_PRIVATE_KEY — check the key format.");
}

function getHederaClient(): Client {
  const accountId = process.env.HEDERA_ACCOUNT_ID;
  const privateKey = process.env.HEDERA_PRIVATE_KEY;
  if (!accountId || !privateKey) {
    throw new Error("HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY must be set");
  }
  const client = Client.forTestnet();
  client.setOperator(accountId, parsePrivateKey(privateKey));
  return client;
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

  let client: Client;
  try {
    client = getHederaClient();
  } catch (err) {
    req.log.error({ err }, "Hedera client init failed");
    res.status(503).json({ error: "Hedera credentials not configured." });
    return;
  }

  try {
    // Create a new topic for this fingerprint record
    const topicTx = await new TopicCreateTransaction()
      .setTopicMemo(`file-fingerprint:${hash.slice(0, 16)}`)
      .execute(client);

    const topicReceipt = await topicTx.getReceipt(client);
    const topicId = topicReceipt.topicId!.toString();

    req.log.info({ topicId, hash: hash.slice(0, 16) }, "Hedera topic created");

    // Submit the fingerprint record as a message on the topic
    const message = JSON.stringify({
      sha256: hash,
      filename,
      fileSize,
      timestamp,
      registeredAt: new Date().toISOString(),
    });

    const msgTx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(message)
      .execute(client);

    const msgReceipt = await msgTx.getReceipt(client);
    const transactionId = msgTx.transactionId.toString();

    req.log.info({ transactionId, topicId }, "Fingerprint registered on Hedera testnet");

    res.json({
      transactionId,
      topicId,
      network: "testnet",
      explorerUrl: `https://hashscan.io/testnet/topic/${topicId}`,
    });
  } catch (err) {
    req.log.error({ err }, "Hedera transaction failed");
    res.status(502).json({ error: "Failed to register fingerprint on Hedera. Check server logs." });
  } finally {
    client.close();
  }
});

export default router;
