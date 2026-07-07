# Technical Handover — File Fingerprint

> Generated: 2026-07-07

---

## 1. API Endpoints

All endpoints are served by the Express API server and are proxied through the shared reverse proxy at the `/api` path prefix. The base URL in production is `https://<domain>/api/...`.

### `GET /api/healthz`

**Purpose:** Liveness check for the API server.

**Request:** No parameters.

**Response `200`:**
```json
{ "status": "ok" }
```

---

### `POST /api/fingerprint/register`

**Purpose:** Registers a new file fingerprint on the Hedera Consensus Service (HCS) topic. Blocks re-registration of any hash that already exists in the registry — including private ones — without revealing any details about the existing record.

**Request body (JSON):**
| Field | Type | Required | Description |
|---|---|---|---|
| `hash` | `string` | ✅ | Lowercase 64-char hex SHA-256 digest of the file |
| `filename` | `string` | ✅ | Original filename (stored on-chain, not validated for uniqueness) |
| `fileSize` | `number` | ✅ | File size in bytes |
| `timestamp` | `string` | ✅ | ISO 8601 client-side timestamp of when the hash was computed |
| `visibility` | `"public" \| "semi-public" \| "private"` | ❌ | Defaults to `"public"` if omitted |

**Response `200`:**
```json
{
  "transactionId": "0.0.9053939@1783100000.000000000",
  "topicId": "0.0.9144243",
  "network": "testnet",
  "explorerUrl": "https://hashscan.io/testnet/topic/0.0.9144243",
  "alreadyRegistered": false,
  "ownerAccountId": "0.0.9053939"
}
```

**Response `409`** — hash already exists in registry (no details revealed):
```json
{ "error": "This content already exists in the registry and cannot be registered again." }
```

**Response `400`** — validation failure (missing/invalid field).
**Response `503`** — Hedera credentials or topic not configured.
**Response `502`** — Hedera transaction failed.

---

### `GET /api/fingerprint/exists?hash=<sha256>`

**Purpose:** Boolean-only existence check that scans the **complete** registry including private records. Returns nothing except whether the hash is claimed. Used by the frontend before attempting registration to provide an instant, detail-free "already claimed" notice.

**Query parameter:** `hash` — 64-char hex SHA-256 digest.

**Response `200`:**
```json
{ "exists": true }
```
or
```json
{ "exists": false }
```

**Response `400`** — missing or invalid hash.
**Response `503`** — registry topic not configured.
**Response `502`** — Mirror Node query failed.

---

### `GET /api/fingerprint/verify?hash=<sha256>`

**Purpose:** Public verification endpoint. Looks up the effective record for a hash. Private registrations are treated as not found — the response is indistinguishable from an unregistered hash, preserving privacy.

**Query parameter:** `hash` — 64-char hex SHA-256 digest.

**Response `200` — not found or private:**
```json
{ "verified": false, "hash": "...", "topicId": "0.0.9144243", "network": "testnet" }
```

**Response `200` — found (public or semi-public):**
```json
{
  "verified": true,
  "hash": "...",
  "topicId": "0.0.9144243",
  "network": "testnet",
  "explorerUrl": "https://hashscan.io/testnet/topic/0.0.9144243",
  "filename": "contract-v2.pdf",
  "fileSize": 204800,
  "originalTimestamp": "2026-06-01T12:00:00.000Z",
  "registeredAt": "2026-06-01T12:00:05.123Z",
  "consensusTimestamp": "1748779205.123456789",
  "visibility": "public",
  "ownerAccountId": "0.0.9053939"
}
```

**Response `400`** — invalid hash.
**Response `503`** — registry not configured.
**Response `502`** — Mirror Node query failed.

---

### `GET /api/fingerprint/history?hash=<sha256>`

**Purpose:** Returns the full chronological on-chain event timeline for a fingerprint (original registration + all subsequent visibility updates). Privacy rule: if the current effective visibility is `"private"`, the response is identical to "not found".

**Query parameter:** `hash` — 64-char hex SHA-256 digest.

**Response `200` — not found or private:**
```json
{ "found": false, "hash": "...", "topicId": "0.0.9144243", "events": [] }
```

**Response `200` — found:**
```json
{
  "found": true,
  "hash": "...",
  "topicId": "0.0.9144243",
  "network": "testnet",
  "explorerUrl": "https://hashscan.io/testnet/topic/0.0.9144243",
  "currentVisibility": "semi-public",
  "events": [
    {
      "eventType": "registration",
      "consensusTimestamp": "1748779205.123456789",
      "visibility": "public",
      "ownerAccountId": "0.0.9053939",
      "registeredAt": "2026-06-01T12:00:05.123Z",
      "filename": "contract-v2.pdf",
      "fileSize": 204800
    },
    {
      "eventType": "visibility-update",
      "consensusTimestamp": "1748789205.000000000",
      "visibility": "semi-public",
      "ownerAccountId": "0.0.9053939",
      "registeredAt": "2026-06-01T14:46:45.000Z"
    }
  ]
}
```

---

### `POST /api/fingerprint/change-visibility`

**Purpose:** Writes a `visibility-update` message to the HCS topic for an existing fingerprint. The most-recent message for a given `sha256` is the effective state. No ownership verification is currently enforced server-side (see Known Bugs).

**Request body (JSON):**
| Field | Type | Required | Description |
|---|---|---|---|
| `hash` | `string` | ✅ | 64-char hex SHA-256 digest |
| `newVisibility` | `"public" \| "semi-public" \| "private"` | ✅ | Target visibility |

**Response `200`:**
```json
{
  "transactionId": "0.0.9053939@1783200000.000000000",
  "topicId": "0.0.9144243",
  "network": "testnet",
  "explorerUrl": "https://hashscan.io/testnet/topic/0.0.9144243",
  "hash": "...",
  "newVisibility": "semi-public",
  "updatedAt": "2026-07-07T10:00:00.000Z"
}
```

**Response `400`** — invalid hash or visibility value.
**Response `503`** — Hedera credentials or topic not configured.
**Response `502`** — Hedera transaction failed.

---

### `GET /api/profile/:accountId`

**Purpose:** Returns all non-private (public + semi-public) fingerprint records owned by the specified Hedera account. Private records are completely excluded and do not appear even as count placeholders.

**Path parameter:** `accountId` — Hedera account ID, e.g. `0.0.9053939`.

**Response `200`:**
```json
{
  "accountId": "0.0.9053939",
  "topicId": "0.0.9144243",
  "network": "testnet",
  "explorerUrl": "https://hashscan.io/testnet/topic/0.0.9144243",
  "records": [
    {
      "consensusTimestamp": "1748779205.123456789",
      "sha256": "...",
      "filename": "contract-v2.pdf",
      "fileSize": 204800,
      "registeredAt": "2026-06-01T12:00:05.123Z",
      "visibility": "public",
      "ownerAccountId": "0.0.9053939"
    }
  ]
}
```

---

## 2. Environment Variables & Secrets

| Variable | Required | Description |
|---|---|---|
| `HEDERA_ACCOUNT_ID` | ✅ | Hedera testnet operator account ID (e.g. `0.0.9053939`). Used as the transaction submitter and stamped as `ownerAccountId` on every registered fingerprint. |
| `HEDERA_PRIVATE_KEY` | ✅ | Private key for the operator account. Accepted in DER hex (ECDSA `3030…` prefix or ED25519 `3020…` prefix), raw hex, or `0x`-prefixed hex. The server tries multiple parse strategies automatically. |
| `HEDERA_REGISTRY_TOPIC_ID` | ✅ | HCS Topic ID used as the fingerprint registry (e.g. `0.0.9144243`). All fingerprints are written to and read from this single topic. |
| `SESSION_SECRET` | ✅ | Secret used by Express `cookie-parser` for signed cookies. Must be a long random string in production. |
| `DATABASE_URL` | ⬜ | PostgreSQL connection string for Drizzle ORM. The database schema is currently empty (no tables defined); this variable is wired up but the app does not yet use the database. |
| `PORT` | ⬜ | Port for each service. Injected by the Replit workflow system per artifact. Do not hard-code. |
| `NODE_ENV` | ⬜ | `"development"` or `"production"`. Affects Pino log formatting (pretty-print in dev). |
| `LOG_LEVEL` | ⬜ | Pino log level (`trace`, `debug`, `info`, `warn`, `error`). Defaults to `info`. |

---

## 3. External Services

### Hedera Hashgraph — Testnet (Write path)

- **SDK:** `@hashgraph/sdk` v2.81+
- **What it does:** Submits `TopicMessageSubmitTransaction` to an HCS topic for every registration and visibility change. The topic is append-only and immutable — it is the sole source of truth for all fingerprint records.
- **Credentials:** `HEDERA_ACCOUNT_ID` + `HEDERA_PRIVATE_KEY` (see above).
- **Topic:** `0.0.9144243` on Hedera Testnet (`HEDERA_REGISTRY_TOPIC_ID`).
- **Message format:** JSON encoded to UTF-8, submitted as an HCS message payload:
  ```json
  {
    "sha256": "<64-char hex>",
    "filename": "example.pdf",
    "fileSize": 204800,
    "timestamp": "2026-07-07T10:00:00.000Z",
    "registeredAt": "2026-07-07T10:00:05.000Z",
    "visibility": "public",
    "ownerAccountId": "0.0.9053939",
    "type": "registration"
  }
  ```
  Visibility-update messages omit `filename`/`fileSize` and set `"type": "visibility-update"`.
- **Client lifecycle:** A new `Client` is constructed per request and closed in `finally`. No persistent connection is held.

### Hedera Mirror Node — Testnet (Read path)

- **Base URL:** `https://testnet.mirrornode.hedera.com/api/v1`
- **Authentication:** None required. Public REST API.
- **Endpoint used:** `GET /topics/{topicId}/messages?limit=100&order=asc`
- **How it works:** The server paginates through all messages on the registry topic (following `links.next`) to find all messages matching a given `sha256`. This is used by `findInRegistry`, `findVisibleByOwner`, and `getFullHistory`.
- **Privacy enforcement:** Private records are filtered out at the application layer before any data is returned to callers.

### HashScan (Reference only)

- **URL pattern:** `https://hashscan.io/testnet/topic/<topicId>`
- **Purpose:** External blockchain explorer link included in registration and history responses for user reference. No API calls are made to HashScan; it is a display-only URL.

---

## 4. Working Features

The following features are complete and confirmed working end-to-end:

1. **File hashing** — SHA-256 computed entirely client-side in the browser using `crypto.subtle.digest`. The file never leaves the user's device.

2. **Public registration** — User drops/selects a file, the hash is computed, the registry is checked (exists endpoint), and if unclaimed the user is presented a visibility picker (Public / Semi-Public). On confirm, a Hedera HCS transaction is submitted and a registration certificate is displayed with the transaction ID and HashScan link.

3. **Semi-public registration** — Same flow as public; stored with `visibility: "semi-public"` on-chain. Appears in verify results with the owner's account ID always attached.

4. **Private registration** — Separate collapsed section on the home page. Hashes and registers directly with `visibility: "private"`. The record is blocked from appearing in any public-facing lookup (`verify`, `history`, `profile`). The existence check still detects it to block re-registration.

5. **Duplicate detection (all visibility levels)** — Before any registration (public, semi-public, or private), the frontend calls `GET /api/fingerprint/exists` which scans the full registry including private records. If already claimed, a minimal notice — "This content already exists in the registry and cannot be registered again." — is shown with no further details. The `POST /api/fingerprint/register` endpoint enforces the same rule server-side as a hard guard.

6. **Verification page** — Users can drag-and-drop a file (its hash is computed locally) or paste a SHA-256 hex string directly to look up a fingerprint. Private records are indistinguishable from unregistered hashes.

7. **History timeline** — The verify page displays a chronological timeline of all on-chain events (original registration + visibility changes) for a fingerprint. Hidden for private records.

8. **Profile page** — Browseable at `/profile/:accountId`. Lists all public and semi-public records owned by that account by scanning the registry for matching `ownerAccountId` values. Private records are excluded with no placeholders.

9. **Visibility change** — Owner can change a fingerprint's visibility from the profile page. Authenticated locally via a PIN or WebAuthn/biometric credential (stored in `localStorage`). On confirmation, a `visibility-update` message is written to the HCS topic, making the new visibility the effective state.

10. **Owner detection** — When a user registers a file, their `ownerAccountId` is stored in `localStorage["fp_my_account_id"]`. On the profile page, if the URL account ID matches the stored value, an owner-only "Visibility Settings" panel is revealed.

11. **Copy hash / copy shareable link** — Registration certificate includes one-click copy for the raw SHA-256 hash and a pre-built verify URL.

---

## 5. Known Bugs (Identified, Not Yet Fixed)

### Bug 1 — `change-visibility` has no ownership verification

**Location:** `artifacts/api-server/src/routes/change-visibility.ts`

**Description:** The endpoint accepts any `{ hash, newVisibility }` payload and writes the change to the registry topic without verifying that the caller is the record's original owner. Because all Hedera writes use the single operator key from `HEDERA_ACCOUNT_ID`, any client that can reach the API and knows a valid SHA-256 hash can change that record's visibility — including records they did not register.

**Impact:** High. A malicious or mistaken caller could make a private record public, or suppress a public record by marking it private.

**Fix direction:** Before writing, look up the record with `findInRegistry`, compare `record.message.ownerAccountId` to `process.env.HEDERA_ACCOUNT_ID` (or a session-authenticated user ID), and reject with `403` if they do not match.

---

### Bug 2 — `PrivacyModal.tsx` PIN confirm phase has dead code and a logic defect

**Location:** `artifacts/file-fingerprint/src/components/PrivacyModal.tsx`, lines 99–106 inside `handlePasswordVerify`

**Description:** `handlePasswordVerify` contains an incomplete `if (pinPhase === "confirm")` block that compares `pinValue` with itself (`pinValue !== pinConfirm && pinValue !== pinConfirm`) and then falls through without any action. The actual working PIN flow is handled by the separate `handlePin` function (which is what the button calls). The dead `handlePasswordVerify` function is never invoked but contains misleading code that could confuse future maintainers.

Additionally, the TypeScript compiler flags a type mismatch in the WebAuthn credential ID handling: `b64decode` returns `Uint8Array` but the `allowCredentials[].id` field expects `BufferSource` (`ArrayBuffer | ArrayBufferView`). This currently passes at runtime but produces a TypeScript error.

**Impact:** Medium for the dead code (maintainability / logic confusion); Low for the TypeScript error (runtime behaviour is correct).

**Fix direction:** Delete `handlePasswordVerify` entirely (it is unused). For the WebAuthn type error, replace `b64decode(credId)` with `b64decode(credId).buffer` when constructing `allowCredentials`.

---

### Bug 3 — Mirror Node registry scan is O(n) with no caching

**Location:** `artifacts/api-server/src/lib/hedera-registry.ts` — `findInRegistry`, `findVisibleByOwner`, `getFullHistory`

**Description:** Every API call that reads from the registry (verify, exists, profile, history) paginates through **all** messages on the HCS topic from the beginning, fetching them 100 at a time. As the registry grows the latency of every read operation grows linearly. There is no server-side caching, no offset-by-timestamp optimisation, and no indexed local store.

**Impact:** Medium now (small registry); High at scale. A registry with 10,000 messages would require 100 Mirror Node round-trips per request.

**Fix direction:** Add an in-process LRU or TTL cache keyed by `sha256` (for point lookups) and by `{topicId, lastSequenceNumber}` (to serve repeated scans from a warm offset). Alternatively, maintain a lightweight local write-through index in the PostgreSQL database that is already wired up.

---

## 6. Technology Stack

### Languages
| Language | Version | Usage |
|---|---|---|
| TypeScript | 5.9 | All source code (API server, frontend, libs) |
| JavaScript | ES2022 (Node.js 24) | Compiled output / build scripts |

### Backend
| Package | Version | Purpose |
|---|---|---|
| Node.js | 24 | Runtime |
| Express | 5.2 | HTTP server and routing |
| `@hashgraph/sdk` | 2.81 | Hedera SDK — HCS topic message submission |
| `pino` / `pino-http` | 9 / 10 | Structured JSON logging |
| `cors` | 2.8 | CORS middleware |
| `cookie-parser` | 1.4 | Signed cookie parsing |
| `drizzle-orm` | catalog | ORM (schema defined but not yet used) |
| `esbuild` | 0.27 | Bundler (single CJS-compatible ESM bundle) |

### Frontend
| Package | Version | Purpose |
|---|---|---|
| React | catalog | UI framework |
| Vite | catalog | Dev server and bundler |
| Wouter | 3.3 | Lightweight client-side router |
| TailwindCSS | catalog | Utility-first CSS |
| Radix UI | various | Accessible headless component primitives |
| `@tanstack/react-query` | catalog | Server-state management and API hooks |
| `lucide-react` | catalog | Icon library |
| `framer-motion` | catalog | Animations |
| `date-fns` | 3.6 | Date formatting |
| `zod` | catalog (v4) | Schema validation |
| `react-hook-form` | 7.55 | Form state management |
| `next-themes` | 0.4 | Dark/light theme provider |
| `sonner` | 2.0 | Toast notifications |

### Shared Libraries (pnpm workspace)
| Package | Purpose |
|---|---|
| `@workspace/db` | Drizzle ORM schema definitions and database client |
| `@workspace/api-spec` | OpenAPI spec + Orval codegen configuration |
| `@workspace/api-zod` | Generated Zod schemas from OpenAPI spec |
| `@workspace/api-client-react` | Generated React Query hooks from OpenAPI spec |

### Infrastructure
| Tool | Purpose |
|---|---|
| pnpm workspaces | Monorepo package management |
| Replit reverse proxy | Path-based routing between artifacts (e.g. `/api` → Express, `/` → Vite) |
| Hedera Testnet | Immutable append-only message log (the sole source of truth) |

---

## 7. Database

### Local PostgreSQL (Drizzle ORM)

The database infrastructure is **wired up but not yet used by the application.**

- `@workspace/db` contains the Drizzle client setup and the schema file at `lib/db/src/schema/index.ts`.
- The schema file is currently empty — all exports are commented-out placeholder examples.
- The `DATABASE_URL` environment variable must be set to connect, but no tables are created and no queries are made.
- All application state (fingerprint records, visibility history, owner metadata) is stored exclusively on the Hedera HCS topic.

### Browser `localStorage` (Client-side only)

Two keys are used:

| Key | Value | Purpose |
|---|---|---|
| `fp_my_account_id` | Hedera account ID string (e.g. `"0.0.9053939"`) | Written after a successful registration. Used on the profile page to detect ownership and show the Visibility Settings panel. |
| `fp_owner_pin` | SHA-256 hex hash of the user's chosen PIN | Written when the user first sets a PIN in the PrivacyModal. Used to gate visibility changes behind a local secret. |
| `fp_biometric_cred` | Base64-encoded WebAuthn credential raw ID | Written when the user registers a biometric credential via the PrivacyModal. Used as the `allowCredentials` hint for subsequent WebAuthn assertions. |

> **Note:** `localStorage` is per-browser and per-origin. If a user registers from one browser and visits from another, ownership will not be detected on the second browser and the Visibility Settings panel will not appear.
