import { create } from "zustand"
import { useConnections } from "./connections"
import type { Agent, Command } from "../lib/sdk"
import { chooseModelSelection } from "../lib/model-selection"

export interface ProviderModel {
  id: string
  name: string
  reasoning: boolean
  attachment: boolean
  limit?: { context: number; output: number }
  variants?: Record<string, { reasoningEffort?: string }>
}

export interface Provider {
  id: string
  name: string
  connected: boolean
  models: ProviderModel[]
}

export interface ModelSelection {
  providerID: string
  modelID: string
}

interface PerDirectoryCatalog {
  agents: Agent[]
  commands: Command[]
  providers: Provider[]
  defaults: Record<string, string>
  agent: string
  model: ModelSelection | null
  variant: string | null
  loaded: boolean
}

function sameModel(left: ModelSelection | null, right: ModelSelection | null) {
  return left?.providerID === right?.providerID && left?.modelID === right?.modelID
}

interface CatalogState {
  // Global (directory-less) catalog for connections screen etc.
  global: PerDirectoryCatalog
  // Per-directory catalogs
  byDirectory: Record<string, PerDirectoryCatalog>

  // Actions
  load: (directory?: string) => Promise<void>
  getCatalog: (directory?: string) => PerDirectoryCatalog
  setAgent: (directory: string | undefined, name: string) => void
  setModel: (directory: string | undefined, selection: ModelSelection | null) => void
  setVariant: (directory: string | undefined, variant: string | null) => void
  cycleAgent: (directory: string | undefined, direction?: 1 | -1) => void
}

const emptyCatalog: PerDirectoryCatalog = {
  agents: [],
  commands: [],
  providers: [],
  defaults: {},
  agent: "",
  model: null,
  variant: null,
  loaded: false,
}

export const useCatalog = create<CatalogState>((set, get) => ({
  global: emptyCatalog,
  byDirectory: {},

  load: async (directory) => {
    const connState = useConnections.getState()
    const client = directory
      ? connState.clientForDirectory(directory) ?? connState.client
      : connState.client
    if (!client) return

    const [agentResult, commandResult, providerResult] = await Promise.all([
      client.agent.list().catch(() => [] as Agent[]),
      client.command.list().catch(() => [] as Command[]),
      client.provider.list().catch(() => null),
    ])

    const agents = Array.isArray(agentResult) ? agentResult : []
    const commands = Array.isArray(commandResult) ? commandResult : []

    const raw = providerResult
    const connected = new Set(Array.isArray(raw?.connected) ? raw.connected : [])
    const defaults = raw?.default || {}
    const providers: Provider[] = Array.isArray(raw?.all)
      ? raw.all
          .filter((p) => connected.has(p.id))
          .map((p) => ({
            id: p.id,
            name: p.name || p.id,
            connected: connected.has(p.id),
            models: Object.values(p.models || {})
              .filter((m) => m.status !== "deprecated")
              .map((m) => ({
                id: m.id,
                name: m.name || m.id,
                reasoning: m.reasoning ?? false,
                attachment: m.attachment ?? false,
                limit: m.limit,
                variants: m.variants,
              })),
          }))
          .filter((p) => p.models.length > 0)
      : []

    const visible = agents.filter((a) => !a.hidden)

    const currentCatalog = directory
      ? get().byDirectory[directory] || emptyCatalog
      : get().global
    const current = currentCatalog.agent
    const agent = current && visible.some((a) => a.name === current) ? current : visible[0]?.name || "build"

    const existing = currentCatalog.model
    const defaultAgent = visible[0]
    const model = chooseModelSelection({
      providers,
      defaults,
      existing,
      agentModel: defaultAgent?.model || null,
    })

    const newCatalog: PerDirectoryCatalog = {
      agents: visible,
      commands,
      providers,
      defaults,
      agent,
      model,
      variant: sameModel(currentCatalog.model, model) ? currentCatalog.variant : null,
      loaded: true,
    }

    if (directory) {
      set((state) => ({
        byDirectory: { ...state.byDirectory, [directory]: newCatalog },
      }))
    } else {
      set((state) => ({
        global: newCatalog,
      }))
    }
  },

  getCatalog: (directory) => {
    if (directory) {
      return get().byDirectory[directory] || emptyCatalog
    }
    return get().global
  },

  setAgent: (directory, name) => {
    const catalog = directory
      ? get().byDirectory[directory] || emptyCatalog
      : get().global
    const match = catalog.agents.find((a) => a.name === name)
    if (!match) return
    const model = match.model || catalog.model
    const newCatalog = {
      ...catalog,
      agent: name,
      model,
      variant: sameModel(catalog.model, model) ? catalog.variant : null,
    }
    if (directory) {
      set((state) => ({
        byDirectory: { ...state.byDirectory, [directory]: newCatalog },
      }))
    } else {
      set((state) => ({
        global: newCatalog,
      }))
    }
  },

  setModel: (directory, selection) => {
    const catalog = directory
      ? get().byDirectory[directory] || emptyCatalog
      : get().global
    const newCatalog = {
      ...catalog,
      model: selection,
      variant: sameModel(catalog.model, selection) ? catalog.variant : null,
    }
    if (directory) {
      set((state) => ({
        byDirectory: { ...state.byDirectory, [directory]: newCatalog },
      }))
    } else {
      set((state) => ({
        global: newCatalog,
      }))
    }
  },

  setVariant: (directory, variant) => {
    const catalog = directory
      ? get().byDirectory[directory] || emptyCatalog
      : get().global
    const newCatalog = { ...catalog, variant }
    if (directory) {
      set((state) => ({
        byDirectory: { ...state.byDirectory, [directory]: newCatalog },
      }))
    } else {
      set((state) => ({
        global: newCatalog,
      }))
    }
  },

  cycleAgent: (directory, direction = 1) => {
    const catalog = directory
      ? get().byDirectory[directory] || emptyCatalog
      : get().global
    const primary = catalog.agents.filter((a) => (a.mode ?? "all") !== "subagent")
    if (primary.length < 2) return
    const idx = primary.findIndex((a) => a.name === catalog.agent)
    const next = (idx + direction + primary.length) % primary.length
    get().setAgent(directory, primary[next].name)
  },
}))