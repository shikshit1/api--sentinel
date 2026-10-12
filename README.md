# API Sentinel — Automated API Testing & Regression Analysis Platform

API Sentinel is an automated API testing and regression detection engine designed to ingest OpenAPI specifications, generate deterministic test vectors, execute tests against authorized targets with strict SSRF defenses, and identify breaking changes across releases.

---

## Current Status: Phase 1 (Week 1 Vertical Slice)

- [x] **Monorepo Architecture**: Setup with npm workspaces (`shared`, `server`, `client`) and strict TypeScript configurations.
- [x] **Storage Mode Guard**: Explicit configuration via `STORAGE_MODE=demo` or `STORAGE_MODE=mongodb`. Fail-fast startup if MongoDB is unreachable when configured.
- [x] **OpenAPI Parser & Dereferencer**: Parses OpenAPI 3.0.x and 3.1.x specifications (JSON & YAML), validates schemas with `@apidevtools/swagger-parser`, and normalizes operations.
- [x] **REST API**: `POST /api/specs/parse` with Zod schema validation and structured error responses.
- [x] **Interactive UI**: Minimal React + Vite + Tailwind frontend supporting spec upload, live pasting, 1-click sample spec loading, and expandable operation inspectors.
- [x] **Automated Tests**: Unit tests for parser and storage guards, Supertest integration tests for REST routes.

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

### 4. Run Automated Tests
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

## Phase 1 API Endpoints

### `GET /api/health`
Returns server status and active storage mode.
```json
{
  "status": "ok",
  "service": "api-sentinel",
  "storage": {
    "mode": "demo",
    "isDemo": true
  }
}
```

### `POST /api/specs/parse`
Parses and normalizes an OpenAPI specification.
- **Request Body**:
  ```json
  {
    "specContent": "openapi: 3.0.3\n...",
    "sourceFormat": "auto"
  }
  ```
- **Success Response (200)**:
  ```json
  {
    "success": true,
    "data": {
      "title": "Task Management API",
      "version": "1.0.0",
      "openapiVersion": "3.0.3",
      "servers": ["https://api.example.com/v1"],
      "operationCount": 3,
      "operations": [...]
    }
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Payload validation or YAML/JSON syntax errors (`VALIDATION_ERROR`, `INVALID_SYNTAX`, `EMPTY_SPEC_CONTENT`).
  - `422 Unprocessable Entity`: OpenAPI schema violations (`SPEC_VALIDATION_ERROR`).

---

## Next Milestone (Phase 2 / Week 2)
- Deterministic positive and negative test generator.
- Connection-level SSRF defense (DNS rebinding mitigations, IP address range filtering, redirect blocking).
- Dedicated security test suite.
