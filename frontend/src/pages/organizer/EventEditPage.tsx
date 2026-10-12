import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil, SearchX, ShieldX } from 'lucide-react'
import { useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'

import { getEvent, updateEvent, uploadEventBanner } from '../../api/eventos.api'
import { eventKeys } from '../../app/queryKeys'
import { Alert } from '../../components/common/Alert'
import { ErrorState } from '../../components/common/ErrorState'
import { LoadingSpinner } from '../../components/common/LoadingSpinner'
import { PagePlaceholder } from '../../components/common/PagePlaceholder'
import {
  EventForm,
  type EventFormSubmission,
} from '../../components/events/EventForm'
import { useAuth } from '../../hooks/useAuth'
import type { EventUpdatePayload } from '../../types/events'
import { getUserErrorMessage } from '../../utils/errors'
import styles from './EventFormPage.module.css'

interface EventEditLocationState {
  bannerUploadError?: string
}

export function EventEditPage() {
  const { id } = useParams()
  const eventId = Number(id)
  const hasValidId = Number.isSafeInteger(eventId) && eventId > 0
  const { user } = useAuth()
  const location = useLocation()
  const locationState = location.state as EventEditLocationState | null
  const queryClient = useQueryClient()
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [bannerUploadError, setBannerUploadError] = useState<string | null>(
    locationState?.bannerUploadError ?? null,
  )
  const eventQuery = useQuery({
    enabled: hasValidId,
    queryFn: ({ signal }) => getEvent(eventId, signal),
    queryKey: eventKeys.detail(eventId),
  })
  const event = eventQuery.data?.data

  async function handleUpdate(data: EventFormSubmission) {
    setSuccessMessage(null)
    setBannerUploadError(null)
    const payload: EventUpdatePayload = {}

    if (data.dirtyFields.nome) payload.nome = data.nome
    if (data.dirtyFields.descricao) payload.descricao = data.descricao
    if (data.dirtyFields.local) payload.local = data.local
    if (data.dirtyFields.data) payload.data = data.data

    if (Object.keys(payload).length > 0) {
      await updateEvent(eventId, payload)
    }

    if (data.banner) {
      try {
        await uploadEventBanner(eventId, data.banner)
      } catch (error) {
        await queryClient.invalidateQueries({ queryKey: eventKeys.all })
        setBannerUploadError(
          `Os dados foram salvos, mas o banner não foi enviado. Selecione o arquivo e tente novamente. ${getUserErrorMessage(error)}`,
        )
        return
      }
    }

    await queryClient.invalidateQueries({ queryKey: eventKeys.all })
    setSuccessMessage(
      Object.keys(payload).length === 0 && !data.banner
        ? 'Nenhuma alteração foi necessária.'
        : 'Evento atualizado com sucesso.',
    )
  }

  if (!hasValidId) {
    return (
      <PagePlaceholder
        actions={<Link to="/organizador/eventos">Voltar ao painel</Link>}
        description="O evento solicitado não foi encontrado."
        eyebrow="Evento inválido"
        icon={SearchX}
        title="Não encontramos este evento"
      />
    )
  }

  if (eventQuery.isPending) {
    return <LoadingSpinner fullPage label="Carregando evento para edição" />
  }

  if (eventQuery.isError) {
    return (
      <ErrorState
        description={getUserErrorMessage(eventQuery.error)}
        onRetry={() => void eventQuery.refetch()}
        title="Não foi possível carregar o evento"
      />
    )
  }

  if (!event) {
    return null
  }

  if (event.organizador_id !== user?.id) {
    return (
      <PagePlaceholder
        actions={<Link to="/organizador/eventos">Voltar ao painel</Link>}
        description="Somente o organizador responsável pode alterar este evento."
        eyebrow="Acesso negado"
        icon={ShieldX}
        title="Este evento não pertence à sua conta"
      />
    )
  }

  return (
    <section className={styles.page}>
      <Link className={styles.backLink} to="/organizador/eventos">
        <ArrowLeft aria-hidden="true" size={18} />
        Voltar ao painel
      </Link>
      <div className={styles.heading}>
        <span aria-hidden="true" className={styles.icon}>
          <Pencil size={28} />
        </span>
        <div>
          <p>Edição do evento</p>
          <h1>{event.nome}</h1>
          <span>Atualize os dados ou substitua o banner do evento.</span>
        </div>
      </div>
      {bannerUploadError && <Alert variant="error">{bannerUploadError}</Alert>}
      <div className={styles.card}>
        <EventForm
          initialEvent={event}
          mode="edit"
          onSubmit={handleUpdate}
          submitLabel="Salvar alterações"
          successMessage={successMessage}
        />
      </div>
    </section>
  )
}
