// Parse a scanned QR code into connection form fields. Accepts:
// - http(s)://host:port[/path][?password=&username=&directory=]
// - {"url"|"host": ..., "password": ..., "username": ..., "directory": ...}
// - bare host / host:port
export function parseConnectionQr(
  raw: string,
): { url?: string; ip?: string; port?: string; username?: string; password?: string; directory?: string } | null {
  const text = raw.trim()
  if (!text) return null
  if (text.startsWith("{")) {
    try {
      const obj = JSON.parse(text) as Record<string, unknown>
      const url = typeof obj.url === "string" ? obj.url : typeof obj.host === "string" ? obj.host : undefined
      if (!url) return null
      const out: { url: string; username?: string; password?: string; directory?: string } = { url }
      if (typeof obj.username === "string" && obj.username) out.username = obj.username
      if (typeof obj.password === "string" && obj.password) out.password = obj.password
      if (typeof obj.directory === "string" && obj.directory) out.directory = obj.directory
      return out
    } catch {
      return null
    }
  }
  try {
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(text) ? text : `http://${text}`
    const u = new URL(withScheme)
    if (!u.hostname) return null
    const params = u.searchParams
    const hasExtras =
      u.pathname !== "/" || [...params.keys()].length > 0 || (u.protocol !== "http:" && u.protocol !== "https:")
    const username = params.get("username") || undefined
    const password = params.get("password") || undefined
    const directory = params.get("directory") || undefined
    // https:// can never work in quick mode (it builds http:// URLs), so it
    // always goes to advanced mode with the URL preserved as-is.
    if (hasExtras || username || password || directory || u.protocol === "https:") {
      return { url: text.startsWith("http") ? text : withScheme, username, password, directory }
    }
    const out: { ip?: string; port?: string } = { ip: u.hostname }
    if (u.port) out.port = u.port
    return out
  } catch {
    return null
  }
}
