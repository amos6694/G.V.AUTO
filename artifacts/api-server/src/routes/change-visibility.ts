import { Router, type IRouter } from "express";
import { Client, PrivateKey, TopicMessageSubmitTransaction } from "@hashgraph/sdk";
import { getRegistryTopicId } from "../lib/hedera-registry";

const router: IRouter = Router();

function parsePrivateKey(raw: string): PrivateKey {
  const stripped = raw.startsWith("0x") ? raw.slice(2) : raw;
  const isDer = stripped.startsWith("3020") || stripped.startsWith("3030");
  const formats: Array<() => PrivateKey> = isDer
    ? [() => PrivateKey.fromStringDer(stripped), () => PrivateKey.fromStringDer(raw)]
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

/**
 * POST /api/fingerprint/change-visibility
 * Writes a visibility-update message to the registry topic for an existing record.
 * The most-recent message for a given sha256 is the effective state.
 */
router.post("/fingerprint/change-visibility", async (req, res): Promise<void> => {
  const { hash, newVisibility } = req.body as {
    hash?: string;
    newVisibility?: string;
  };

  if (!hash || typeof hash !== "string" || !/^[0-9a-f]{64}$/.test(hash)) {
    res.status(400).json({ error: "Invalid or missing hash." });
    return;
  }
  if (!newVisibility || !["private", "semi-public", "public"].includes(newVisibility)) {
    res.status(400).json({ error: "newVisibility must be one of: private, semi-public, public." });
    return;
  }

  const visibility = newVisibility as "private" | "semi-public" | "public";
  const ownerAccountId = process.env.HEDERA_ACCOUNT_ID ?? "unknown";

  let topicId: string;
  try {
    topicId = getRegistryTopicId();
  } catch (err) {
    res.status(503).json({ error: "Registry topic not configured." });
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
    const updatedAt = new Date().toISOString();
    const payload = JSON.stringify({
      sha256: hash,
      type: "visibility-update",
      visibility,
      ownerAccountId,
      registeredAt: updatedAt,
    });

    const msgTx = await new TopicMessageSubmitTransaction()
      .setTopicId(topicId)
      .setMessage(payload)
      .execute(client);

    await msgTx.getReceipt(client);
    const transactionId = msgTx.transactionId.toString();

    req.log.info(
      { transactionId, hash: hash.slice(0, 16), visibility },
      "Visibility updated on Hedera testnet"
    );

    res.json({
      transactionId,
      topicId,
      network: "testnet",
      explorerUrl: `https://hashscan.io/testnet/topic/${topicId}`,
      hash,
      newVisibility: visibility,
      updatedAt,
    });
  } catch (err) {
    req.log.error({ err }, "Hedera visibility-update transaction failed");
    res.status(502).json({ error: "Failed to update visibility on Hedera." });
  } finally {
    client!.close();
  }
});

export default router;
