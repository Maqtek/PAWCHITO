import { render, screen } from '@testing-library/react'
import { Plus } from 'lucide-react'
import { describe, expect, it } from 'vitest'
import { Avatar, Badge, Button, CountBadge, EmptyState, IconButton, ProgressBar, Spinner } from '.'

describe('UI-кит: базовые элементы', () => {
  it('Button по умолчанию type="button", иконка скрыта от скринридера', () => {
    render(<Button icon={Plus}>Добавить</Button>)
    const button = screen.getByRole('button', { name: 'Добавить' })
    expect(button).toHaveAttribute('type', 'button')
    expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('IconButton называется по label', () => {
    render(<IconButton icon={Plus} label="Добавить дело" />)
    expect(screen.getByRole('button', { name: 'Добавить дело' })).toBeInTheDocument()
  })

  it('Badge с точкой', () => {
    render(<Badge tone="blush" dot>На лечении</Badge>)
    expect(screen.getByText('На лечении')).toHaveClass('bg-blush')
  })

  it('CountBadge: пусто при нуле, подпись для скринридера, число скрыто от него', () => {
    const empty = render(<CountBadge count={0} label="Непрочитанных: 0" />)
    expect(empty.container).toBeEmptyDOMElement()
    empty.unmount()

    const labelled = render(<CountBadge count={120} label="Непрочитанных: 120" />)
    expect(screen.getByText('Непрочитанных: 120')).toBeInTheDocument()
    expect(screen.getByText('99+')).toHaveAttribute('aria-hidden', 'true')
    expect(labelled.container.querySelector('[aria-label]')).toBeNull()
    labelled.unmount()

    const decorative = render(<CountBadge count={7} />)
    expect(decorative.container.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    expect(decorative.container.firstElementChild).toHaveTextContent('7')
  })

  it('ProgressBar сообщает значение', () => {
    render(<ProgressBar value={6} max={12} label="Прогресс курса" />)
    const bar = screen.getByRole('progressbar', { name: 'Прогресс курса' })
    expect(bar).toHaveAttribute('aria-valuenow', '6')
    expect(bar.firstElementChild).toHaveStyle({ width: '50%' })
  })

  it('Spinner — статус с подписью', () => {
    render(<Spinner label="Загружаем питомцев" />)
    expect(screen.getByRole('status')).toHaveTextContent('Загружаем питомцев')
  })

  it('Avatar показывает инициалы', () => {
    render(<Avatar name="Анна Смирнова" />)
    expect(screen.getByText('АС')).toBeInTheDocument()
  })

  it('EmptyState: заголовок, описание, действие', () => {
    render(<EmptyState title="Пока пусто" description="Добавьте первое дело" action={<Button>Добавить</Button>} />)
    expect(screen.getByRole('heading', { name: 'Пока пусто' })).toBeInTheDocument()
    expect(screen.getByText('Добавьте первое дело')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Добавить' })).toBeInTheDocument()
  })
})
