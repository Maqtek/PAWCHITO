import { screen, within, type Matcher } from '@testing-library/react'
import { expect } from 'vitest'

/** role="status" есть и у спиннеров, поэтому статус страницы ищем по тексту и проверяем, что он в live-регионе. */
export async function findStatus(text: Matcher) {
  const message = await screen.findByText(text)
  expect(message.closest('[role="status"]')).not.toBeNull()
  return message
}

/** Раздел страницы по его заголовку. */
export const region = (name: string) => screen.getByRole('region', { name })

/** Заголовки карточек по порядку — на всей странице или внутри scope. */
export const articleTitles = (scope?: HTMLElement) =>
  (scope ? within(scope) : screen).queryAllByRole('article').map((item) => within(item).getByRole('heading').textContent)
