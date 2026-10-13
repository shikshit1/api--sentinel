# API Sentinel — Automated API Testing & Regression Analysis Platform

API Sentinel is an automated API testing and regression detection engine designed to ingest OpenAPI specifications, generate deterministic test vectors, execute tests against authorized targets with strict SSRF defenses, and identify breaking changes across releases.

---

## Status

- [x] **Phase 1: Foundation & OpenAPI Ingestion**
  - Monorepo architecture (`shared`, `server`, `client`) with strict TypeScript configurations.
  - Explicit storage mode guard (`STORAGE_MODE=demo` or `STORAGE_MODE=mongodb`) with fail-fast startup behavior.
  - OpenAPI 3.0.x and 3.1.x parser dereferencing schema components via `@apidevtools/swagger-parser`.
  - `POST /api/specs/parse` endpoint with Zod validation.
  - Interactive React UI for uploading, pasting, and inspecting specs.
- [x] **Phase 2: Deterministic Test Generation & Safe HTTP Execution Engine**
  - Deterministic test generator producing positive, negative (missing required fields, invalid types, enum violations, boundary violations), and response JSON schema contract test cases.
  - Documented vs inferred response expectations (no invented status codes).
  - Defense-in-depth SSRF protection (connection-level DNS rebinding defense, private/loopback/cloud metadata IP blocking, disabled redirects, timeouts, byte caps, redaction).
  - Local isolated Mock API server for deterministic verification.
- [x] **Phase 3: Regression Diffing Engine & Rules-Based Failure Classifier**
  - Deterministic, zero-cost regression analysis comparing baseline and current `TestRunReport` snapshots.
  - Test matching by stable `testCaseId` or canonical composite key (`method:url:type:category`).
  - Detection of duplicates as `INDETERMINATE` to prevent silent misattribution.
  - Classification of state transitions: `REGRESSION`, `FIXED`, `UNCHANGED_PASS`, `UNCHANGED_FAIL`, `ADDED`, `REMOVED`, `INDETERMINATE`.
  - Orthogonal detection of status code changes, schema contract deviations, and latency degradation (configurable threshold).
  - Deterministic rules-based failure classifier with strict precedence (SSRF block, timeout, size limit, schema violation, status code mismatch, network error, unknown failure).
  - REST API endpoint: `POST /api/regressions/compare` with Zod validation.
  - Automated unit and integration test suite (89 tests passing).

---

## Quick Start (Local Demo Mode)

### Prerequisites
- Node.js >= 20.0.0
- npm >= 10.0.0

### 1. Installation
```bash
npm install
```

### 2. Configure Environment
A default `.env` is pre-configured in `server/.env` with `STORAGE_MODE=demo`.
```env
STORAGE_MODE=demo
PORT=4000
```
> **Note on Storage Modes**:
> - `STORAGE_MODE=demo`: Runs immediately with in-memory storage (zero database setup required).
> - `STORAGE_MODE=mongodb`: Requires `MONGODB_URI`. If the database cannot be reached, the server **fails fast** on startup with an explicit fatal error.

### 3. Build & Typecheck
```bash
npm run build
npm run typecheck
```

### 4. Run Automated Test Suite
```bash
npm test
```

### 5. Start Development Servers
```bash
npm run dev
```
- **Frontend**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://localhost:4000](http://localhost:4000)
- **Health check**: [http://localhost:4000/api/health](http://localhost:4000/api/health)

---

## API Endpoints

### `GET /api/health`
Returns server status and active storage mode.

### `POST /api/specs/parse`
Parses and normalizes an OpenAPI specification into endpoints, parameters, and schemas.

### `POST /api/tests/generate`
Generates a deterministic test suite from an OpenAPI spec.

### `POST /api/tests/execute`
Executes test cases against an authorized remote target URL with connection-level SSRF defense, timeouts, and byte limits.

### `POST /api/regressions/compare`
Compares a baseline `TestRunReport` with a current `TestRunReport` and generates a regression analysis.
- **Request Body**:
  ```json
  {
    "baselineRun": { "results": [...] },
    "currentRun": { "results": [...] },
    "latencyThresholdMs": 200
  }
  ```
- **Response (200)**:
  ```json
  {
    "success": true,
    "data": {
      "summary": {
        "totalCompared": 5,
        "regressions": 1,
        "fixed": 1,
        "unchangedPass": 2,
        "unchangedFail": 0,
        "added": 1,
        "removed": 0,
        "indeterminate": 0,
        "latencyDegradations": 1
      },
      "comparisons": [...]
    }
  }
  ```

---

## SSRF Defense Architecture & Security Limitations

### Implemented Protections
1. **Connection-level DNS Rebinding Defense**: Inspects resolved IP addresses within the socket creation lookup and verifies `socket.remoteAddress` at connection establishment, destroying sockets before request payload transmission if bound to a forbidden IP.
2. **IP Range Restrictions**: Rejects loopback (`127.0.0.0/8`, `::1`), private networks (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`), cloud metadata (`169.254.169.254`), multicast (`224.0.0.0/4`), broadcast, and carrier-grade NAT (`100.64.0.0/10`).
3. **Strict Protocol Whitelist**: Allows only `http:` and `https:`.
4. **No Redirects**: Automatic HTTP redirects are disabled.
5. **Payload Redaction**: Sensitive headers (`Authorization`, `Cookie`, `X-Api-Key`, etc.) and payload secrets are redacted to `[REDACTED]` prior to test recording.
6. **No Code Execution**: No `eval` or dynamic code execution occurs from imported specifications.
7. **Stateless Regression Comparison**: The regression diff engine processes provided report data in-memory without making outbound network requests.
