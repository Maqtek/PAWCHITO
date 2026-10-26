import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useDeferredValue, useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ApiError } from '../../api/errors'
import { adminClinicQuery } from '../../api/queries'
import { Badge, EmptyState, linkClass, LoadError, Spinner } from '../../components/ui'
import { ClinicAccountSection } from '../../features/admin/ClinicAccountSection'
import { ClinicArchiveSection } from '../../features/admin/ClinicArchiveSection'
import { ClinicDetailsSection } from '../../features/admin/ClinicDetailsSection'
import { PageHeader } from '../../layouts/PageHeader'

const notices: Record<string, string> = {
  created: 'Клиника добавлена. Создайте аккаунт, чтобы клиника могла войти.',
}

// Только десятичное целое без знака, дробной части, «0x» и пробелов; огромные числа сразу считаем несуществующими.
const CLINIC_ID = /^[1-9]\d{0,8}$/

function noticeFrom(state: unknown): string {
  const notice = (state as { notice?: unknown } | null)?.notice
  return typeof notice === 'string' && Object.hasOwn(notices, notice) ? notices[notice] : ''
}

export function AdminClinicPage() {
  const { clinicId } = useParams()
  const valid = CLINIC_ID.test(clinicId ?? '')
  const id = Number(clinicId)
  const location = useLocation()
  const navigate = useNavigate()
  const [status, setStatus] = useState(() => noticeFrom(location.state))
  const { data: clinic, error, isPending, refetch } = useQuery({ ...adminClinicQuery(id), enabled: valid })

  // Сообщение из state показываем один раз: после перезагрузки страницы оно не повторится.
  useEffect(() => {
    if (location.state !== null) navigate(location, { replace: true, state: null })
  }, [location, navigate])

  let header: ReactNode = null
  let message = ''
  let content: ReactNode
  if (!valid || (error instanceof ApiError && error.status === 404)) {
    content = (
      <EmptyState
        className="mt-6"
        title="Клиника не найдена"
        description="Возможно, ссылка устарела."
        action={
          <Link to="/admin/clinics" className={linkClass}>
            К списку клиник
          </Link>
        }
      />
    )
  } else if (isPending) {
    content = <Spinner label="Загружаем клинику" />
  } else if (!clinic) {
    content = <LoadError className="mt-6" title="Не удалось загрузить клинику" onRetry={() => void refetch()} />
  } else {
    message = status
    header = (
      <>
        <div className="mb-4">
          <Link to="/admin/clinics" className={`${linkClass} inline-flex items-center gap-1.5 text-sm`}>
            <ArrowLeft aria-hidden className="size-4" />
            Все клиники
          </Link>
        </div>
        <PageHeader
          eyebrow="Администрирование"
          title={clinic.name}
          actions={clinic.archived_at !== null ? <Badge tone="coral">Скрыта</Badge> : undefined}
        />
      </>
    )
    content = (
      <div className="flex max-w-2xl flex-col gap-6">
        <ClinicDetailsSection clinic={clinic} onStatus={setStatus} />
        <ClinicAccountSection clinic={clinic} onStatus={setStatus} />
        <ClinicArchiveSection clinic={clinic} onStatus={setStatus} />
      </div>
    )
  }

  // С данными из кэша (переход из списка после добавления) загрузки нет, и регион появился бы сразу с текстом —
  // такой скринридер не озвучит. Первый рендер даёт пустой регион, текст приходит следующим.
  const shownMessage = useDeferredValue(message, '')

  // Регион статуса смонтирован в любом состоянии страницы и на одном месте среди соседей:
  // сообщение, появившееся в уже существующем регионе, скринридер озвучит.
  return (
    <>
      {header}
      <p role="status" className="mb-4 text-sm font-semibold text-primary empty:mb-0">
        {shownMessage}
      </p>
      {content}
    </>
  )
}
