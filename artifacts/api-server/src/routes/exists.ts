import { Router, type IRouter } from "express";
import { findInRegistry, getRegistryTopicId } from "../lib/hedera-registry";

const router: IRouter = Router();

/**
 * GET /api/fingerprint/exists?hash=<sha256>
 *
 * Checks whether a fingerprint is claimed in the registry — including private
 * registrations. Returns ONLY a boolean. No details about the existing record
 * (owner, visibility, timestamp) are ever exposed.
 */
router.get("/fingerprint/exists", async (req, res): Promise<void> => {
  const hash =
    typeof req.query.hash === "string"
      ? req.query.hash.toLowerCase().trim()
      : "";

  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) {
    res
      .status(400)
      .json({ error: "Missing or invalid hash. Provide a 64-char hex SHA-256 digest as ?hash=..." });
    return;
  }

  let topicId: string;
  try {
    topicId = getRegistryTopicId();
  } catch {
    res.status(503).json({ error: "Registry not configured." });
    return;
  }

  try {
    const match = await findInRegistry(topicId, hash);
    // Reveal nothing but the boolean — no owner, no visibility, no timestamp.
    res.json({ exists: match !== null });
  } catch (err) {
    req.log.error({ err }, "Exists check failed");
    res.status(502).json({ error: "Failed to query Hedera registry." });
  }
});

export default router;
