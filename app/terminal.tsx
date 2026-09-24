import { useCallback, useEffect, useRef, useState } from "react"
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native"
import { Stack } from "expo-router"
import { Ionicons } from "@expo/vector-icons"
import { useTranslation } from "react-i18next"
import { useConnections } from "../src/stores/connections"

interface PtyInfo {
  id: string
  title: string
  command: string
  args: string[]
  cwd: string
  status: "running" | "exited"
  pid: number
  exitCode?: number
}

// Strip ANSI escape sequences for the plain-text view. Interactive TUIs
// (vim, htop) won't render meaningfully here — plain command output will.
const ANSI_RE =
  // eslint-disable-next-line no-control-regex
  /\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)|\x1B\[[0-9;?]*[A-Za-z]|\x1B[()][0-9A-Z]|\x1B[=>M78c]/g

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "").replace(/\r(?!\n)/g, "\n")
}

// Keep the on-device buffer bounded; the server retains full history.
const MAX_BUFFER_CHARS = 100_000

export default function TerminalScreen() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === "dark"
  const { t } = useTranslation()
  const { client, activeConnection } = useConnections()

  const [ptys, setPtys] = useState<PtyInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [activeID, setActiveID] = useState<string | null>(null)
  const [output, setOutput] = useState("")
  const [connected, setConnected] = useState(false)
  const [input, setInput] = useState("")
  const wsRef = useRef<WebSocket | null>(null)
  const cursorRef = useRef(-1)
  const scrollRef = useRef<ScrollView>(null)

  const closeSocket = useCallback(() => {
    try {
      wsRef.current?.close()
    } catch {
      // ignore
    }
    wsRef.current = null
    setConnected(false)
  }, [])

  const loadPtys = useCallback(async () => {
    if (!client) return
    setLoading(true)
    try {
      const list = await client.pty.list()
      setPtys(Array.isArray(list) ? list : [])
    } catch {
      setPtys([])
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    void loadPtys()
    return () => {
      try {
        wsRef.current?.close()
      } catch {
        // ignore
      }
      wsRef.current = null
    }
  }, [loadPtys, activeConnection?.id])

  const appendOutput = useCallback((chunk: string) => {
    const clean = stripAnsi(chunk)
    if (!clean) return
    setOutput((prev) => {
      const next = prev + clean
      return next.length > MAX_BUFFER_CHARS ? next.slice(next.length - MAX_BUFFER_CHARS) : next
    })
  }, [])

  const connect = useCallback(
    async (ptyID: string) => {
      if (!client) return
      closeSocket()
      setOutput("")
      setActiveID(ptyID)
      try {
        const ticket = await client.pty.connectToken(ptyID)
        const url = client.pty.connectUrl(ptyID, ticket, cursorRef.current)
        const ws = new WebSocket(url)
        try {
          ;(ws as unknown as { binaryType: string }).binaryType = "arraybuffer"
        } catch {
          // ignore — text frames still work
        }
        ws.onopen = () => setConnected(true)
        ws.onclose = () => setConnected(false)
        ws.onerror = () => setConnected(false)
        ws.onmessage = (ev: { data: unknown }) => {
          const data = ev.data
          if (typeof data === "string") {
            appendOutput(data)
            return
          }
          // Binary frames: either the 0x00+JSON cursor control frame or raw bytes.
          let bytes: Uint8Array | null = null
          if (data instanceof ArrayBuffer) bytes = new Uint8Array(data)
          else if (typeof Blob !== "undefined" && data instanceof Blob) {
            void data.arrayBuffer().then((buf) => {
              handleBinary(new Uint8Array(buf))
            })
            return
          }
          if (bytes) handleBinary(bytes)
        }
        const handleBinary = (bytes: Uint8Array) => {
          if (bytes.length > 1 && bytes[0] === 0) {
            try {
              const parsed = JSON.parse(new TextDecoder().decode(bytes.slice(1))) as { cursor?: number }
              if (typeof parsed.cursor === "number") cursorRef.current = parsed.cursor
            } catch {
              // ignore malformed control frame
            }
            return
          }
          appendOutput(new TextDecoder("utf-8", { fatal: false }).decode(bytes))
        }
        wsRef.current = ws
      } catch (err) {
        console.error("Terminal connect failed:", err)
        Alert.alert(t("terminal.connectFailedTitle"), t("terminal.connectFailedMessage"))
      }
    },
    [client, closeSocket, appendOutput, t],
  )

  const createTerminal = useCallback(async () => {
    if (!client) return
    try {
      const created = await client.pty.create({ title: "OCX" })
      await loadPtys()
      void connect(created.id)
    } catch (err) {
      console.error("Terminal create failed:", err)
      Alert.alert(t("terminal.createFailedTitle"), t("terminal.createFailedMessage"))
    }
  }, [client, loadPtys, connect, t])

  const killTerminal = useCallback(
    async (ptyID: string) => {
      if (!client) return
      Alert.alert(t("terminal.killTitle"), t("terminal.killMessage"), [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("terminal.killConfirm"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              if (activeID === ptyID) {
                closeSocket()
                setActiveID(null)
                setOutput("")
              }
              try {
                await client.pty.remove(ptyID)
              } catch {
                // already gone — reload anyway
              }
              await loadPtys()
            })()
          },
        },
      ])
    },
    [client, activeID, closeSocket, loadPtys, t],
  )

  const sendInput = useCallback(
    (text: string) => {
      if (!text || wsRef.current?.readyState !== WebSocket.OPEN) return
      try {
        wsRef.current.send(text)
      } catch {
        setConnected(false)
      }
    },
    [],
  )

  const active = ptys.find((p) => p.id === activeID) ?? null

  return (
    <>
      <Stack.Screen options={{ title: t("terminal.title") }} />
      <View style={[s.container, isDark && s.containerDark]}>
        {!client ? (
          <View style={s.center}>
            <Text style={[s.hint, isDark && s.hintDark]}>{t("terminal.noConnection")}</Text>
          </View>
        ) : !active ? (
          <>
            <View style={s.listHeader}>
              <Text style={[s.listTitle, isDark && s.textDark]}>{t("terminal.sessions")}</Text>
              <TouchableOpacity style={s.newBtn} onPress={() => void createTerminal()} testID="terminal-new">
                <Ionicons name="add" size={18} color="#ffffff" />
                <Text style={s.newBtnText}>{t("terminal.new")}</Text>
              </TouchableOpacity>
            </View>
            {loading ? (
              <View style={s.center}>
                <ActivityIndicator size="large" color={isDark ? "#ffffff" : "#0a0a0a"} />
              </View>
            ) : (
              <FlatList
                data={ptys}
                keyExtractor={(p) => p.id}
                renderItem={({ item: p }) => (
                  <View style={[s.row, isDark && s.rowDark]}>
                    <TouchableOpacity style={s.rowMain} onPress={() => void connect(p.id)}>
                      <Text style={[s.rowTitle, isDark && s.textDark]} numberOfLines={1}>
                        {p.title || p.command || p.id.slice(0, 8)}
                      </Text>
                      <Text style={[s.rowSub, isDark && s.hintDark]} numberOfLines={1}>
                        {p.status}
                        {p.status === "exited" && p.exitCode !== undefined ? ` (${p.exitCode})` : ""} · {p.cwd}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => void killTerminal(p.id)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={18} color="#dc2626" />
                    </TouchableOpacity>
                  </View>
                )}
                ListEmptyComponent={
                  <View style={s.center}>
                    <Text style={[s.hint, isDark && s.hintDark]}>{t("terminal.empty")}</Text>
                  </View>
                }
              />
            )}
          </>
        ) : (
          <>
            <View style={s.termHeader}>
              <TouchableOpacity
                onPress={() => {
                  closeSocket()
                  setActiveID(null)
                  setOutput("")
                  void loadPtys()
                }}
                hitSlop={8}
              >
                <Ionicons name="arrow-back" size={22} color={isDark ? "#ffffff" : "#0a0a0a"} />
              </TouchableOpacity>
              <Text style={[s.termTitle, isDark && s.textDark]} numberOfLines={1}>
                {active?.title || active?.command || t("terminal.title")}
              </Text>
              <View style={[s.dot, connected ? s.dotOn : s.dotOff]} />
              <TouchableOpacity
                onPress={() => active && void connect(active.id)}
                hitSlop={8}
                testID="terminal-reconnect"
              >
                <Ionicons name="refresh" size={20} color={isDark ? "#888888" : "#666666"} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => active && void killTerminal(active.id)} hitSlop={8}>
                <Ionicons name="trash-outline" size={20} color="#dc2626" />
              </TouchableOpacity>
            </View>
            <ScrollView
              ref={scrollRef}
              style={s.termScroll}
              onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
            >
              <Text selectable style={[s.termText, isDark && s.termTextDark]}>
                {output || t("terminal.waiting")}
              </Text>
            </ScrollView>
            <View style={s.termInputRow}>
              <TouchableOpacity
                style={s.keyBtn}
                onPress={() => sendInput("\x03")}
                testID="terminal-ctrl-c"
              >
                <Text style={s.keyBtnText}>^C</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.keyBtn} onPress={() => sendInput("\t")}>
                <Text style={s.keyBtnText}>⇥</Text>
              </TouchableOpacity>
              <TextInput
                style={[s.termInput, isDark && s.termInputDark]}
                value={input}
                onChangeText={setInput}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="send"
                onSubmitEditing={() => {
                  sendInput(input + "\n")
                  setInput("")
                }}
                placeholder={connected ? t("terminal.inputPlaceholder") : t("terminal.disconnected")}
                placeholderTextColor={isDark ? "#666666" : "#999999"}
                editable={connected}
                testID="terminal-input"
              />
              <TouchableOpacity
                style={s.sendBtn}
                onPress={() => {
                  sendInput(input + "\n")
                  setInput("")
                }}
                disabled={!connected || !input}
              >
                <Ionicons name="send" size={18} color="#ffffff" />
              </TouchableOpacity>
            </View>
          </>
        )}
      </View>
    </>
  )
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  containerDark: { backgroundColor: "#0a0a0a" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  hint: { fontSize: 14, color: "#666666", textAlign: "center" },
  hintDark: { color: "#888888" },
  textDark: { color: "#ffffff" },
  listHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  listTitle: { fontSize: 17, fontWeight: "700", color: "#0a0a0a" },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#0a0a0a",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  newBtnText: { color: "#ffffff", fontSize: 14, fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  rowDark: { borderBottomColor: "#1a1a1a" },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: "600", color: "#0a0a0a" },
  rowSub: { fontSize: 12, color: "#666666", fontFamily: "monospace" },
  termHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  termTitle: { flex: 1, fontSize: 15, fontWeight: "600", color: "#0a0a0a" },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotOn: { backgroundColor: "#22c55e" },
  dotOff: { backgroundColor: "#dc2626" },
  termScroll: { flex: 1, backgroundColor: "#111111", marginHorizontal: 12, borderRadius: 8 },
  termText: { fontSize: 13, color: "#e5e5e5", fontFamily: "monospace", padding: 10, paddingBottom: 40 },
  termTextDark: { color: "#e5e5e5" },
  termInputRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  keyBtn: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#f5f5f5",
  },
  keyBtnText: { fontSize: 14, fontWeight: "700", color: "#666666" },
  termInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d4d4d4",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: "#0a0a0a",
    fontFamily: "monospace",
  },
  termInputDark: { borderColor: "#404040", backgroundColor: "#1a1a1a", color: "#ffffff" },
  sendBtn: { backgroundColor: "#0a0a0a", padding: 10, borderRadius: 8 },
})
