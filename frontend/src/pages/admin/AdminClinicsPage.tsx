import { useQuery } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminClinicsQuery } from '../../api/queries'
import type { AdminClinic } from '../../api/schema'
import { Button, EmptyState, LoadError, Spinner, Tabs, TextField } from '../../components/ui'
import { ClinicFormModal } from '../../features/admin/ClinicFormModal'
import { ClinicListItem } from '../../features/admin/ClinicListItem'
import { PageHeader } from '../../layouts/PageHeader'

type View = 'active' | 'archived'

function matches(clinic: AdminClinic, query: string): boolean {
  return clinic.name.toLowerCase().includes(query) || clinic.address.toLowerCase().includes(query)
}

export function AdminClinicsPage() {
  const navigate = useNavigate()
  const { data: clinics, isPending, refetch } = useQuery(adminClinicsQuery)
  const [view, setView] = useState<View>('active')
  const [search, setSearch] = useState('')
  const [adding, setAdding] = useState(false)

  const active = clinics?.filter((clinic) => clinic.archived_at === null) ?? []
  const archived = clinics?.filter((clinic) => clinic.archived_at !== null) ?? []
  const query = search.trim().toLowerCase()
  const shown = (view === 'active' ? active : archived).filter((clinic) => !query || matches(clinic, query))

  function emptyState() {
    if (clinics?.length === 0) {
      return <EmptyState title="Клиник пока нет" description="Добавьте первую клинику, затем создайте ей аккаунт." />
    }
    if (query) return <EmptyState title="Ничего не найдено" description="Попробуйте другое название или адрес." />
    return <EmptyState title={view === 'active' ? 'Активных клиник нет' : 'Скрытых клиник нет'} />
  }

  function content() {
    if (isPending) return <Spinner label="Загружаем клиники" />
    if (!clinics) return <LoadError title="Не удалось загрузить клиники" onRetry={() => void refetch()} />
    return (
      <div className="flex flex-col gap-4">
        <Tabs
          label="Клиники"
          value={view}
          onChange={setView}
          items={[
            { id: 'active', label: `Активные (${active.length})` },
            { id: 'archived', label: `Скрытые (${archived.length})` },
          ]}
        />
        <TextField
          label="Поиск по названию или адресу"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        {shown.length > 0 ? (
          <ul className="grid grid-cols-1 gap-3">
            {shown.map((clinic) => (
              <li key={clinic.id}>
                <ClinicListItem clinic={clinic} />
              </li>
            ))}
          </ul>
        ) : (
          emptyState()
        )}
      </div>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Администрирование"
        title="Клиники"
        description="Клиники, их аккаунты и часы работы."
        actions={
          <Button icon={Plus} onClick={() => setAdding(true)}>
            Добавить клинику
          </Button>
        }
      />
      <div className="max-w-2xl">{content()}</div>
      <ClinicFormModal
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(clinic) => {
          setAdding(false)
          navigate(`/admin/clinics/${clinic.id}`, { state: { notice: 'created' } })
        }}
      />
    </>
  )
}
