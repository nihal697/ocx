import { useCallback, useEffect, useState } from "react"
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
  RefreshControl,
} from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { router } from "expo-router"
import { useTranslation } from "react-i18next"
import { useConnections } from "../../src/stores/connections"
import type { FileEntry } from "../../src/lib/sdk"

type TextMatch = { path: { text: string }; lines: { text: string }; line_number: number }

// Display cap: the server returns whole files; don't lay out megabytes of text.
const MAX_VIEW_CHARS = 200_000

export default function FilesScreen() {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === "dark"
  const { t } = useTranslation()
  const { client, activeConnection } = useConnections()

  const [cwd, setCwd] = useState(".")
  const [entries, setEntries] = useState<FileEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [searching, setSearching] = useState(false)
  const [matches, setMatches] = useState<TextMatch[] | null>(null)
  const [viewing, setViewing] = useState<{ path: string; content: string; truncated: boolean } | null>(null)
  const [loadingFile, setLoadingFile] = useState(false)

  const loadDir = useCallback(
    async (path: string) => {
      if (!client) return
      setLoading(true)
      setError(null)
      try {
        const list = await client.file.list({ path })
        setEntries(
          [...list].sort((a, b) =>
            a.type === b.type ? a.name.localeCompare(b.name) : a.type === "directory" ? -1 : 1,
          ),
        )
        setCwd(path)
        setMatches(null)
      } catch (err) {
        console.error("Browse failed:", err)
        setError(t("files.browseFailed"))
      } finally {
        setLoading(false)
      }
    },
    [client, t],
  )

  useEffect(() => {
    if (client) void loadDir(".")
  }, [client, loadDir, activeConnection?.id])

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await loadDir(cwd)
    } finally {
      setRefreshing(false)
    }
  }, [loadDir, cwd])

  const goUp = useCallback(() => {
    if (cwd === "." || viewing) {
      if (viewing) setViewing(null)
      return
    }
    const parts = cwd.split("/").filter(Boolean)
    parts.pop()
    void loadDir(parts.length ? parts.join("/") : ".")
  }, [cwd, viewing, loadDir])

  const openEntry = useCallback(
    async (entry: FileEntry) => {
      if (!client) return
      if (entry.type === "directory") {
        void loadDir(entry.path)
        return
      }
      setLoadingFile(true)
      try {
        const res = await client.file.content(entry.path)
        if (res.type !== "text") {
          Alert.alert(t("files.binaryTitle"), t("files.binaryMessage"))
          return
        }
        const truncated = res.content.length > MAX_VIEW_CHARS
        setViewing({
          path: entry.path,
          content: truncated ? res.content.slice(0, MAX_VIEW_CHARS) : res.content,
          truncated,
        })
      } catch (err) {
        console.error("Read failed:", err)
        Alert.alert(t("files.readFailedTitle"), t("files.readFailedMessage"))
      } finally {
        setLoadingFile(false)
      }
    },
    [client, loadDir, t],
  )

  const runSearch = useCallback(async () => {
    const pattern = query.trim()
    if (!client || !pattern) {
      setMatches(null)
      return
    }
    setSearching(true)
    try {
      const res = await client.file.findText(pattern)
      setMatches(Array.isArray(res) ? res.slice(0, 100) : [])
    } catch (err) {
      console.error("Search failed:", err)
      setMatches([])
    } finally {
      setSearching(false)
    }
  }, [client, query])

  const openMatch = useCallback(
    (m: TextMatch) => {
      setQuery("")
      setMatches(null)
      void (async () => {
        if (!client) return
        setLoadingFile(true)
        try {
          const res = await client.file.content(m.path.text)
          if (res.type !== "text") return
          const truncated = res.content.length > MAX_VIEW_CHARS
          setViewing({
            path: m.path.text,
            content: truncated ? res.content.slice(0, MAX_VIEW_CHARS) : res.content,
            truncated,
          })
        } catch {
          Alert.alert(t("files.readFailedTitle"), t("files.readFailedMessage"))
        } finally {
          setLoadingFile(false)
        }
      })()
    },
    [client, t],
  )

  const handleInitGit = useCallback(() => {
    if (!client) return
    Alert.alert(t("files.initGitTitle"), t("files.initGitMessage"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("files.initGitConfirm"),
        onPress: () => {
          void (async () => {
            try {
              await client.project.initGit()
              Alert.alert(t("files.initGitDoneTitle"), t("files.initGitDoneMessage"))
            } catch (err) {
              console.error("init git failed:", err)
              Alert.alert(t("files.initGitFailedTitle"), t("files.initGitFailedMessage"))
            }
          })()
        },
      },
    ])
  }, [client, t])

  if (!client) {
    return (
      <View style={[styles.center, isDark && styles.centerDark]}>
        <Text style={[styles.hint, isDark && styles.hintDark]}>{t("files.noConnection")}</Text>
      </View>
    )
  }

  // File viewer
  if (viewing) {
    return (
      <View style={[styles.container, isDark && styles.containerDark]}>
        <View style={styles.viewerHeader}>
          <TouchableOpacity onPress={() => setViewing(null)} hitSlop={8}>
            <Ionicons name="arrow-back" size={22} color={isDark ? "#ffffff" : "#0a0a0a"} />
          </TouchableOpacity>
          <Text style={[styles.viewerPath, isDark && styles.textDark]} numberOfLines={1}>
            {viewing.path}
          </Text>
        </View>
        {viewing.truncated && (
          <Text style={[styles.truncated, isDark && styles.hintDark]}>{t("files.truncated")}</Text>
        )}
        <ScrollView style={styles.viewerScroll}>
          <Text selectable style={[styles.code, isDark && styles.codeDark]}>
            {viewing.content}
          </Text>
        </ScrollView>
      </View>
    )
  }

  return (
    <View style={[styles.container, isDark && styles.containerDark]}>
      <View style={styles.searchRow}>
        <View style={[styles.searchBox, isDark && styles.searchBoxDark]}>
          <Ionicons name="search-outline" size={16} color={isDark ? "#888888" : "#666666"} />
          <TextInput
            style={[styles.searchInput, isDark && styles.searchInputDark]}
            placeholder={t("files.searchPlaceholder")}
            placeholderTextColor={isDark ? "#666666" : "#999999"}
            value={query}
            onChangeText={(v) => {
              setQuery(v)
              if (!v.trim()) setMatches(null)
            }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => void runSearch()}
            testID="files-search-input"
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                setQuery("")
                setMatches(null)
              }}
              hitSlop={8}
            >
              <Ionicons name="close-circle" size={16} color={isDark ? "#888888" : "#666666"} />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={handleInitGit} hitSlop={8} testID="files-init-git">
          <Ionicons name="git-branch-outline" size={20} color={isDark ? "#888888" : "#666666"} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.push("/terminal")} hitSlop={8} testID="files-terminal">
          <Ionicons name="terminal-outline" size={20} color={isDark ? "#888888" : "#666666"} />
        </TouchableOpacity>
      </View>

      <View style={styles.crumbRow}>
        <TouchableOpacity onPress={goUp} disabled={cwd === "."} hitSlop={8}>
          <Ionicons name="arrow-up-circle-outline" size={20} color={cwd === "." ? "#444444" : "#3b82f6"} />
        </TouchableOpacity>
        <Text style={[styles.crumb, isDark && styles.hintDark]} numberOfLines={1}>
          {cwd}
        </Text>
      </View>

      {loading || loadingFile ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={isDark ? "#ffffff" : "#0a0a0a"} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.error}>{error}</Text>
        </View>
      ) : matches ? (
        <FlatList
          data={matches}
          keyExtractor={(_, i) => `match-${i}`}
          renderItem={({ item: m }) => (
            <TouchableOpacity
              style={[styles.row, isDark && styles.rowDark]}
              onPress={() => openMatch(m)}
            >
              <View style={styles.matchCol}>
                <Text style={[styles.matchPath, isDark && styles.textDark]} numberOfLines={1}>
                  {m.path.text}:{m.line_number}
                </Text>
                <Text style={[styles.matchLine, isDark && styles.hintDark]} numberOfLines={2}>
                  {m.lines.text.trim()}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={isDark ? "#666666" : "#999999"} />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={[styles.hint, isDark && styles.hintDark]}>{t("files.noMatches")}</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(e) => e.path}
          renderItem={({ item: e }) => (
            <TouchableOpacity
              style={[styles.row, isDark && styles.rowDark]}
              onPress={() => void openEntry(e)}
              testID={`file-row-${e.path}`}
            >
              <Ionicons
                name={e.type === "directory" ? "folder-outline" : "document-text-outline"}
                size={18}
                color={isDark ? "#888888" : "#666666"}
              />
              <Text style={[styles.rowText, isDark && styles.textDark]} numberOfLines={1}>
                {e.name}
              </Text>
              {e.type === "directory" && (
                <Ionicons name="chevron-forward" size={18} color={isDark ? "#666666" : "#999999"} />
              )}
            </TouchableOpacity>
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={isDark ? "#ffffff" : "#0a0a0a"} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={[styles.hint, isDark && styles.hintDark]}>{t("files.emptyDir")}</Text>
            </View>
          }
        />
      )}
      {searching && (
        <View style={styles.searching}>
          <ActivityIndicator size="small" color="#ffffff" />
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#ffffff" },
  containerDark: { backgroundColor: "#0a0a0a" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  centerDark: { backgroundColor: "#0a0a0a" },
  hint: { fontSize: 14, color: "#666666", textAlign: "center" },
  hintDark: { color: "#888888" },
  textDark: { color: "#ffffff" },
  error: { fontSize: 14, color: "#dc2626", textAlign: "center" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "#f5f5f5",
  },
  searchBoxDark: { backgroundColor: "#1a1a1a" },
  searchInput: { flex: 1, fontSize: 15, color: "#0a0a0a", padding: 0 },
  searchInputDark: { color: "#ffffff" },
  iconBtn: { padding: 6 },
  crumbRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  crumb: { flex: 1, fontSize: 13, color: "#666666", fontFamily: "monospace" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  rowDark: { borderBottomColor: "#1a1a1a" },
  rowText: { flex: 1, fontSize: 15, color: "#0a0a0a" },
  matchCol: { flex: 1, gap: 2 },
  matchPath: { fontSize: 13, fontWeight: "600", color: "#0a0a0a", fontFamily: "monospace" },
  matchLine: { fontSize: 13, color: "#666666", fontFamily: "monospace" },
  viewerHeader: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
  viewerPath: { flex: 1, fontSize: 14, fontWeight: "600", color: "#0a0a0a", fontFamily: "monospace" },
  truncated: { fontSize: 12, color: "#f59e0b", paddingHorizontal: 12, paddingBottom: 4 },
  viewerScroll: { flex: 1, paddingHorizontal: 12 },
  code: { fontSize: 13, color: "#0a0a0a", fontFamily: "monospace", paddingBottom: 40 },
  codeDark: { color: "#e5e5e5" },
  searching: {
    position: "absolute",
    bottom: 24,
    alignSelf: "center",
    backgroundColor: "#0a0a0a",
    borderRadius: 16,
    padding: 8,
  },
})
