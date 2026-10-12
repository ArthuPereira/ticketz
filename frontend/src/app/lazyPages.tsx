import { lazy } from 'react'

export const EventDetailsPage = lazy(() =>
  import('../pages/EventDetailsPage').then(({ EventDetailsPage }) => ({
    default: EventDetailsPage,
  })),
)
export const HomePage = lazy(() =>
  import('../pages/HomePage').then(({ HomePage }) => ({ default: HomePage })),
)
export const LoginPage = lazy(() =>
  import('../pages/LoginPage').then(({ LoginPage }) => ({ default: LoginPage })),
)
export const MyTicketsPage = lazy(() =>
  import('../pages/MyTicketsPage').then(({ MyTicketsPage }) => ({
    default: MyTicketsPage,
  })),
)
export const NotFoundPage = lazy(() =>
  import('../pages/NotFoundPage').then(({ NotFoundPage }) => ({
    default: NotFoundPage,
  })),
)
export const RegisterPage = lazy(() =>
  import('../pages/RegisterPage').then(({ RegisterPage }) => ({
    default: RegisterPage,
  })),
)
export const EventAuditPage = lazy(() =>
  import('../pages/organizer/EventAuditPage').then(({ EventAuditPage }) => ({
    default: EventAuditPage,
  })),
)
export const EventCreatePage = lazy(() =>
  import('../pages/organizer/EventCreatePage').then(({ EventCreatePage }) => ({
    default: EventCreatePage,
  })),
)
export const EventEditPage = lazy(() =>
  import('../pages/organizer/EventEditPage').then(({ EventEditPage }) => ({
    default: EventEditPage,
  })),
)
export const OrganizerEventsPage = lazy(() =>
  import('../pages/organizer/OrganizerEventsPage').then(
    ({ OrganizerEventsPage }) => ({ default: OrganizerEventsPage }),
  ),
)
export const TicketDetailsPage = lazy(() =>
  import('../pages/tickets/TicketDetailsPage').then(({ TicketDetailsPage }) => ({
    default: TicketDetailsPage,
  })),
)
