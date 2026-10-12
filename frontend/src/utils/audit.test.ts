import { describe, expect, it } from 'vitest'

import type { ActionLog } from '../types/audit'
import { getAuditActionLabel, getAuditChanges, getAuditSummary } from './audit'

const updateLog: ActionLog = {
  acao: 'UPDATE_EVENT',
  dados: {
    antes: { local: 'Pici', nome: 'Nome antigo', total_ingressos: 500 },
    depois: { local: 'Pici', nome: 'Nome novo', total_ingressos: 500 },
  },
  entidade: 'evento#42',
  sk: '2026-10-12T12:00:00Z#abc',
  timestamp: '2026-10-12T12:00:00Z',
  usuario_id: 3,
}

describe('utilitários de auditoria', () => {
  it('mapeia as ações conhecidas para nomes amigáveis', () => {
    expect(getAuditActionLabel('CREATE_EVENT')).toBe('Evento criado')
    expect(getAuditActionLabel('UPLOAD_BANNER')).toBe('Banner atualizado')
  })

  it('mostra somente os campos realmente alterados com antes e depois', () => {
    expect(getAuditChanges(updateLog)).toEqual([
      {
        after: 'Nome novo',
        before: 'Nome antigo',
        field: 'nome',
        label: 'Nome',
      },
    ])
    expect(getAuditSummary(updateLog)).toBe('1 campo foi alterado.')
  })

  it('resume os dados relevantes da criação', () => {
    expect(
      getAuditSummary({
        ...updateLog,
        acao: 'CREATE_EVENT',
        dados: {
          local: 'Campus do Pici',
          nome: 'Festival Ticketz',
          total_ingressos: 500,
        },
      }),
    ).toBe('Evento “Festival Ticketz” criado em Campus do Pici, com 500 ingressos.')
  })
})
