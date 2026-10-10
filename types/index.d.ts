export type QuotaWindow = { kind: string; percentUsed: number; resetsAt?: string }

declare module 'claude-code' {
  interface PluginState {
    'usage-tracker': { windows: QuotaWindow[] }
  }
}
