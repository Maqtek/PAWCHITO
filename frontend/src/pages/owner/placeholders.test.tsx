import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HistoryPage } from './HistoryPage'
import { TasksPage } from './TasksPage'

describe('страницы-заглушки владельца', () => {
  it('история: у каждого блока свой этап, без противоречивых номеров', () => {
    render(<HistoryPage />)
    const diary = screen.getByRole('heading', { name: 'Дневник, прививки и особенности здоровья' })
    const feed = screen.getByRole('heading', { name: 'Лента истории' })
    expect(diary.parentElement).toHaveTextContent('Появится на этапе 6 роадмапа.')
    expect(diary.parentElement).not.toHaveTextContent('11')
    expect(feed.parentElement).toHaveTextContent('Появится на этапе 11 роадмапа.')
  })

  it('дела: надзаголовок «Календарь», а не «Уход» — так называется тип события', () => {
    render(<TasksPage />)
    expect(screen.getByText('Календарь')).toBeInTheDocument()
    expect(screen.queryByText('Уход')).not.toBeInTheDocument()
  })
})
