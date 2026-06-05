import { Client, PrivateKey, TopicCreateTransaction } from "@hashgraph/sdk";

const accountId = process.env.HEDERA_ACCOUNT_ID;
const rawKey = process.env.HEDERA_PRIVATE_KEY;

if (!accountId || !rawKey) {
  console.error("HEDERA_ACCOUNT_ID and HEDERA_PRIVATE_KEY must be set");
  process.exit(1);
}

function parsePrivateKey(raw) {
  const stripped = raw.startsWith("0x") ? raw.slice(2) : raw;
  const isDer = stripped.startsWith("3020") || stripped.startsWith("3030");
  if (isDer) return PrivateKey.fromStringDer(stripped);
  try { return PrivateKey.fromStringED25519(stripped); } catch {}
  try { return PrivateKey.fromStringECDSA(stripped); } catch {}
  throw new Error("Cannot parse private key");
}

const client = Client.forTestnet();
client.setOperator(accountId, parsePrivateKey(rawKey));

const tx = await new TopicCreateTransaction()
  .setTopicMemo("file-fingerprint-registry-v1")
  .execute(client);

const receipt = await tx.getReceipt(client);
const topicId = receipt.topicId.toString();

client.close();

// Print ONLY the topic ID so we can capture it cleanly
console.log(topicId);
