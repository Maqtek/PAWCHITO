import { useQuery } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { meQuery } from '../../api/queries'
import { server } from '../../mocks/node'
import { readServer, toUser } from '../../mocks/server-state'
import { loginMockAs } from '../../mocks/session'
import { createGate } from '../../test/gate'
import { renderWithProviders } from '../../test/render'
import { recordRequests, settle, stubRequestTimeout } from '../../test/requests'
import { NETWORK, SERVER_UNAVAILABLE } from '../../test/texts'
import { NameField } from './NameField'

/** Имя из кэша рядом с полем — как в меню пользователя. */
function Profile() {
  const { data: user } = useQuery(meQuery)
  if (!user) return null
  return (
    <>
      <NameField user={user} />
      <p data-testid="cached-name">{user.full_name}</p>
    </>
  )
}

const ownerName = () => readServer().accounts.find((item) => item.email === 'owner@example.com')?.full_name

async function openEditor() {
  const rendered = renderWithProviders(<Profile />)
  await rendered.user.click(await screen.findByRole('button', { name: 'Изменить имя' }))
  return rendered
}

describe('NameField', () => {
  it('карандаш открывает поле с текущим именем и фокусом', async () => {
    await openEditor()
    const input = screen.getByRole('textbox', { name: 'Имя' })
    expect(input).toHaveValue('Анна Смирнова')
    expect(input).toHaveFocus()
  })

  it('«Сохранить»: имя на сервере и в кэше, статус, фокус на карандаше', async () => {
    const { user } = await openEditor()
    const input = screen.getByRole('textbox', { name: 'Имя' })
    await user.clear(input)
    await user.type(input, '  Анна Иванова ')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(await screen.findByText('Имя сохранено')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Имя сохранено')
    expect(screen.getByTestId('cached-name')).toHaveTextContent('Анна Иванова')
    expect(ownerName()).toBe('Анна Иванова')
    expect(screen.getByRole('button', { name: 'Изменить имя' })).toHaveFocus()
  })

  it('Enter сохраняет, Esc отменяет без запроса', async () => {
    const { user } = await openEditor()
    await user.clear(screen.getByRole('textbox', { name: 'Имя' }))
    await user.type(screen.getByRole('textbox', { name: 'Имя' }), 'Анна{Enter}')
    expect(await screen.findByText('Имя сохранено')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Изменить имя' }))
    await user.type(screen.getByRole('textbox', { name: 'Имя' }), ' Петровна{Escape}')
    expect(screen.queryByRole('textbox', { name: 'Имя' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Изменить имя' })).toHaveFocus()
    expect(ownerName()).toBe('Анна')
  })

  it('«Отмена» закрывает правку без запроса, фокус на карандаше', async () => {
    const patches = recordRequests('patch', '*/api/users/me')
    const { user } = await openEditor()
    await user.type(screen.getByRole('textbox', { name: 'Имя' }), '!')
    await user.click(screen.getByRole('button', { name: 'Отмена' }))

    expect(screen.queryByRole('textbox', { name: 'Имя' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Изменить имя' })).toHaveFocus()
    await settle()
    expect(patches.count).toBe(0)
    expect(ownerName()).toBe('Анна Смирнова')
  })

  it('пустое имя — ошибка без запроса; имя не изменилось — закрыть без запроса', async () => {
    const patches = recordRequests('patch', '*/api/users/me')
    const { user } = await openEditor()
    await user.clear(screen.getByRole('textbox', { name: 'Имя' }))
    await user.type(screen.getByRole('textbox', { name: 'Имя' }), '   ')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(screen.getByText('Заполните поле')).toBeInTheDocument()

    await user.clear(screen.getByRole('textbox', { name: 'Имя' }))
    await user.type(screen.getByRole('textbox', { name: 'Имя' }), 'Анна Смирнова ')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByRole('button', { name: 'Изменить имя' })).toBeInTheDocument()
    await settle()
    expect(patches.count).toBe(0)
  })

  it('422 — ошибка у поля; 500 — текст над кнопками, правка остаётся открытой', async () => {
    server.use(
      http.patch('*/api/users/me', () =>
        HttpResponse.json(
          { detail: [{ loc: ['body', 'full_name'], msg: 'Имя слишком длинное', type: 'value_error' }] },
          { status: 422 },
        ),
      ),
    )
    const { user } = await openEditor()
    await user.type(screen.getByRole('textbox', { name: 'Имя' }), '!')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByText('Имя слишком длинное')).toBeInTheDocument()

    server.use(http.patch('*/api/users/me', () => HttpResponse.json({ detail: 'Ошибка' }, { status: 500 })))
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(SERVER_UNAVAILABLE)
    expect(screen.getByRole('textbox', { name: 'Имя' })).toBeInTheDocument()
  })

  it('пока запрос идёт, Esc и «Отмена» ничего не делают; ответ закрывает правку', async () => {
    const gate = createGate()
    server.use(
      http.patch('*/api/users/me', async () => {
        await gate.opened
        const state = readServer()
        const owner = state.accounts.find((item) => item.email === 'owner@example.com')!
        return HttpResponse.json(toUser(state, { ...owner, full_name: 'Анна Иванова' }))
      }),
    )
    const { user } = await openEditor()
    const input = screen.getByRole('textbox', { name: 'Имя' })
    await user.clear(input)
    await user.type(input, 'Анна Иванова')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByRole('button', { name: 'Сохраняем…' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    const cancel = screen.getByRole('button', { name: 'Отмена' })
    expect(cancel).toHaveAttribute('aria-disabled', 'true')
    await user.click(cancel)
    expect(screen.getByRole('textbox', { name: 'Имя' })).toHaveValue('Анна Иванова')

    gate.release()
    expect(await screen.findByText('Имя сохранено')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Имя' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Изменить имя' })).toHaveFocus()
  })

  it('запрос завис — по таймауту «Нет связи», правка остаётся открытой', async () => {
    const gate = createGate()
    server.use(
      http.patch('*/api/users/me', async () => {
        await gate.opened
        return HttpResponse.json({ detail: 'Ошибка' }, { status: 500 })
      }),
    )
    const { user } = await openEditor()
    await user.type(screen.getByRole('textbox', { name: 'Имя' }), '!')
    const timeout = stubRequestTimeout()
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByRole('button', { name: 'Сохраняем…' })).toBeInTheDocument()

    timeout.expire()
    expect(await screen.findByRole('alert')).toHaveTextContent(NETWORK)
    expect(screen.getByRole('textbox', { name: 'Имя' })).toHaveValue('Анна Смирнова!')
    expect(screen.getByRole('button', { name: 'Отмена' })).not.toHaveAttribute('aria-disabled', 'true')
    gate.release()
  })

  it('HTML в имени выводится текстом', async () => {
    const { user } = await openEditor()
    await user.clear(screen.getByRole('textbox', { name: 'Имя' }))
    await user.type(screen.getByRole('textbox', { name: 'Имя' }), '<b>Анна</b>')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByTestId('cached-name')).toHaveTextContent('<b>Анна</b>')
    expect(document.querySelector('b')).toBeNull()
  })

  it('у клиники — название без карандаша, подпись «Клиника» (Р-35)', async () => {
    loginMockAs('clinic')
    renderWithProviders(<Profile />)
    expect(await screen.findByTestId('cached-name')).toHaveTextContent('ВетДоктор')
    expect(screen.getByText('Клиника')).toBeInTheDocument()
    expect(screen.queryByText('Имя')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Изменить имя' })).toBeNull()
  })
})
