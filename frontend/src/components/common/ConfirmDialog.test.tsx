import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ConfirmDialog } from './ConfirmDialog'

function DialogHarness({ onConfirm = vi.fn() }: { onConfirm?: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button onClick={() => setOpen(true)} type="button">
        Abrir confirmação
      </button>
      <ConfirmDialog
        confirmLabel="Excluir"
        onCancel={() => setOpen(false)}
        onConfirm={onConfirm}
        open={open}
        title="Excluir item"
      >
        <p>Esta ação precisa de confirmação.</p>
      </ConfirmDialog>
    </>
  )
}

describe('ConfirmDialog', () => {
  it('foca a ação segura, mantém o foco no diálogo e o devolve ao fechar', async () => {
    const user = userEvent.setup()

    render(<DialogHarness />)

    const opener = screen.getByRole('button', { name: 'Abrir confirmação' })
    await user.click(opener)

    const dialog = screen.getByRole('dialog', { name: 'Excluir item' })
    const cancel = screen.getByRole('button', { name: 'Cancelar' })
    const confirm = screen.getByRole('button', { name: 'Excluir' })

    expect(dialog).toHaveAccessibleDescription(
      'Esta ação precisa de confirmação.',
    )
    expect(cancel).toHaveFocus()

    await user.tab({ shift: true })
    expect(confirm).toHaveFocus()
    await user.tab()
    expect(cancel).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })
})
