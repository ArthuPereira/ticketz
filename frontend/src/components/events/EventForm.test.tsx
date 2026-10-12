import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EventForm } from './EventForm'

describe('EventForm', () => {
  beforeEach(() => {
    const NativeURL = URL
    vi.stubGlobal(
      'URL',
      class MockURL extends NativeURL {
        static createObjectURL = vi.fn(() => 'blob:banner-preview')
        static revokeObjectURL = vi.fn()
      },
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('valida os campos obrigatórios antes de enviar', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()

    render(
      <EventForm mode="create" onSubmit={onSubmit} submitLabel="Criar evento" />,
    )
    await user.click(screen.getByRole('button', { name: 'Criar evento' }))

    expect(await screen.findByText('Informe o nome do evento.')).toBeInTheDocument()
    expect(screen.getByText('Informe o local do evento.')).toBeInTheDocument()
    expect(screen.getByText('Informe a data e a hora do evento.')).toBeInTheDocument()
    expect(screen.getByText('Informe o total de ingressos.')).toBeInTheDocument()
    expect(screen.getByLabelText('Nome')).toHaveFocus()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('converte datetime-local para ISO e normaliza descrição vazia', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()

    render(
      <EventForm mode="create" onSubmit={onSubmit} submitLabel="Criar evento" />,
    )
    await user.type(screen.getByLabelText('Nome'), 'Festival Ticketz')
    await user.type(screen.getByLabelText('Local'), 'Campus do Pici')
    await user.type(screen.getByLabelText('Data e hora'), '2099-12-01T20:00')
    await user.type(screen.getByLabelText('Total de ingressos'), '500')
    await user.click(screen.getByRole('button', { name: 'Criar evento' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        banner: null,
        data: new Date('2099-12-01T20:00').toISOString(),
        descricao: null,
        local: 'Campus do Pici',
        nome: 'Festival Ticketz',
        totalIngressos: 500,
      }),
    )
  })

  it('rejeita formato e tamanho inválidos do banner no cliente', () => {
    render(
      <EventForm mode="create" onSubmit={vi.fn()} submitLabel="Criar evento" />,
    )
    const input = screen.getByLabelText('Banner do evento')
    fireEvent.change(input, {
      target: {
        files: [new File(['pdf'], 'banner.pdf', { type: 'application/pdf' })],
      },
    })
    expect(screen.getByText('Escolha uma imagem JPEG, PNG ou WebP.')).toBeInTheDocument()

    const largeFile = new File(['image'], 'banner.png', { type: 'image/png' })
    Object.defineProperty(largeFile, 'size', { value: 5 * 1024 * 1024 + 1 })
    fireEvent.change(input, { target: { files: [largeFile] } })
    expect(screen.getByText('A imagem deve ter no máximo 5 MB.')).toBeInTheDocument()
  })
})
