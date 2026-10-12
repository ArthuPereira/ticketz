import { zodResolver } from '@hookform/resolvers/zod'
import { Save } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import type { FieldNamesMarkedBoolean } from 'react-hook-form'
import { z } from 'zod'

import type { Event } from '../../types/events'
import { formatDateTimeLocal } from '../../utils/date'
import { getApiFieldErrors, getUserErrorMessage } from '../../utils/errors'
import { Alert } from '../common/Alert'
import { Button } from '../common/Button'
import { BannerUpload } from './BannerUpload'
import styles from './EventForm.module.css'

const baseEventFormSchema = z.object({
  data: z.string().min(1, 'Informe a data e a hora do evento.'),
  descricao: z.string(),
  local: z
    .string()
    .trim()
    .min(1, 'Informe o local do evento.')
    .max(150, 'Use no máximo 150 caracteres.'),
  nome: z
    .string()
    .trim()
    .min(1, 'Informe o nome do evento.')
    .max(150, 'Use no máximo 150 caracteres.'),
  total_ingressos: z
    .string()
    .min(1, 'Informe o total de ingressos.')
    .regex(/^\d+$/, 'Informe um número inteiro maior que zero.')
    .refine((value) => Number(value) > 0, 'Informe um número inteiro maior que zero.'),
})

type EventFormValues = z.infer<typeof baseEventFormSchema>

export interface EventFormSubmission {
  banner: File | null
  data: string
  descricao: string | null
  dirtyFields: FieldNamesMarkedBoolean<EventFormValues>
  local: string
  nome: string
  totalIngressos: number
}

interface EventFormProps {
  initialEvent?: Event
  mode: 'create' | 'edit'
  onSubmit(data: EventFormSubmission): Promise<void>
  submitLabel: string
  successMessage?: string | null
}

function getSchema(initialDate: string | undefined) {
  return baseEventFormSchema.superRefine((values, context) => {
    const timestamp = new Date(values.data).getTime()
    if (!Number.isFinite(timestamp)) {
      context.addIssue({
        code: 'custom',
        message: 'Informe uma data e hora válidas.',
        path: ['data'],
      })
      return
    }

    if (values.data !== initialDate && timestamp <= Date.now()) {
      context.addIssue({
        code: 'custom',
        message: 'A data do evento deve ser futura.',
        path: ['data'],
      })
    }
  })
}

export function EventForm({
  initialEvent,
  mode,
  onSubmit,
  submitLabel,
  successMessage = null,
}: EventFormProps) {
  const initialDate = initialEvent
    ? formatDateTimeLocal(initialEvent.data)
    : undefined
  const schema = useMemo(() => getSchema(initialDate), [initialDate])
  const [banner, setBanner] = useState<File | null>(null)
  const [bannerError, setBannerError] = useState<string | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const {
    control,
    formState: { dirtyFields, errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<EventFormValues>({
    defaultValues: {
      data: initialDate ?? '',
      descricao: initialEvent?.descricao ?? '',
      local: initialEvent?.local ?? '',
      nome: initialEvent?.nome ?? '',
      total_ingressos: initialEvent ? String(initialEvent.total_ingressos) : '',
    },
    resolver: zodResolver(schema),
  })

  async function handleValidSubmit(values: EventFormValues) {
    if (bannerError) {
      return
    }

    setSubmitError(null)
    try {
      await onSubmit({
        banner,
        data: new Date(values.data).toISOString(),
        descricao: values.descricao.trim() || null,
        dirtyFields,
        local: values.local,
        nome: values.nome,
        totalIngressos: Number(values.total_ingressos),
      })
      reset(values)
      setBanner(null)
    } catch (error) {
      const fieldErrors = getApiFieldErrors(error)
      Object.entries(fieldErrors).forEach(([field, message]) => {
        if (
          field === 'nome' ||
          field === 'descricao' ||
          field === 'local' ||
          field === 'data' ||
          field === 'total_ingressos'
        ) {
          setError(field, { message, type: 'server' })
        }
      })
      setSubmitError(getUserErrorMessage(error))
    }
  }

  const eventName = useWatch({ control, name: 'nome' })

  return (
    <form className={styles.form} noValidate onSubmit={handleSubmit(handleValidSubmit)}>
      {successMessage && <Alert variant="success">{successMessage}</Alert>}
      {submitError && <Alert variant="error">{submitError}</Alert>}

      <div className={styles.fieldGrid}>
        <div className={styles.fieldWide}>
          <label htmlFor="event-name">Nome</label>
          <input
            aria-describedby={errors.nome ? 'event-name-error' : undefined}
            aria-invalid={Boolean(errors.nome)}
            id="event-name"
            maxLength={150}
            type="text"
            {...register('nome')}
          />
          {errors.nome && <p id="event-name-error">{errors.nome.message}</p>}
        </div>

        <div className={styles.fieldWide}>
          <label htmlFor="event-description">Descrição</label>
          <textarea
            aria-describedby={errors.descricao ? 'event-description-error' : undefined}
            aria-invalid={Boolean(errors.descricao)}
            id="event-description"
            rows={5}
            {...register('descricao')}
          />
          {errors.descricao && (
            <p id="event-description-error">{errors.descricao.message}</p>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor="event-location">Local</label>
          <input
            aria-describedby={errors.local ? 'event-location-error' : undefined}
            aria-invalid={Boolean(errors.local)}
            id="event-location"
            maxLength={150}
            type="text"
            {...register('local')}
          />
          {errors.local && <p id="event-location-error">{errors.local.message}</p>}
        </div>

        <div className={styles.field}>
          <label htmlFor="event-date">Data e hora</label>
          <input
            aria-describedby={errors.data ? 'event-date-error' : undefined}
            aria-invalid={Boolean(errors.data)}
            id="event-date"
            type="datetime-local"
            {...register('data')}
          />
          {errors.data && <p id="event-date-error">{errors.data.message}</p>}
        </div>

        <div className={styles.field}>
          <label htmlFor="event-total">Total de ingressos</label>
          <input
            aria-describedby={
              mode === 'edit'
                ? 'event-total-help'
                : errors.total_ingressos
                  ? 'event-total-error'
                  : undefined
            }
            aria-invalid={Boolean(errors.total_ingressos)}
            id="event-total"
            inputMode="numeric"
            min="1"
            readOnly={mode === 'edit'}
            type="number"
            {...register('total_ingressos')}
          />
          {mode === 'edit' && (
            <p className={styles.help} id="event-total-help">
              O lote original não pode ser alterado nesta versão.
            </p>
          )}
          {errors.total_ingressos && (
            <p id="event-total-error">{errors.total_ingressos.message}</p>
          )}
        </div>
      </div>

      <BannerUpload
        currentSource={initialEvent?.banner_url}
        error={bannerError}
        eventName={eventName}
        file={banner}
        onChange={(file, error) => {
          setBanner(file)
          setBannerError(error)
        }}
      />

      <div className={styles.actions}>
        <Button isLoading={isSubmitting} type="submit">
          <Save aria-hidden="true" size={18} />
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
