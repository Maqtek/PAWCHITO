import { useQueryClient } from '@tanstack/react-query'
import { ImageUp } from 'lucide-react'
import { useId, useState, type ChangeEvent } from 'react'
import { api } from '../../api/client'
import { errorMessage } from '../../api/error-messages'
import { ApiError } from '../../api/errors'
import { outcomeLimits } from '../../api/limits'
import { unwrap } from '../../api/queries'
import { REQUEST_TIMEOUT_MS } from '../../api/session'
import { buttonClass, FormAlert } from '../../components/ui'

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']

/** Фото питомца от клиники после приёма (БП §6.4): одно на питомца, новое заменяет старое. */
export function PetPhotoUpload({ petId, onStatus }: { petId: number; onStatus: (message: string) => void }) {
  const queryClient = useQueryClient()
  const inputId = useId()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Тот же файл можно выбрать снова — например, после ошибки сети.
    event.target.value = ''
    if (!file || uploading) return
    onStatus('')
    setError(null)
    // Сервер проверит ещё раз — по содержимому, а не по расширению (Р-58).
    if (!ACCEPTED.includes(file.type)) return setError('Фото — JPEG, PNG или WebP.')
    if (file.size > outcomeLimits.photoBytesMax) return setError('Фото больше 5 МБ — выберите поменьше.')
    setUploading(true)
    try {
      await unwrap(
        api.PUT('/clinic/pets/{pet_id}/photo', {
          params: { path: { pet_id: petId } },
          body: { file },
          // multipart/form-data: заголовок с границей ставит сам браузер.
          bodySerializer: (body) => {
            const form = new FormData()
            form.append('file', body.file)
            return form
          },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        }),
      )
      onStatus('Фото обновлено. Владелец получит уведомление.')
    } catch (failure) {
      setError(
        failure instanceof ApiError && (failure.status === 413 || failure.status === 415 || failure.status === 403)
          ? `${failure.detail}.`
          : errorMessage(failure),
      )
    } finally {
      setUploading(false)
      void queryClient.invalidateQueries({ queryKey: ['clinic', 'pets', petId] })
    }
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <label htmlFor={inputId} className={buttonClass({ variant: 'secondary', size: 'sm' })} aria-disabled={uploading}>
        <ImageUp aria-hidden className="size-4" />
        {uploading ? 'Загружаем фото…' : 'Загрузить фото'}
      </label>
      <input
        id={inputId}
        type="file"
        accept={ACCEPTED.join(',')}
        className="sr-only"
        onChange={(event) => void upload(event)}
      />
      <p className="text-xs text-ink-muted">JPEG, PNG или WebP до 5 МБ — заменит прежнее фото.</p>
      <FormAlert message={error} />
    </div>
  )
}
