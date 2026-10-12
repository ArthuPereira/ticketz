import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { AppShell } from './AppShell'

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    isAuthenticated: false,
    isOrganizer: false,
    isRestoring: false,
    logout: vi.fn(),
    user: null,
  }),
}))

describe('AppShell', () => {
  it('oferece salto de conteúdo e move o foco nas mudanças de rota', async () => {
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/primeira']}>
        <Routes>
          <Route element={<AppShell />}>
            <Route
              element={
                <>
                  <h1>Primeira página</h1>
                  <Link to="/segunda">Ir para a segunda</Link>
                </>
              }
              path="primeira"
            />
            <Route element={<h1>Segunda página</h1>} path="segunda" />
          </Route>
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Pular para o conteúdo' })).toHaveAttribute(
      'href',
      '#main-content',
    )

    await user.click(screen.getByRole('link', { name: 'Ir para a segunda' }))

    expect(screen.getByRole('main')).toHaveFocus()
    expect(screen.getByRole('heading', { name: 'Segunda página' })).toBeInTheDocument()
  })
})
