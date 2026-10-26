import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TasksPage } from './TasksPage'

// История с этапа 6 — настоящий раздел: её заглушка ленты (этап 11) проверяется в HistoryPage.test.tsx.
describe('страницы-заглушки владельца', () => {
  it('дела: надзаголовок «Календарь», а не «Уход» — так называется тип события', () => {
    render(<TasksPage />)
    expect(screen.getByText('Календарь')).toBeInTheDocument()
    expect(screen.queryByText('Уход')).not.toBeInTheDocument()
  })
})
