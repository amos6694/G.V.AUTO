import { Router, type IRouter } from "express";
import { findInRegistry, getRegistryTopicId } from "../lib/hedera-registry";

const router: IRouter = Router();

router.get("/fingerprint/verify", async (req, res): Promise<void> => {
  const hash = typeof req.query.hash === "string" ? req.query.hash.toLowerCase().trim() : "";

  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) {
    res.status(400).json({ error: "Missing or invalid hash. Provide a 64-char hex SHA-256 digest as ?hash=..." });
    return;
  }

  let topicId: string;
  try {
    topicId = getRegistryTopicId();
  } catch (err) {
    res.status(503).json({ error: "Registry not configured." });
    return;
  }

  try {
    const match = await findInRegistry(topicId, hash);

    if (!match) {
      res.json({ verified: false, hash, topicId, network: "testnet" });
      return;
    }

    res.json({
      verified: true,
      hash,
      topicId,
      network: "testnet",
      explorerUrl: `https://hashscan.io/testnet/topic/${topicId}`,
      filename: match.message.filename,
      fileSize: match.message.fileSize,
      originalTimestamp: match.message.timestamp,
      registeredAt: match.message.registeredAt,
      consensusTimestamp: match.consensusTimestamp,
    });
  } catch (err) {
    req.log.error({ err }, "Verify lookup failed");
    res.status(502).json({ error: "Failed to query Hedera registry." });
  }
});

export default router;
