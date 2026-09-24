// Unit tests for v1/v2 protocol detection and path mapping.
// Run: node --test src/lib/server-protocol.test.ts  (needs Node >= 22 for
// .ts support; the repo's `npm test` assumes that)
import { test, before, after } from "node:test"
import assert from "node:assert/strict"
import http from "node:http"
import { createMockOpencodeServer } from "../../tests/fixtures/mock-opencode-server.ts"
import {
  apiPath,
  detectServerProtocol,
  probeHealthPath,
  V1_HEALTH_PATH,
  V2_HEALTH_PATH,
} from "./server-protocol.ts"

const fetchFn = fetch

test("apiPath: v1 is identity", () => {
  assert.equal(apiPath("v1", "/global/health"), "/global/health")
  assert.equal(apiPath("v1", "/session/abc/message?limit=20"), "/session/abc/message?limit=20")
  assert.equal(apiPath("v1", "/global/event"), "/global/event")
})

test("apiPath: v2 prefixes resources and renames globals", () => {
  assert.equal(apiPath("v2", "/global/health"), "/api/health")
  assert.equal(apiPath("v2", "/global/event"), "/api/event")
  assert.equal(apiPath("v2", "/session"), "/api/session")
  assert.equal(apiPath("v2", "/session/abc/message?limit=20"), "/api/session/abc/message?limit=20")
  assert.equal(apiPath("v2", "/project/current"), "/api/project/current")
  assert.equal(apiPath("v2", "/pty/x/connect-token"), "/api/pty/x/connect-token")
  assert.equal(apiPath("v2", "/experimental/session"), "/api/experimental/session")
  // Already-prefixed paths pass through untouched (no /api/api/...).
  assert.equal(apiPath("v2", "/api/session"), "/api/session")
  assert.equal(apiPath("v2", "/api/health"), "/api/health")
})

const PORT_V1 = 45111
const PORT_V2 = 45112
const PORT_BOTH = 45113
const PORT_AUTH = 45114
let v1: ReturnType<typeof createMockOpencodeServer>
let v2: ReturnType<typeof createMockOpencodeServer>
let both: ReturnType<typeof createMockOpencodeServer>
let authFail: ReturnType<typeof createMockOpencodeServer>

before(async () => {
  v1 = createMockOpencodeServer({ port: PORT_V1 })
  v2 = createMockOpencodeServer({ port: PORT_V2, protocol: "v2" })
  both = createMockOpencodeServer({ port: PORT_BOTH, protocol: "both" })
  authFail = createMockOpencodeServer({ port: PORT_AUTH, failAuth: true })
  await Promise.all([v1.listen(), v2.listen(), both.listen(), authFail.listen()])
})

after(async () => {
  await Promise.all([v1.close(), v2.close(), both.close(), authFail.close()])
})

test("detect: v1 mock -> v1", async () => {
  const found = await detectServerProtocol(v1.url, undefined, fetchFn, 5000)
  assert.equal(found.protocol, "v1")
  assert.equal(found.version, "0.0.0-mock")
})

test("detect: v2 mock -> v2 (v1 path serves HTML, must not win)", async () => {
  // The v2 mock answers /global/health with 200 + HTML: detection must look
  // past it to /api/health instead of failing with a parse error.
  const raw = await probeHealthPath(v2.url, "/global/health", undefined, fetchFn, 5000)
  assert.equal(raw.ok, false)
  assert.equal(raw.htmlResponse, true)
  const found = await detectServerProtocol(v2.url, undefined, fetchFn, 5000)
  assert.equal(found.protocol, "v2")
  assert.equal(found.version, "0.0.0-mock-v2")
})

test("detect: both mock -> v1 (legacy shape wins, like upstream)", async () => {
  const found = await detectServerProtocol(both.url, undefined, fetchFn, 5000)
  assert.equal(found.protocol, "v1")
})

test("detect: auth failure surfaces 401, not a parse error", async () => {
  await assert.rejects(detectServerProtocol(authFail.url, undefined, fetchFn, 5000), /401/)
})

test("detect: unreachable host rejects with a transport error", async () => {
  await assert.rejects(detectServerProtocol("http://127.0.0.1:1", undefined, fetchFn, 1000))
})

test("detect: pure web UI (HTML everywhere) explains itself", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" })
    res.end("<!doctype html><html><body>not opencode</body></html>")
  })
  await new Promise<void>((resolve) => server.listen(45115, "127.0.0.1", () => resolve()))
  try {
    await assert.rejects(
      detectServerProtocol("http://127.0.0.1:45115", undefined, fetchFn, 5000),
      /web page \(HTML\)/,
    )
  } finally {
    await new Promise((resolve) => server.close(() => resolve()))
  }
})

test("health path constants", () => {
  assert.equal(V1_HEALTH_PATH, "/global/health")
  assert.equal(V2_HEALTH_PATH, "/api/health")
})
