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
  - Defense-in-depth SSRF protection:
    - Preflight DNS checks.
    - Connection-level DNS rebinding and TOCTOU defense on custom HTTP/HTTPS agents.
    - Blocking of loopback (`127.0.0.0/8`, `::1`), private (RFC 1918), link-local (`169.254.0.0/16`), cloud metadata (`169.254.169.254`), multicast, and carrier-grade NAT.
    - Redirects disabled by default.
    - Strict per-request timeouts (5000ms) and response byte capping (1MB cutoff).
    - Concurrency worker pool limits.
    - Credential and authorization header redaction in recorded test runs.
  - Local isolated Mock API server for deterministic verification.
  - Automated unit and integration test suite (60 tests passing).

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
- **Request Body**:
  ```json
  {
    "specContent": "openapi: 3.0.3\n..."
  }
  ```

### `POST /api/tests/execute`
Executes test cases against an authorized remote target URL with connection-level SSRF defense, timeouts, and byte limits.
- **Request Body**:
  ```json
  {
    "targetBaseUrl": "https://api.example.com",
    "testCases": [...],
    "concurrencyLimit": 3,
    "timeoutMs": 5000
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

### Unresolved Security Limitations
1. **Target Authorization Scope**: When running via the standalone `POST /api/tests/execute` API without project database persistence, authorization defaults to verifying that the target URL is a valid remote public HTTP/HTTPS target. User/project ownership binding will be integrated in Phase 4.
2. **Reverse Proxy / Upstream DNS Caching**: While socket-level verification protects the Node.js application process, environments behind transparent forward proxies or corporate HTTP gateways must also enforce network-level egress firewalls.
