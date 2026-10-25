import { Pencil } from 'lucide-react'
import { useState } from 'react'
import type { AdminClinic } from '../../api/schema'
import { Button, Card } from '../../components/ui'
import { ClinicFormModal } from './ClinicFormModal'
import { formatPhone, formatWorkDays } from './clinic-format'

export function ClinicDetailsSection({
  clinic,
  onStatus,
}: {
  clinic: AdminClinic
  onStatus: (message: string) => void
}) {
  const [editing, setEditing] = useState(false)

  function startEditing() {
    // Старое сообщение не висит над открытой формой, а тот же текст после следующего сохранения озвучится заново.
    onStatus('')
    setEditing(true)
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-extrabold">Данные клиники</h2>
        <Button variant="secondary" size="sm" icon={Pencil} onClick={startEditing}>
          Изменить
        </Button>
      </div>
      <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-[9rem_1fr]">
        <dt className="text-sm text-ink-muted">Адрес</dt>
        <dd className="font-bold break-words">{clinic.address}</dd>
        <dt className="text-sm text-ink-muted">Телефон</dt>
        <dd className="font-bold">{formatPhone(clinic.phone)}</dd>
        <dt className="text-sm text-ink-muted">Часы работы</dt>
        <dd className="font-bold">{`${clinic.opens_at}–${clinic.closes_at}`}</dd>
        <dt className="text-sm text-ink-muted">Рабочие дни</dt>
        <dd className="font-bold">{formatWorkDays(clinic.work_days)}</dd>
      </dl>
      <ClinicFormModal
        open={editing}
        clinic={clinic}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false)
          onStatus('Данные клиники сохранены.')
        }}
      />
    </Card>
  )
}
