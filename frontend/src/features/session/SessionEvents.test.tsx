import { act, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { endSession, signOut } from '../../api/session'
import { server } from '../../mocks/node'
import { LoginPage } from '../../pages/common/LoginPage'
import { renderWithProviders } from '../../test/render'

const openTabs: BroadcastChannel[] = []

function otherTab() {
  const channel = new BroadcastChannel('pawchito:session')
  openTabs.push(channel)
  return channel
}

afterEach(() => {
  openTabs.splice(0).forEach((channel) => channel.close())
})

function renderApp(route = '/') {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<p>Кабинет</p>} />
      <Route path="/login" element={<LoginPage />} />
    </Routes>,
    { route },
  )
}

describe('SessionEvents', () => {
  it('сессия истекла: экран входа с причиной, кэш очищен, питомец забыт', async () => {
    localStorage.setItem('pawchito:selected-pet-id', '11')
    const { queryClient } = renderApp()
    queryClient.setQueryData(['probe'], 1)

    act(() => endSession())

    expect(await screen.findByText('Сессия истекла — войдите снова')).toBeInTheDocument()
    expect(queryClient.getQueryData(['probe'])).toBeUndefined()
    expect(localStorage.getItem('pawchito:selected-pet-id')).toBeNull()
  })

  it('выход без ответа сервера: текст про связь', async () => {
    server.use(http.post('*/api/auth/logout', () => HttpResponse.error()))
    renderApp()

    await act(() => signOut())

    expect(
      await screen.findByText('Вы вышли на этом устройстве. На сервере сессия завершится, когда появится связь'),
    ).toBeInTheDocument()
  })

  it('подтверждённый выход: экран входа без причины', async () => {
    renderApp()

    await act(() => signOut())

    expect(await screen.findByRole('heading', { level: 1, name: 'Вход' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('выход в другой вкладке: экран входа с причиной', async () => {
    renderApp()
    otherTab().postMessage({ type: 'signed-out' })
    expect(await screen.findByText('Вы вышли в другой вкладке')).toBeInTheDocument()
  })

  it('вход в другой вкладке: из экрана входа — в кабинет', async () => {
    renderApp('/login')
    otherTab().postMessage({ type: 'signed-in' })
    expect(await screen.findByText('Кабинет')).toBeInTheDocument()
  })
})
