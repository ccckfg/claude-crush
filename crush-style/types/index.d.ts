export type FileChange = { path: string; added: number; removed: number }

export type TodoItem = {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm: string
}

export type LimitInfo = { kind: string; percentUsed: number }

export type UsageInfo = {
  percent: number | null
  tokens: number | null
  window: number
  usd: number | null
  limits: LimitInfo[]
}

declare module 'claude-code' {
  interface PluginState {
    'crush-style': {
      /** Animation frame, ticked while a turn runs. */
      frame: number
      /** `$.clock.now()` when the running turn began; 0 while idle. */
      turnStartedAt: number
      /** Files the session changed, newest first. */
      files: FileChange[]
      /** Tool calls made, by tool name. */
      tools: Record<string, number>
      /** The model's latest to-do list. */
      todos: TodoItem[]
      /** The first prompt, shortened: the session's title. */
      title: string
      /** The current git branch; '' outside a repository. */
      branch: string
      /** The model id, as /model shows it. */
      model: string
      /** Context, cost and rate-limit figures, as the status line has them. */
      usage: UsageInfo | null
    }
  }
}
