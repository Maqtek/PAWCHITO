import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Dropdown, Modal, SelectField, Tabs, TextareaField, TextField } from '.'

describe('поля', () => {
  it('связывают подпись, ошибку и подсказку с полем', () => {
    render(<TextField label="Кличка" hint="До 50 символов" error="Укажите кличку" />)
    const input = screen.getByLabelText('Кличка')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Укажите кличку До 50 символов')
  })

  it('без ошибки поле валидно', () => {
    render(<TextareaField label="Заметка" />)
    expect(screen.getByRole('textbox', { name: 'Заметка' })).not.toHaveAttribute('aria-invalid')
  })

  it('выпадающий список с пустым пунктом-подсказкой', () => {
    render(
      <SelectField
        label="Вид"
        placeholder="Выберите вид"
        defaultValue=""
        options={[
          { value: 'dog', label: 'Собака' },
          { value: 'cat', label: 'Кошка' },
        ]}
      />,
    )
    const select = screen.getByRole('combobox', { name: 'Вид' })
    expect(select).toHaveValue('')
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })
})

describe('Modal', () => {
  it('открыт с заголовком и закрывается кнопкой и по Esc', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <Modal open onClose={onClose} title="Новое дело">
        <p>Тело окна</p>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Новое дело' })
    expect(dialog).toHaveAttribute('open')

    await user.click(screen.getByRole('button', { name: 'Закрыть' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    fireEvent(dialog, new Event('cancel', { cancelable: true }))
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('закрытое окно не открыто', () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}} title="Новое дело">
        <p>Тело окна</p>
      </Modal>,
    )
    expect(container.querySelector('dialog')).not.toHaveAttribute('open')
  })
})

describe('Tabs', () => {
  function Example() {
    const [value, setValue] = useState<'all' | 'treatment'>('all')
    return (
      <Tabs
        label="Тип события"
        value={value}
        onChange={setValue}
        items={[
          { id: 'all', label: 'Все' },
          { id: 'treatment', label: 'Лечение' },
        ]}
      />
    )
  }

  it('переключаются кликом и стрелками', async () => {
    const user = userEvent.setup()
    render(<Example />)
    expect(screen.getByRole('tab', { name: 'Все' })).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('tab', { name: 'Лечение' }))
    expect(screen.getByRole('tab', { name: 'Лечение' })).toHaveAttribute('aria-selected', 'true')

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Все' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'Все' })).toHaveFocus()
  })
})

describe('Dropdown', () => {
  it('открывается и закрывается по Esc, клику снаружи и выбору пункта', async () => {
    const user = userEvent.setup()
    render(
      <div>
        <Dropdown label="Меню" button="Открыть">
          {(close) => (
            <button type="button" onClick={close}>
              Пункт
            </button>
          )}
        </Dropdown>
        <p>Снаружи</p>
      </div>,
    )
    const trigger = screen.getByRole('button', { name: 'Меню' })

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Пункт' })).not.toBeInTheDocument()

    await user.click(trigger)
    await user.click(screen.getByText('Снаружи'))
    expect(screen.queryByRole('button', { name: 'Пункт' })).not.toBeInTheDocument()

    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Пункт' }))
    expect(screen.queryByRole('button', { name: 'Пункт' })).not.toBeInTheDocument()
  })
})
