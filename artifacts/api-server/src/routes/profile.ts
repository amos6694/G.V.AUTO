import { Router, type IRouter } from "express";
import { findVisibleByOwner, getRegistryTopicId } from "../lib/hedera-registry";

const router: IRouter = Router();

/**
 * GET /api/profile/:accountId
 * Returns all non-private (public + semi-public) fingerprint records owned by accountId.
 * Private records are completely excluded — they do not appear even as placeholders.
 */
router.get("/profile/:accountId", async (req, res): Promise<void> => {
  const { accountId } = req.params;

  if (!accountId || typeof accountId !== "string") {
    res.status(400).json({ error: "Missing accountId." });
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
    const records = await findVisibleByOwner(topicId, accountId);

    res.json({
      accountId,
      topicId,
      network: "testnet",
      explorerUrl: `https://hashscan.io/testnet/topic/${topicId}`,
      records: records.map((r) => ({
        consensusTimestamp: r.consensusTimestamp,
        sha256: r.message.sha256,
        filename: r.message.filename,
        fileSize: r.message.fileSize,
        registeredAt: r.message.registeredAt ?? r.message.timestamp,
        visibility: r.message.visibility ?? "public",
        ownerAccountId: r.message.ownerAccountId,
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Profile lookup failed");
    res.status(502).json({ error: "Failed to query Hedera registry." });
  }
});

export default router;
