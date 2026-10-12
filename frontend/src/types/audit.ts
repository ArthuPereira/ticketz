export interface ActionLog {
  entidade: string
  sk: string
  acao: string
  usuario_id: number | null
  dados: Record<string, unknown> | null
  timestamp: string
}

export interface ActionLogPage {
  items: ActionLog[]
  cursor: string | null
}

export interface ActionLogListParams {
  limit: number
  cursor?: string | null
}
