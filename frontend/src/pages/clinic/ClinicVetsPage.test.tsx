import { fireEvent, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppRoutes } from '../../app/routes'
import { server } from '../../mocks/node'
import { readServer, SEED_PASSWORD, updateServer } from '../../mocks/server-state'
import { loginMockAs } from '../../mocks/session'
import { renderWithProviders } from '../../test/render'

beforeEach(() => {
  loginMockAs('clinic')
})

const renderVets = () => renderWithProviders(<AppRoutes />, { route: '/clinic/vets' })

/** role="status" есть и у спиннеров, поэтому статус страницы ищем по тексту и проверяем, что он в live-регионе. */
async function findStatus(text: string) {
  const message = await screen.findByText(text)
  expect(message.closest('[role="status"]')).not.toBeNull()
  return message
}

const card = (name: string) => screen.getByRole('article', { name })
const names = () => screen.queryAllByRole('article').map((item) => within(item).getByRole('heading').textContent)
const vetInState = (id: number) => readServer().vets.find((vet) => vet.id === id)

const NETWORK = 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'
const ARCHIVED = 'Врач перенесён в архив. Его будущие записи не отменяются.'

describe('ClinicVetsPage: список', () => {
  it('активные по алфавиту, отпуск и пустая специализация; архив — отдельной вкладкой', async () => {
    const { user } = renderVets()
    expect(await screen.findByRole('tab', { name: 'Активные (3)' })).toHaveAttribute('aria-selected', 'true')
    expect(names()).toEqual(['Ким Елена Викторовна', 'Петров Павел Петрович', 'Соколова Мария Андреевна'])
    expect(within(card('Соколова Мария Андреевна')).getByText('В отпуске')).toBeInTheDocument()
    expect(within(card('Петров Павел Петрович')).queryByText('В отпуске')).not.toBeInTheDocument()
    expect(within(card('Ким Елена Викторовна')).getByText('Специализация не указана')).toBeInTheDocument()
    expect(within(card('Петров Павел Петрович')).getByText('терапевт')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Архив (1)' }))
    expect(names()).toEqual(['Орлов Дмитрий Сергеевич'])
    const orlov = card('Орлов Дмитрий Сергеевич')
    expect(within(orlov).getByRole('button', { name: 'Вернуть из архива, Орлов Дмитрий Сергеевич' })).toBeInTheDocument()
    expect(within(orlov).queryByRole('button', { name: /отпуск/ })).not.toBeInTheDocument()
  })

  // Что чужих врачей нет в списке, видно и по точным спискам вкладок выше; разграничение по клиникам — в тестах моков.
  it('аккаунт другой клиники видит только её врачей', async () => {
    updateServer((state) => {
      state.accounts.push({
        id: state.nextUserId,
        email: 'zoovet@example.com',
        password: SEED_PASSWORD,
        role: 'clinic',
        full_name: '',
        must_change_password: false,
        is_active: true,
        recovery_code: null,
        clinic_id: 4,
      })
      state.nextUserId += 1
    })
    loginMockAs('zoovet@example.com')
    renderVets()
    expect(await screen.findByRole('tab', { name: 'Активные (1)' })).toBeInTheDocument()
    expect(names()).toEqual(['Белова Ольга Игоревна'])
  })

  it('загрузка, затем пустой список', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.get('*/api/clinic/vets', async () => {
        await gate
        return HttpResponse.json([])
      }),
    )
    renderVets()
    expect(await screen.findByText('Загружаем врачей')).toBeInTheDocument()
    release()
    expect(await screen.findByText('Врачей пока нет')).toBeInTheDocument()
    expect(screen.queryByText('Загружаем врачей')).not.toBeInTheDocument()
  })

  it('архив пуст', async () => {
    updateServer((state) => {
      for (const vet of state.vets) vet.archived_at = null
    })
    const { user } = renderVets()
    await user.click(await screen.findByRole('tab', { name: 'Архив (0)' }))
    expect(screen.getByText('Архив пуст')).toBeInTheDocument()
  })

  it('все в архиве — активных нет', async () => {
    updateServer((state) => {
      for (const vet of state.vets) vet.archived_at = '2026-10-01T12:00:00+03:00'
    })
    renderVets()
    expect(await screen.findByRole('tab', { name: 'Активные (0)' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('Активных врачей нет')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Архив (4)' })).toBeInTheDocument()
  })

  it('ошибка загрузки и «Повторить»', async () => {
    server.use(http.get('*/api/clinic/vets', () => HttpResponse.json({ detail: 'Ошибка' }, { status: 500 }), { once: true }))
    const { user } = renderVets()
    expect(await screen.findByText('Не удалось загрузить врачей')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('tab', { name: 'Активные (3)' })).toBeInTheDocument()
    expect(screen.queryByText('Не удалось загрузить врачей')).not.toBeInTheDocument()
  })
})

describe('ClinicVetsPage: добавление и изменение', () => {
  it('добавленный врач появляется среди активных, даже если открыт архив', async () => {
    const { user } = renderVets()
    await user.click(await screen.findByRole('tab', { name: 'Архив (1)' }))
    await user.click(screen.getByRole('button', { name: 'Добавить врача' }))
    const dialog = screen.getByRole('dialog', { name: 'Новый врач' })
    await user.type(within(dialog).getByLabelText('ФИО'), 'Абрамова Ирина')
    await user.type(within(dialog).getByLabelText('Специализация'), 'офтальмолог')
    await user.click(within(dialog).getByRole('button', { name: 'Добавить врача' }))
    await findStatus('Врач добавлен.')
    expect(dialog).not.toHaveAttribute('open')
    expect(screen.getByRole('tab', { name: 'Активные (4)' })).toHaveAttribute('aria-selected', 'true')
    expect(names()[0]).toBe('Абрамова Ирина')
    expect(within(card('Абрамова Ирина')).getByText('офтальмолог')).toBeInTheDocument()
  })

  it('изменение ФИО: карточка обновлена, список пересортирован, статус', async () => {
    const { user } = renderVets()
    await user.click(await screen.findByRole('button', { name: 'Изменить, Ким Елена Викторовна' }))
    const dialog = screen.getByRole('dialog', { name: 'Изменить данные врача' })
    const name = within(dialog).getByLabelText('ФИО')
    await user.clear(name)
    await user.type(name, 'Яковлева Елена Викторовна')
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await findStatus('Данные врача сохранены.')
    expect(names()).toEqual(['Петров Павел Петрович', 'Соколова Мария Андреевна', 'Яковлева Елена Викторовна'])
    expect(vetInState(6)?.full_name).toBe('Яковлева Елена Викторовна')
  })

  it('архивного врача можно изменить', async () => {
    const { user } = renderVets()
    await user.click(await screen.findByRole('tab', { name: 'Архив (1)' }))
    await user.click(screen.getByRole('button', { name: 'Изменить, Орлов Дмитрий Сергеевич' }))
    const dialog = screen.getByRole('dialog', { name: 'Изменить данные врача' })
    await user.clear(within(dialog).getByLabelText('Специализация'))
    await user.click(within(dialog).getByRole('button', { name: 'Сохранить' }))
    await findStatus('Данные врача сохранены.')
    expect(within(card('Орлов Дмитрий Сергеевич')).getByText('Специализация не указана')).toBeInTheDocument()
  })
})

describe('ClinicVetsPage: отпуск', () => {
  it('отметить и снять отпуск: метка, статус, фокус остаётся на кнопке', async () => {
    const { user } = renderVets()
    const toggle = await screen.findByRole('button', { name: 'Отметить отпуск, Петров Павел Петрович' })
    await user.click(toggle)
    await findStatus('Отпуск отмечен: врач не предлагается для записи. Его будущие записи не отменяются.')
    expect(within(card('Петров Павел Петрович')).getByText('В отпуске')).toBeInTheDocument()
    expect(toggle).toHaveAccessibleName('Снять отпуск, Петров Павел Петрович')
    expect(toggle).toHaveFocus()
    expect(vetInState(4)?.on_vacation).toBe(true)

    await user.click(toggle)
    await findStatus('Отпуск снят: врач снова доступен для записи.')
    expect(within(card('Петров Павел Петрович')).queryByText('В отпуске')).not.toBeInTheDocument()
    expect(vetInState(4)?.on_vacation).toBe(false)
  })

  it('ошибка — в карточке врача; ответ не дошёл, а отпуск отмечен — список перечитан', async () => {
    server.use(
      http.patch('*/api/clinic/vets/:id', () => {
        updateServer((state) => {
          const vet = state.vets.find((item) => item.id === 4)
          if (vet) vet.on_vacation = true
        })
        return HttpResponse.error()
      }),
    )
    const { user } = renderVets()
    await user.click(await screen.findByRole('button', { name: 'Отметить отпуск, Петров Павел Петрович' }))
    const petrov = card('Петров Павел Петрович')
    expect(await within(petrov).findByRole('alert')).toHaveTextContent(NETWORK)
    expect(await within(petrov).findByText('В отпуске')).toBeInTheDocument()
    expect(within(card('Ким Елена Викторовна')).queryByRole('alert')).not.toBeInTheDocument()
  })

  it('повторное нажатие во время запроса не отправляет второй запрос', async () => {
    let calls = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.patch('*/api/clinic/vets/:id', async () => {
        calls += 1
        await gate
      }),
    )
    const { user } = renderVets()
    const toggle = await screen.findByRole('button', { name: 'Отметить отпуск, Петров Павел Петрович' })
    await user.click(toggle)
    expect(toggle).toHaveAccessibleName('Сохраняем…, Петров Павел Петрович')
    expect(toggle).toHaveAttribute('aria-disabled', 'true')
    await user.click(toggle)
    release()
    await findStatus('Отпуск отмечен: врач не предлагается для записи. Его будущие записи не отменяются.')
    expect(calls).toBe(1)
  })
})

describe('ClinicVetsPage: архив', () => {
  it('«Отмена» в подтверждении ничего не меняет', async () => {
    const { user } = renderVets()
    await user.click(await screen.findByRole('button', { name: 'В архив, Петров Павел Петрович' }))
    const dialog = screen.getByRole('dialog', { name: 'Перенести в архив' })
    expect(dialog).toHaveTextContent('Петров Павел Петрович не будет предлагаться для новой записи.')
    expect(dialog).toHaveTextContent('Будущие записи врача не отменяются')
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    expect(dialog).not.toHaveAttribute('open')
    expect(vetInState(4)?.archived_at).toBeNull()
    expect(screen.getByRole('tab', { name: 'Активные (3)' })).toBeInTheDocument()
  })

  it('архивирование: врач уходит в архив, фокус на вкладке, статус', async () => {
    const { user } = renderVets()
    await user.click(await screen.findByRole('button', { name: 'В архив, Петров Павел Петрович' }))
    const dialog = screen.getByRole('dialog', { name: 'Перенести в архив' })
    await user.click(within(dialog).getByRole('button', { name: 'В архив' }))
    await findStatus(ARCHIVED)
    expect(dialog).not.toHaveAttribute('open')
    expect(await screen.findByRole('tab', { name: 'Архив (2)' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Петров Павел Петрович' })).not.toBeInTheDocument()
    // Кнопки «В архив» больше нет — фокус на выбранной вкладке.
    expect(screen.getByRole('tab', { name: 'Активные (2)' })).toHaveFocus()
    expect(vetInState(4)?.archived_at).not.toBeNull()
  })

  it('пока идёт архивирование, окно не закрыть', async () => {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    server.use(
      http.post('*/api/clinic/vets/:id/archive', async () => {
        await gate
      }),
    )
    const { user } = renderVets()
    await user.click(await screen.findByRole('button', { name: 'В архив, Петров Павел Петрович' }))
    const dialog = screen.getByRole('dialog', { name: 'Перенести в архив' })
    await user.click(within(dialog).getByRole('button', { name: 'В архив' }))
    expect(await within(dialog).findByRole('button', { name: 'Переносим…' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Закрыть' })).not.toBeInTheDocument()
    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }))
    expect(dialog).toHaveAttribute('open')

    release()
    await findStatus(ARCHIVED)
    expect(dialog).not.toHaveAttribute('open')
  })

  it('ошибка архивирования — в окне; окно закрывается, врач на месте', async () => {
    server.use(http.post('*/api/clinic/vets/:id/archive', () => HttpResponse.json({ detail: 'Ошибка' }, { status: 500 })))
    const { user } = renderVets()
    await user.click(await screen.findByRole('button', { name: 'В архив, Петров Павел Петрович' }))
    const dialog = screen.getByRole('dialog', { name: 'Перенести в архив' })
    await user.click(within(dialog).getByRole('button', { name: 'В архив' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Сервис временно недоступен. Попробуйте через несколько минут.',
    )
    await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }))
    expect(dialog).not.toHaveAttribute('open')
    expect(card('Петров Павел Петрович')).toBeInTheDocument()
  })

  it('ответ не дошёл, а врач в архиве — окно с ошибкой остаётся; после закрытия фокус на вкладке', async () => {
    server.use(
      http.post('*/api/clinic/vets/:id/archive', () => {
        updateServer((state) => {
          const vet = state.vets.find((item) => item.id === 4)
          if (vet) vet.archived_at = '2026-10-26T10:00:00+03:00'
        })
        return HttpResponse.error()
      }),
    )
    const { user } = renderVets()
    await user.click(await screen.findByRole('button', { name: 'В архив, Петров Павел Петрович' }))
    const dialog = screen.getByRole('dialog', { name: 'Перенести в архив' })
    await user.click(within(dialog).getByRole('button', { name: 'В архив' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(NETWORK)
    // Список перечитан: врач уже в архиве, а окно с ошибкой на месте.
    expect(await screen.findByRole('tab', { name: 'Архив (2)' })).toBeInTheDocument()
    expect(dialog).toHaveAttribute('open')
    await user.click(within(dialog).getByRole('button', { name: 'Закрыть' }))
    expect(screen.getByRole('tab', { name: 'Активные (2)' })).toHaveFocus()
  })

  it('возврат с подтверждением; врач в отпуске возвращается в отпуске', async () => {
    updateServer((state) => {
      const vet = state.vets.find((item) => item.id === 7)
      if (vet) vet.on_vacation = true
    })
    const { user } = renderVets()
    await user.click(await screen.findByRole('tab', { name: 'Архив (1)' }))
    await user.click(screen.getByRole('button', { name: 'Вернуть из архива, Орлов Дмитрий Сергеевич' }))
    const dialog = screen.getByRole('dialog', { name: 'Вернуть из архива' })
    expect(dialog).toHaveTextContent('Орлов Дмитрий Сергеевич вернётся из архива в отпуске')
    await user.click(within(dialog).getByRole('button', { name: 'Вернуть' }))
    await findStatus('Врач возвращён из архива и всё ещё в отпуске.')
    expect(await screen.findByRole('tab', { name: 'Архив (0)' })).toHaveFocus()
    expect(screen.getByText('Архив пуст')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Активные (4)' }))
    expect(within(card('Орлов Дмитрий Сергеевич')).getByText('В отпуске')).toBeInTheDocument()
  })

  it('возврат врача не в отпуске', async () => {
    const { user } = renderVets()
    await user.click(await screen.findByRole('tab', { name: 'Архив (1)' }))
    await user.click(screen.getByRole('button', { name: 'Вернуть из архива, Орлов Дмитрий Сергеевич' }))
    const dialog = screen.getByRole('dialog', { name: 'Вернуть из архива' })
    expect(dialog).toHaveTextContent('Орлов Дмитрий Сергеевич снова будет предлагаться для записи.')
    await user.click(within(dialog).getByRole('button', { name: 'Вернуть' }))
    await findStatus('Врач возвращён из архива.')
    expect(vetInState(7)?.archived_at).toBeNull()
  })
})
