/* ═══════════════════════════════════════════════════
   hecate/src/store/index.ts
   ═══════════════════════════════════════════════════ */

import { create } from 'zustand'

// ── Types ─────────────────────────────────────────────

export interface Callback {
  id: number
  display_id: number
  host: string
  user: string
  pid: number
  ip: string
  os: string
  architecture: string
  domain: string
  integrity_level: number
  sleep_info: string
  description: string
  active: boolean
  locked: boolean
  last_checkin: string
  init_callback: string
  payload: {
    payloadtype: { name: string }
    description: string
  }
  callbackc2profiles: Array<{ c2profile: { name: string } }>
  operation: { name: string }
}

export interface Task {
  id: number
  display_id: number
  command_name: string
  params: string
  status: string
  timestamp: string
  completed: boolean
  operator: { username: string }
  callback: { id: number; display_id: number; host: string }
  responses: Array<{ id: number; response: string; timestamp: string }>
}

export interface Operation {
  id: number
  name: string
}

// ── Store ─────────────────────────────────────────────

interface HecateStore {
  // Auth
  token: string | null
  setToken: (t: string | null) => void

  // Active operation
  activeOperation: Operation | null
  setActiveOperation: (op: Operation | null) => void

  // Selected callback (left sidebar)
  selectedCallbackId: number | null
  setSelectedCallbackId: (id: number | null) => void

  // Callbacks list (populated by subscription)
  callbacks: Callback[]
  setCallbacks: (cbs: Callback[]) => void

  // UI state
  activeRailView: 'callbacks' | 'payloads' | 'credentials' | 'files' | 'attack' | 'logs'
  setActiveRailView: (v: HecateStore['activeRailView']) => void
}

export const useStore = create<HecateStore>((set) => ({
  token: sessionStorage.getItem('hecate_token'),
  setToken: (token) => {
    if (token) sessionStorage.setItem('hecate_token', token)
    else sessionStorage.removeItem('hecate_token')
    set({ token })
  },

  activeOperation: null,
  setActiveOperation: (op) => set({ activeOperation: op, selectedCallbackId: null }),

  selectedCallbackId: null,
  setSelectedCallbackId: (id) => set({ selectedCallbackId: id }),

  callbacks: [],
  setCallbacks: (callbacks) => set({ callbacks }),

  activeRailView: 'callbacks',
  setActiveRailView: (v) => set({ activeRailView: v }),
}))

// ── Derived selectors ─────────────────────────────────

export const useSelectedCallback = () =>
  useStore((s) => s.callbacks.find((c) => c.id === s.selectedCallbackId) ?? null)

export const useAliveCallbacks = () =>
  useStore((s) => s.callbacks.filter((c) => c.active))
