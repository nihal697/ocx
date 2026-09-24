// Opencode server protocol detection (v1 vs v2) + version-aware path mapping.
//
// Background: opencode v1 serves its API at the URL root — health is
// GET /global/health and every resource lives at /<resource> (e.g.
// /session, /project, /global/event). Opencode v2 moved the whole API
// under an /api prefix — health is GET /api/health and resources live at
// /api/<resource> (e.g. /api/session); the old /global/* routes on a v2
// server fall through to the web UI and return 200 text/html.
//
// That last detail is the entire reason this module exists: probing only
// /global/health against a v2 server gets HTTP 200 with an HTML body, and
// a blind response.json() throws "Unexpected character: <" — reported as
// "connection failed" even though the server is fine. So the client must
// probe BOTH shapes, parse defensively, and then talk to the server in
// whatever dialect it actually speaks.
//
// Pure module on purpose (no expo / react-native imports — same pattern as
// diagnostics-classify.ts / api-error.ts) so it stays unit-testable under
// plain `node --test`. The only runtime dependency is an injectable fetch;
// production passes the global fetch, tests pass fakes or hit the mock
// server (tests/fixtures/mock-opencode-server.ts --protocol v1|v2|both).
import { apiErrorFor } from "./api-error"

export type ServerProtocol = "v1" | "v2"

// Canonical health paths per protocol. Probe order matters: late v1 servers
// (>= 1.18.x) answer /api/health too, but old v1 servers have no /api/*
// routes at all — so the v1 shape is probed FIRST to avoid misclassifying
// an old v1 server as v2.
export const V1_HEALTH_PATH = "/global/health"
export const V2_HEALTH_PATH = "/api/health"

export interface HealthProbe {
  /** Request path that was probed (e.g. "/global/health"). */
  path: string
  /** True only for 2xx + valid JSON body with healthy === true. */
  ok: boolean
  httpStatus?: number
  /** Server version when the body carried one. */
  version?: string
  /** True when the server answered 2xx with an HTML page (web UI fallback). */
  htmlResponse?: boolean
  /** Human-readable failure reason (network error, status, parse failure…). */
  error?: string
}

export interface DetectedProtocol {
  protocol: ServerProtocol
  version?: string
}

// A body counts as the opencode health shape when it parses as JSON with
// healthy === true. `version`/`pid` extras (v2 sends pid) are tolerated.
function asHealthyBody(value: unknown): { healthy: boolean; version?: string } | null {
  if (typeof value !== "object" || value === null) return null
  const healthy = (value as Record<string, unknown>).healthy
  if (healthy !== true) return null
  const version = (value as Record<string, unknown>).version
  return { healthy: true, version: typeof version === "string" ? version : undefined }
}

function isHtmlText(text: string): boolean {
  return /^\s*</.test(text)
}

export type FetchFn = (url: string, init?: RequestInit) => Promise<Response>

async function fetchWithTimeout(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetchFn(url, { ...init, signal: controller.signal })
  } catch (error) {
    const err = error as { name?: string; message?: string }
    if (err?.name === "AbortError") throw new Error(`Request timed out after ${timeoutMs}ms`)
    throw error
  } finally {
    clearTimeout(timer)
  }
}

// Probe one health path and classify the outcome WITHOUT throwing on
// transport/parse failures — callers (detection, diagnostics) need the
// structured result to decide what to try next / what to report.
export async function probeHealthPath(
  baseUrl: string,
  path: "/global/health" | "/api/health",
  headers: Record<string, string> | undefined,
  fetchFn: FetchFn,
  timeoutMs: number,
): Promise<HealthProbe> {
  const url = `${baseUrl}${path}`
  let res: Response
  try {
    res = await fetchWithTimeout(fetchFn, url, headers ? { headers } : undefined, timeoutMs)
  } catch (error) {
    return { path, ok: false, error: error instanceof Error ? error.message : String(error) }
  }

  if (!res.ok) {
    return { path, ok: false, httpStatus: res.status, error: `HTTP ${res.status}` }
  }

  const contentType = res.headers?.get?.("content-type") ?? ""
  let text: string
  try {
    text = await res.text()
  } catch (error) {
    return { path, ok: false, httpStatus: res.status, error: error instanceof Error ? error.message : String(error) }
  }

  if (!/json/i.test(contentType) && isHtmlText(text)) {
    return {
      path,
      ok: false,
      httpStatus: res.status,
      htmlResponse: true,
      error: `HTTP ${res.status} with an HTML page (web UI) instead of the API at ${path}`,
    }
  }

  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return {
      path,
      ok: false,
      httpStatus: res.status,
      htmlResponse: isHtmlText(text) || undefined,
      error: `HTTP ${res.status} with a non-JSON body at ${path}`,
    }
  }

  const healthy = asHealthyBody(body)
  if (!healthy) {
    return { path, ok: false, httpStatus: res.status, error: `HTTP ${res.status} with an unexpected body at ${path}` }
  }
  return { path, ok: true, httpStatus: res.status, version: healthy.version }
}

// Detect which protocol a server speaks. Probes the v1 shape first (see
// note on V1_HEALTH_PATH above), then v2. Resolves with the detected
// protocol or throws an actionable error:
//
// - 401/403 on either probe -> ApiAuthError (wrong credentials — the single
//   most common "server is up but won't talk" failure).
// - 2xx HTML on a probe -> the address serves the web UI, not the API.
// - otherwise the last transport/status error.
export async function detectServerProtocol(
  baseUrl: string,
  headers: Record<string, string> | undefined,
  fetchFn: FetchFn,
  timeoutMs: number,
): Promise<DetectedProtocol> {
  const cleanBase = baseUrl.replace(/\/+$/, "")
  const [v1, v2] = await Promise.all([
    probeHealthPath(cleanBase, V1_HEALTH_PATH, headers, fetchFn, timeoutMs),
    probeHealthPath(cleanBase, V2_HEALTH_PATH, headers, fetchFn, timeoutMs),
  ])

  if (v1.ok) return { protocol: "v1", version: v1.version }
  if (v2.ok) return { protocol: "v2", version: v2.version }

  const authStatus = [v1.httpStatus, v2.httpStatus].find((s) => s === 401 || s === 403)
  if (authStatus !== undefined) {
    throw apiErrorFor(authStatus, `Server rejected credentials (HTTP ${authStatus})`)
  }

  if (v1.htmlResponse || v2.htmlResponse) {
    const at = v1.htmlResponse ? V1_HEALTH_PATH : V2_HEALTH_PATH
    throw new Error(
      `Server at ${cleanBase} returned a web page (HTML) instead of the opencode API at ${at}. ` +
        `The address serves the web UI or the wrong path — check the server URL and that an opencode v1/v2 API server is running there.`,
    )
  }

  throw new Error(v1.error && v2.error ? `${v1.error}; ${V2_HEALTH_PATH}: ${v2.error}` : (v1.error ?? v2.error ?? "Health check failed"))
}

// Map a v1-shaped SDK path to whatever the negotiated protocol expects.
// v1: identity. v2: everything lives under /api, and the two /global/*
// routes are renamed (there is no /api/global/* on v2).
export function apiPath(protocol: ServerProtocol, path: string): string {
  if (protocol === "v1") return path
  if (path === "/global/health" || path.startsWith("/global/health?")) return path.replace("/global/health", "/api/health")
  if (path === "/global/event" || path.startsWith("/global/event?")) return path.replace("/global/event", "/api/event")
  if (path.startsWith("/api/")) return path
  return `/api${path}`
}
