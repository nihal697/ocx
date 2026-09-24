import { useEffect, useMemo, useState } from "react"
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native"
import { Ionicons } from "@expo/vector-icons"
import { useTranslation } from "react-i18next"
import { router } from "expo-router"
import type { Message, Session, Todo } from "../../lib/sdk"
import type { Provider } from "../../stores/catalog"
import { useConnections } from "../../stores/connections"

interface Props {
  session: Session | null
  messages: Message[]
  providers: Provider[]
  visible: boolean
  isDark: boolean
  hasMore: boolean
  loadingAll: boolean
  onLoadAll: () => void
  onScrollToTop: () => void
  onClose: () => void
  onSummarize: () => void
  summarizing: boolean
  onFork: () => void
  forking: boolean
  onBackground: () => void
  backgrounding: boolean
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

function formatCost(cost: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cost)
}

function formatTime(ts: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return t("chat.sessionInfo.time.justNow")
  if (mins < 60) return t("chat.sessionInfo.time.minutesAgo", { count: mins })
  const hours = Math.floor(mins / 60)
  if (hours < 24) return t("chat.sessionInfo.time.hoursAgo", { count: hours })
  const days = Math.floor(hours / 24)
  if (days < 7) return t("chat.sessionInfo.time.daysAgo", { count: days })
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

export function SessionInfo({
  session,
  messages,
  providers,
  visible,
  isDark,
  hasMore,
  loadingAll,
  onLoadAll,
  onScrollToTop,
  onClose,
  onSummarize,
  summarizing,
  onFork,
  forking,
  onBackground,
  backgrounding,
}: Props) {
  const { t } = useTranslation()
  const client = useConnections((s) => s.client)
  const clientForDirectory = useConnections((s) => s.clientForDirectory)
  const [todos, setTodos] = useState<Todo[] | null>(null)
  const [children, setChildren] = useState<Session[] | null>(null)

  // Agent todo list — fetched when the panel opens. Best effort: a missing
  // route (older server) or empty list simply hides the section.
  useEffect(() => {
    if (!visible || !session) return
    const c = session.directory ? (clientForDirectory(session.directory) ?? client) : client
    if (!c) return
    let cancelled = false
    c.session
      .todo(session.id)
      .then((list) => {
        if (!cancelled) setTodos(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (!cancelled) setTodos(null)
      })
    c.session
      .children(session.id)
      .then((list) => {
        if (!cancelled) setChildren(Array.isArray(list) ? list : [])
      })
      .catch(() => {
        if (!cancelled) setChildren(null)
      })
    return () => {
      cancelled = true
    }
  }, [visible, session?.id, session?.directory, client, clientForDirectory])
  // Match TUI: last assistant message tokens (context window), cumulative cost
  const stats = useMemo(() => {
    let cost = 0
    let last: Message | null = null

    for (const msg of messages) {
      if (msg.role !== "assistant") continue
      if (msg.cost) cost += msg.cost
      if (msg.tokens && msg.tokens.output > 0) last = msg
    }

    // Last assistant message token breakdown (what the TUI shows)
    const tokens = last?.tokens
    const input = tokens?.input || 0
    const output = tokens?.output || 0
    const reasoning = tokens?.reasoning || 0
    const cacheRead = tokens?.cache?.read || 0
    const cacheWrite = tokens?.cache?.write || 0
    const total = input + output + reasoning + cacheRead + cacheWrite

    // Find context limit from provider catalog
    let context = 0
    if (last?.providerID && last?.modelID) {
      const provider = providers.find((p) => p.id === last!.providerID)
      const model = provider?.models.find((m) => m.id === last!.modelID)
      context = model?.limit?.context || 0
    }
    const percent = context > 0 ? Math.round((total / context) * 100) : 0

    return { cost, input, output, reasoning, cacheRead, cacheWrite, total, percent, context }
  }, [messages, providers])

  if (!visible) return null

  const hasTokens = stats.total > 0
  const hasCost = stats.cost > 0
  const summary = session?.summary
  const created = session?.time.created
  const updated = session?.time.updated

  return (
    <View style={[s.container, isDark && s.containerDark]}>
      {/* Top row: tokens + context % + cost — matches TUI header */}
      <View style={s.row}>
        <View style={s.costRow}>
          <Ionicons name="stats-chart-outline" size={14} color={isDark ? "#888888" : "#666666"} />
          {hasTokens && (
            <Text style={[s.tokens, isDark && s.textDark]}>
              {stats.total.toLocaleString()}
              {stats.percent > 0 && <Text style={[s.percent, isDark && s.dimDark]}>{`  ${stats.percent}%`}</Text>}
            </Text>
          )}
          {hasCost && <Text style={[s.cost, isDark && s.dimDark]}>({formatCost(stats.cost)})</Text>}
          {!hasTokens && !hasCost && (
            <Text style={[s.cost, isDark && s.dimDark]}>{t("chat.sessionInfo.noUsageData")}</Text>
          )}
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={8}>
          <Ionicons name="close" size={16} color={isDark ? "#666666" : "#999999"} />
        </TouchableOpacity>
      </View>

      {/* Context bar */}
      {stats.percent > 0 && (
        <View style={[s.bar, isDark && s.barDark]}>
          <View
            style={[
              s.barFill,
              { width: `${Math.min(stats.percent, 100)}%` },
              stats.percent > 80 ? s.barWarn : stats.percent > 50 ? s.barMid : s.barOk,
            ]}
          />
        </View>
      )}

      {/* Token breakdown pills */}
      {hasTokens && (
        <View style={s.breakdown}>
          <TokenPill label={t("chat.sessionInfo.pills.in")} value={stats.input} color="#3b82f6" isDark={isDark} />
          <TokenPill label={t("chat.sessionInfo.pills.out")} value={stats.output} color="#10b981" isDark={isDark} />
          {stats.reasoning > 0 && (
            <TokenPill label={t("chat.sessionInfo.pills.think")} value={stats.reasoning} color="#f59e0b" isDark={isDark} />
          )}
          {stats.cacheRead > 0 && (
            <TokenPill label={t("chat.sessionInfo.pills.cacheRead")} value={stats.cacheRead} color="#8b5cf6" isDark={isDark} />
          )}
          {stats.cacheWrite > 0 && (
            <TokenPill
              label={t("chat.sessionInfo.pills.cacheWrite")}
              value={stats.cacheWrite}
              color="#ec4899"
              isDark={isDark}
            />
          )}
        </View>
      )}

      {/* Session metadata */}
      <View style={s.meta}>
        {created && (
          <MetaItem icon="time-outline" label={t("chat.sessionInfo.meta.created")} value={formatTime(created, t)} isDark={isDark} />
        )}
        {updated && updated !== created && (
          <MetaItem icon="refresh-outline" label={t("chat.sessionInfo.meta.updated")} value={formatTime(updated, t)} isDark={isDark} />
        )}
        <MetaItem
          icon="chatbubbles-outline"
          label={t("chat.sessionInfo.meta.messages")}
          value={String(messages.length) + (hasMore ? "+" : "")}
          isDark={isDark}
        />
        {summary && summary.files > 0 && (
          <MetaItem
            icon="code-outline"
            label={t("chat.sessionInfo.meta.changes")}
            value={`${summary.files}f +${summary.additions} -${summary.deletions}`}
            isDark={isDark}
          />
        )}
        {session?.share?.url && (
          <MetaItem icon="share-outline" label={t("chat.sessionInfo.meta.shared")} value={t("chat.sessionInfo.meta.yes")} isDark={isDark} />
        )}
      </View>

      {/* Navigation actions */}
      <View style={s.actions}>
        {hasMore && (
          <TouchableOpacity style={[s.action, isDark && s.actionDark]} onPress={onLoadAll} disabled={loadingAll}>
            {loadingAll ? (
              <ActivityIndicator size="small" color={isDark ? "#888888" : "#666666"} />
            ) : (
              <Ionicons name="download-outline" size={14} color={isDark ? "#888888" : "#666666"} />
            )}
            <Text style={[s.actionText, isDark && s.dimDark]}>
              {loadingAll ? t("chat.sessionInfo.loading") : t("chat.sessionInfo.loadAllMessages")}
            </Text>
          </TouchableOpacity>
        )}
        {messages.length > 0 && (
          <TouchableOpacity style={[s.action, isDark && s.actionDark]} onPress={onScrollToTop}>
            <Ionicons name="arrow-up-outline" size={14} color={isDark ? "#888888" : "#666666"} />
            <Text style={[s.actionText, isDark && s.dimDark]}>{t("chat.sessionInfo.jumpToBeginning")}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.action, isDark && s.actionDark]}
          onPress={onSummarize}
          disabled={summarizing}
          testID="session-summarize-button"
        >
          {summarizing ? (
            <ActivityIndicator size="small" color={isDark ? "#888888" : "#666666"} />
          ) : (
            <Ionicons name="compress-outline" size={14} color={isDark ? "#888888" : "#666666"} />
          )}
          <Text style={[s.actionText, isDark && s.dimDark]}>{t("chat.sessionInfo.summarize")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.action, isDark && s.actionDark]}
          onPress={onFork}
          disabled={forking}
          testID="session-fork-button"
        >
          {forking ? (
            <ActivityIndicator size="small" color={isDark ? "#888888" : "#666666"} />
          ) : (
            <Ionicons name="git-branch-outline" size={14} color={isDark ? "#888888" : "#666666"} />
          )}
          <Text style={[s.actionText, isDark && s.dimDark]}>{t("chat.sessionInfo.fork")}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.action, isDark && s.actionDark]}
          onPress={onBackground}
          disabled={backgrounding}
          testID="session-background-button"
        >
          {backgrounding ? (
            <ActivityIndicator size="small" color={isDark ? "#888888" : "#666666"} />
          ) : (
            <Ionicons name="cloud-upload-outline" size={14} color={isDark ? "#888888" : "#666666"} />
          )}
          <Text style={[s.actionText, isDark && s.dimDark]}>{t("chat.sessionInfo.background")}</Text>
        </TouchableOpacity>
      </View>

      {/* Agent todos */}
      {todos && todos.length > 0 && (
        <View style={s.todos}>
          <Text style={[s.todosTitle, isDark && s.dimDark]}>{t("chat.sessionInfo.todos")}</Text>
          {todos.map((todo, idx) => (
            <View key={`${idx}-${todo.content}`} style={s.todoRow}>
              <Ionicons
                name={
                  todo.status === "completed"
                    ? "checkmark-circle"
                    : todo.status === "in_progress"
                      ? "ellipse"
                      : todo.status === "cancelled"
                        ? "close-circle-outline"
                        : "ellipse-outline"
                }
                size={14}
                color={
                  todo.status === "completed"
                    ? "#22c55e"
                    : todo.status === "in_progress"
                      ? "#3b82f6"
                      : isDark
                        ? "#666666"
                        : "#999999"
                }
              />
              <Text style={[s.todoText, isDark && s.dimDark]} numberOfLines={2}>
                {todo.content}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Forks (child sessions) */}
      {children && children.length > 0 && (
        <View style={s.todos}>
          <Text style={[s.todosTitle, isDark && s.dimDark]}>{t("chat.sessionInfo.forks")}</Text>
          {children.map((child) => (
            <TouchableOpacity
              key={child.id}
              style={s.todoRow}
              onPress={() =>
                router.push({
                  pathname: `/session/[id]`,
                  params: { id: child.id, ...(child.directory ? { directory: child.directory } : {}) },
                })
              }
            >
              <Ionicons name="git-branch-outline" size={14} color={isDark ? "#666666" : "#999999"} />
              <Text style={[s.todoText, isDark && s.dimDark]} numberOfLines={1}>
                {child.title || t("chat.sessionInfo.untitledFork")}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  )
}

function MetaItem({ icon, label, value, isDark }: { icon: string; label: string; value: string; isDark: boolean }) {
  return (
    <View style={s.metaItem}>
      <Ionicons name={icon as any} size={12} color={isDark ? "#555555" : "#999999"} />
      <Text style={[s.metaLabel, isDark && s.dimDark]}>{label}</Text>
      <Text style={[s.metaValue, isDark && s.metaValueDark]}>{value}</Text>
    </View>
  )
}

function TokenPill({ label, value, color, isDark }: { label: string; value: number; color: string; isDark: boolean }) {
  return (
    <View style={[s.pill, { borderColor: color + "40" }, isDark && { backgroundColor: color + "15" }]}>
      <View style={[s.dot, { backgroundColor: color }]} />
      <Text style={[s.pillLabel, isDark && s.dimDark]}>{label}</Text>
      <Text style={[s.pillValue, isDark && s.textDark]}>{compact(value)}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  container: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e5e5",
    backgroundColor: "#fafafa",
    gap: 8,
  },
  containerDark: {
    borderBottomColor: "#1a1a1a",
    backgroundColor: "#111111",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  costRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  tokens: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0a0a0a",
    fontVariant: ["tabular-nums"],
  },
  percent: {
    fontSize: 13,
    fontWeight: "500",
  },
  cost: {
    fontSize: 13,
    color: "#999999",
    fontVariant: ["tabular-nums"],
  },
  bar: {
    height: 4,
    borderRadius: 2,
    backgroundColor: "#e5e5e5",
    overflow: "hidden",
  },
  barDark: {
    backgroundColor: "#2a2a2a",
  },
  barFill: {
    height: "100%",
    borderRadius: 2,
  },
  barOk: { backgroundColor: "#3b82f6" },
  barMid: { backgroundColor: "#f59e0b" },
  barWarn: { backgroundColor: "#ef4444" },
  breakdown: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "#ffffff",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  pillLabel: {
    fontSize: 11,
    color: "#666666",
  },
  pillValue: {
    fontSize: 11,
    fontWeight: "600",
    color: "#0a0a0a",
    fontVariant: ["tabular-nums"],
  },
  meta: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  metaLabel: {
    fontSize: 11,
    color: "#999999",
  },
  metaValue: {
    fontSize: 11,
    fontWeight: "600",
    color: "#666666",
  },
  metaValueDark: {
    color: "#aaaaaa",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e5e5e5",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionDark: {
    backgroundColor: "#1a1a1a",
    borderColor: "#2a2a2a",
  },
  actionText: {
    fontSize: 12,
    color: "#666666",
    fontWeight: "500",
  },
  todos: { gap: 6, marginTop: 2 },
  todosTitle: { fontSize: 11, fontWeight: "700", color: "#999999", textTransform: "uppercase" },
  todoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  todoText: { flex: 1, fontSize: 12, color: "#666666" },
  textDark: { color: "#e5e5e5" },
  dimDark: { color: "#666666" },
})
