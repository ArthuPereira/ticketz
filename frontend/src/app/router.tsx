import { createBrowserRouter } from 'react-router-dom'

import { OrganizerRoute } from '../auth/OrganizerRoute'
import { ProtectedRoute } from '../auth/ProtectedRoute'
import { AppShell } from '../components/layout/AppShell'
import {
  EventAuditPage,
  EventCreatePage,
  EventDetailsPage,
  EventEditPage,
  HomePage,
  LoginPage,
  MyTicketsPage,
  NotFoundPage,
  OrganizerEventsPage,
  RegisterPage,
  TicketDetailsPage,
} from './lazyPages'

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'eventos/:id', element: <EventDetailsPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'cadastro', element: <RegisterPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          { path: 'meus-ingressos', element: <MyTicketsPage /> },
          { path: 'meus-ingressos/:id', element: <TicketDetailsPage /> },
          {
            element: <OrganizerRoute />,
            children: [
              { path: 'organizador/eventos', element: <OrganizerEventsPage /> },
              { path: 'organizador/eventos/novo', element: <EventCreatePage /> },
              {
                path: 'organizador/eventos/:id/editar',
                element: <EventEditPage />,
              },
              {
                path: 'organizador/eventos/:id/logs',
                element: <EventAuditPage />,
              },
            ],
          },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
