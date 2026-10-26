import { act, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Route, Routes, useNavigationType } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { meQuery } from '../../api/queries'
import type { User } from '../../api/schema'
import { endSession, requirePasswordChange, signOut } from '../../api/session'
import { server } from '../../mocks/node'
import { loginMockAs, logoutMock } from '../../mocks/session'
import { LoginPage } from '../../pages/auth/LoginPage'
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

/** Как изменилась история при последнем переходе: POP, PUSH или REPLACE. */
function NavigationProbe() {
  return <output data-testid="navigation">{useNavigationType()}</output>
}

function renderApp(route = '/') {
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/" element={<p>Кабинет</p>} />
        <Route path="/login" element={<LoginPage />} />
      </Routes>
      <NavigationProbe />
    </>,
    { route },
  )
}

describe('SessionEvents', () => {
  it('сессия истекла: экран входа с причиной, кэш очищен, питомец забыт', async () => {
    localStorage.setItem('pawchito:selected-pet-id', '11')
    const { queryClient } = renderApp()
    queryClient.setQueryData(['probe'], 1)

    logoutMock() // сервер уже отозвал сессию — восстановить её на экране входа нечем
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

  it('подтверждённый выход: экран входа без причины, запись истории заменена', async () => {
    renderApp()
    expect(screen.getByTestId('navigation')).toHaveTextContent('POP')

    await act(() => signOut())

    // Причина показывается вместе с формой — проверяем её отсутствие, когда форма уже на экране.
    expect(await screen.findByRole('button', { name: 'Войти' })).toBeInTheDocument()
    expect(screen.queryByText(/Сессия истекла|Вы вышли/)).not.toBeInTheDocument()
    expect(screen.getByTestId('navigation')).toHaveTextContent('REPLACE')
  })

  it('выход в другой вкладке: экран входа с причиной, кэш очищен, питомец забыт', async () => {
    localStorage.setItem('pawchito:selected-pet-id', '11')
    const { queryClient } = renderApp()
    queryClient.setQueryData(['probe'], 1)
    logoutMock() // другая вкладка вышла и стёрла общую cookie

    otherTab().postMessage({ type: 'signed-out' })

    expect(await screen.findByText('Вы вышли в другой вкладке')).toBeInTheDocument()
    expect(queryClient.getQueryData(['probe'])).toBeUndefined()
    expect(localStorage.getItem('pawchito:selected-pet-id')).toBeNull()
  })

  it('вход в другой вкладке: из экрана входа — в кабинет, запись истории заменена', async () => {
    logoutMock()
    renderApp('/login')
    // Форма на экране — проверка входа закончилась гостем; дальше в кабинет ведёт только сообщение вкладки.
    expect(await screen.findByRole('button', { name: 'Войти' })).toBeInTheDocument()
    loginMockAs('owner') // другая вкладка вошла и записала cookie
    otherTab().postMessage({ type: 'signed-in' })
    expect(await screen.findByText('Кабинет')).toBeInTheDocument()
    expect(screen.getByTestId('navigation')).toHaveTextContent('REPLACE')
  })

  it('403 password_change_required: на смену пароля с replace, кэш очищен, me с флагом', async () => {
    const clinic: User = {
      id: 6,
      email: 'clinic@example.com',
      role: 'clinic',
      full_name: 'ВетДоктор',
      must_change_password: false,
    }
    const { queryClient } = renderWithProviders(
      <>
        <Routes>
          <Route path="/" element={<p>Кабинет</p>} />
          <Route path="/change-password" element={<p>Форма смены пароля</p>} />
        </Routes>
        <NavigationProbe />
      </>,
    )
    queryClient.setQueryData(['probe'], 1)
    queryClient.setQueryData(meQuery.queryKey, clinic)

    act(() => requirePasswordChange())

    expect(await screen.findByText('Форма смены пароля')).toBeInTheDocument()
    expect(screen.getByTestId('navigation')).toHaveTextContent('REPLACE')
    expect(queryClient.getQueryData(['probe'])).toBeUndefined()
    expect(queryClient.getQueryData(meQuery.queryKey)).toEqual({ ...clinic, must_change_password: true })
  })

  it('после размонтирования события сессии кэш не трогают', () => {
    const { queryClient, unmount } = renderApp()
    unmount()

    queryClient.setQueryData(['probe'], 1)
    endSession()

    expect(queryClient.getQueryData(['probe'])).toBe(1)
  })

  it('при запуске довыходит на сервере, если выход был начат без сети', async () => {
    let logoutCalls = 0
    server.use(
      http.post('*/api/auth/logout', () => {
        logoutCalls += 1
        return new HttpResponse(null, { status: 204 })
      }),
    )
    localStorage.setItem('pawchito:logout-pending', '1')

    renderApp('/login')

    await waitFor(() => expect(localStorage.getItem('pawchito:logout-pending')).toBeNull())
    expect(logoutCalls).toBe(1)
  })
})
