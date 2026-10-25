import { useQuery } from '@tanstack/react-query'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import { meQuery } from '../../api/queries'
import { server } from '../../mocks/node'
import { readServer, toUser } from '../../mocks/server-state'
import { renderWithProviders } from '../../test/render'
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
    let calls = 0
    server.use(
      http.patch('*/api/users/me', () => {
        calls += 1
      }),
    )
    const { user } = await openEditor()
    await user.type(screen.getByRole('textbox', { name: 'Имя' }), '!')
    await user.click(screen.getByRole('button', { name: 'Отмена' }))

    expect(screen.queryByRole('textbox', { name: 'Имя' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Изменить имя' })).toHaveFocus()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(calls).toBe(0)
    expect(ownerName()).toBe('Анна Смирнова')
  })

  it('пустое имя — ошибка без запроса; имя не изменилось — закрыть без запроса', async () => {
    let calls = 0
    server.use(
      http.patch('*/api/users/me', () => {
        calls += 1
      }),
    )
    const { user } = await openEditor()
    await user.clear(screen.getByRole('textbox', { name: 'Имя' }))
    await user.type(screen.getByRole('textbox', { name: 'Имя' }), '   ')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(screen.getByText('Заполните поле')).toBeInTheDocument()

    await user.clear(screen.getByRole('textbox', { name: 'Имя' }))
    await user.type(screen.getByRole('textbox', { name: 'Имя' }), 'Анна Смирнова ')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByRole('button', { name: 'Изменить имя' })).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(calls).toBe(0)
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
    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис временно недоступен. Попробуйте через несколько минут.')
    expect(screen.getByRole('textbox', { name: 'Имя' })).toBeInTheDocument()
  })

  it('пока запрос идёт, Esc и «Отмена» ничего не делают; ответ закрывает правку', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.patch('*/api/users/me', async () => {
        await gate
        const owner = readServer().accounts.find((item) => item.email === 'owner@example.com')!
        return HttpResponse.json(toUser({ ...owner, full_name: 'Анна Иванова' }))
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

    release()
    expect(await screen.findByText('Имя сохранено')).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Имя' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Изменить имя' })).toHaveFocus()
  })

  it('HTML в имени выводится текстом', async () => {
    const { user } = await openEditor()
    await user.clear(screen.getByRole('textbox', { name: 'Имя' }))
    await user.type(screen.getByRole('textbox', { name: 'Имя' }), '<b>Анна</b>')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))
    expect(await screen.findByTestId('cached-name')).toHaveTextContent('<b>Анна</b>')
    expect(document.querySelector('b')).toBeNull()
  })
})
