import { ImagePlus, X } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import type { ChangeEvent } from 'react'

import { Button } from '../common/Button'
import { EventBanner } from './EventBanner'
import styles from './BannerUpload.module.css'

const MAX_BANNER_SIZE = 5 * 1024 * 1024
const ACCEPTED_BANNER_TYPES = ['image/jpeg', 'image/png', 'image/webp']

interface BannerUploadProps {
  currentSource?: string | null
  error?: string | null
  eventName: string
  file: File | null
  onChange(file: File | null, error: string | null): void
}

export function BannerUpload({
  currentSource = null,
  error = null,
  eventName,
  file,
  onChange,
}: BannerUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  )

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.target.files?.[0] ?? null
    if (!selectedFile) {
      onChange(null, null)
      return
    }

    if (!ACCEPTED_BANNER_TYPES.includes(selectedFile.type)) {
      event.target.value = ''
      onChange(null, 'Escolha uma imagem JPEG, PNG ou WebP.')
      return
    }

    if (selectedFile.size > MAX_BANNER_SIZE) {
      event.target.value = ''
      onChange(null, 'A imagem deve ter no máximo 5 MB.')
      return
    }

    onChange(selectedFile, null)
  }

  const source = previewUrl ?? currentSource

  return (
    <div className={styles.field}>
      <div className={styles.labelGroup}>
        <label htmlFor="event-banner">Banner do evento</label>
        <span>Opcional · JPEG, PNG ou WebP · até 5 MB</span>
      </div>
      <div className={styles.uploadArea}>
        <div className={styles.preview}>
          <EventBanner
            key={source ?? 'event-banner-placeholder'}
            name={eventName || 'novo evento'}
            source={source}
          />
        </div>
        <div className={styles.controls}>
          <input
            accept={ACCEPTED_BANNER_TYPES.join(',')}
            aria-describedby={error ? 'event-banner-error' : 'event-banner-help'}
            aria-invalid={Boolean(error)}
            className={styles.fileInput}
            id="event-banner"
            onChange={handleFileChange}
            ref={inputRef}
            type="file"
          />
          <label className={styles.fileButton} htmlFor="event-banner">
            <ImagePlus aria-hidden="true" size={18} />
            {file ? 'Trocar imagem' : 'Escolher imagem'}
          </label>
          {file && (
            <Button
              onClick={() => {
                if (inputRef.current) {
                  inputRef.current.value = ''
                }
                onChange(null, null)
              }}
              variant="ghost"
            >
              <X aria-hidden="true" size={17} />
              Remover seleção
            </Button>
          )}
          <p className={styles.help} id="event-banner-help">
            O arquivo é enviado separadamente depois que os dados do evento são salvos.
          </p>
          {error && (
            <p className={styles.error} id="event-banner-error">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
