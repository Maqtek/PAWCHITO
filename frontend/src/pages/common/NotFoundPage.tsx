import { Link } from 'react-router-dom'
import { buttonClass, EmptyState } from '../../components/ui'
import { PageHeader } from '../../layouts/PageHeader'

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Страница не найдена" />
      <EmptyState
        title="Такого адреса нет"
        description="Возможно, ссылка устарела."
        action={
          <Link to="/" className={buttonClass({ variant: 'secondary' })}>
            На главную
          </Link>
        }
      />
    </>
  )
}
