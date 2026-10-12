import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, CirclePlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useNavigate } from 'react-router-dom'

import { createEvent, uploadEventBanner } from '../../api/eventos.api'
import { eventKeys } from '../../app/queryKeys'
import {
  EventForm,
  type EventFormSubmission,
} from '../../components/events/EventForm'
import { getUserErrorMessage } from '../../utils/errors'
import styles from './EventFormPage.module.css'

export function EventCreatePage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  async function handleCreate(data: EventFormSubmission) {
    const event = await createEvent({
      data: data.data,
      descricao: data.descricao,
      local: data.local,
      nome: data.nome,
      total_ingressos: data.totalIngressos,
    })

    await queryClient.invalidateQueries({ queryKey: eventKeys.all })

    if (data.banner) {
      try {
        await uploadEventBanner(event.id, data.banner)
        await queryClient.invalidateQueries({ queryKey: eventKeys.all })
      } catch (error) {
        navigate(`/organizador/eventos/${event.id}/editar`, {
          replace: true,
          state: {
            bannerUploadError: `O evento foi criado, mas o banner não foi enviado. Tente novamente nesta página. ${getUserErrorMessage(error)}`,
          },
        })
        return
      }
    }

    navigate('/organizador/eventos', {
      replace: true,
      state: { successMessage: 'Evento criado com sucesso.' },
    })
  }

  return (
    <section className={styles.page}>
      <Link className={styles.backLink} to="/organizador/eventos">
        <ArrowLeft aria-hidden="true" size={18} />
        Voltar ao painel
      </Link>
      <div className={styles.heading}>
        <span aria-hidden="true" className={styles.icon}>
          <CirclePlus size={28} />
        </span>
        <div>
          <p>Novo evento</p>
          <h1>Criar evento</h1>
          <span>Preencha os detalhes e escolha uma imagem para apresentar seu evento.</span>
        </div>
      </div>
      <div className={styles.card}>
        <EventForm
          mode="create"
          onSubmit={handleCreate}
          submitLabel="Criar evento"
        />
      </div>
    </section>
  )
}
