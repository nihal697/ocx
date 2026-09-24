// Connection types for multiple server support
export type ConnectionType = "local" | "tunnel" | "cloud"

// Wire protocol the server speaks — see src/lib/server-protocol.ts.
// v1 serves the API at the URL root (/global/health, /session, …);
// v2 serves it under /api (/api/health, /api/session, …).
import type { ServerProtocol } from "./sdk"
export type { ServerProtocol } from "./sdk"

export interface ServerConnection {
  id: string
  name: string
  type: ConnectionType
  url: string
  // For auth
  username?: string
  // Password stored separately in SecureStore
  // Negotiated opencode wire protocol. Optional so connections stored
  // before protocol detection existed keep working as v1 (the previous
  // behavior); set by testConnection()/addConnection after probing.
  protocol?: ServerProtocol
  // Directory to use for this connection
  directory?: string
  // When last successfully connected
  lastConnected?: number
  // Is this the active connection?
  active?: boolean
}

export interface AppSettings {
  // Require biometric auth to open app
  requireBiometric: boolean
  // Require biometric to send messages
  requireBiometricForMessages: boolean
  // Theme preference
  theme: "light" | "dark" | "system"
  // Show notifications for task completion
  notifications: boolean
}

// Re-export SDK types we'll use frequently
export type { Session, Message, Part, Project, Event, HealthResponse } from "./sdk"
