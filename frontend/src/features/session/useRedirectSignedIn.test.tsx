import { useIsFetching } from '@tanstack/react-query'
import { act, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { meQuery } from '../../api/queries'
import { server } from '../../mocks/node'
import { loginMockAs, logoutMock } from '../../mocks/session'
import { createGate } from '../../test/gate'
import { renderWithProviders } from '../../test/render'
import { settle } from '../../test/requests'
import { useRedirectSignedIn } from './useRedirectSignedIn'

function Probe({ enabled }: { enabled?: boolean }) {
  const { checking } = useRedirectSignedIn(enabled)
  const fetching = useIsFetching({ queryKey: meQuery.queryKey })
  return (
    <>
      <p>{checking ? 'Проверяем' : 'Форма'}</p>
      <p>{fetching > 0 ? 'Запрос идёт' : 'Запросов нет'}</p>
    </>
  )
}

function renderProbe(enabled?: boolean) {
  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<Probe enabled={enabled} />} />
      <Route path="/" element={<p>Главная владельца</p>} />
      <Route path="/clinic/appointments" element={<p>Записи клиники</p>} />
    </Routes>,
    { route: '/login' },
  )
}

/** Гость на /users/me; ответы, начиная с номера holdFrom, держатся до release. */
function guestMe({ holdFrom = Infinity } = {}) {
  const gate = createGate()
  const calls = { me: 0 }
  server.use(
    http.get('*/api/users/me', async () => {
      calls.me += 1
      if (calls.me >= holdFrom) await gate.opened
      return HttpResponse.json({ detail: 'Не авторизован' }, { status: 401 })
    }),
  )
  return { calls, release: gate.release }
}

describe('useRedirectSignedIn', () => {
  it('вошедшего владельца уводит на его главную', async () => {
    renderProbe()
    expect(await screen.findByText('Главная владельца')).toBeInTheDocument()
  })

  it('вошедшую клинику — в её записи', async () => {
    loginMockAs('clinic')
    renderProbe()
    expect(await screen.findByText('Записи клиники')).toBeInTheDocument()
  })

  it('гость остаётся на странице', async () => {
    logoutMock()
    renderProbe()
    expect(await screen.findByText('Форма')).toBeInTheDocument()
  })

  it('проверка идёт до первого ответа', async () => {
    logoutMock()
    renderProbe()
    expect(screen.getByText('Проверяем')).toBeInTheDocument()
    expect(await screen.findByText('Форма')).toBeInTheDocument()
  })

  it('повторный запрос после ошибки не возвращает проверку', async () => {
    logoutMock()
    const me = guestMe({ holdFrom: 2 })
    const { queryClient } = renderProbe()
    expect(await screen.findByText('Форма')).toBeInTheDocument()
    expect(await screen.findByText('Запросов нет')).toBeInTheDocument()

    let refetching!: Promise<void>
    act(() => {
      refetching = queryClient.refetchQueries({ queryKey: meQuery.queryKey })
    })

    expect(await screen.findByText('Запрос идёт')).toBeInTheDocument()
    expect(screen.getByText('Форма')).toBeInTheDocument()

    me.release()
    await act(() => refetching)
    expect(me.calls.me).toBe(2)
    expect(screen.getByText('Форма')).toBeInTheDocument()
  })

  it('выключенный хук никуда не уводит и не запрашивает /users/me', async () => {
    const me = guestMe()
    renderProbe(false)
    expect(screen.getByText('Форма')).toBeInTheDocument()
    await settle(100)
    expect(screen.getByText('Форма')).toBeInTheDocument()
    expect(me.calls.me).toBe(0)
  })
})
