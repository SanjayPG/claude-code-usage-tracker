export type QuotaWindow = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'quota-band': { windows: QuotaWindow[] }
  }
}
