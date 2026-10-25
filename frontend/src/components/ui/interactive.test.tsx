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

  it('граница и плейсхолдер контрастные (line-strong, ink-muted)', () => {
    render(<TextField label="Кличка" placeholder="Например, Майло" />)
    const input = screen.getByRole('textbox', { name: 'Кличка' })
    expect(input).toHaveClass('border-line-strong', 'placeholder:text-ink-muted')
    expect(input).not.toHaveClass('border-line', 'placeholder:text-ink-soft')
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

  it('при открытии фокус — на первом поле, а не на «Закрыть»', () => {
    const { rerender } = render(
      <Modal open={false} onClose={() => {}} title="Новое дело">
        <TextField label="Название" />
        <TextField label="Заметка" />
      </Modal>,
    )
    rerender(
      <Modal open onClose={() => {}} title="Новое дело">
        <TextField label="Название" />
        <TextField label="Заметка" />
      </Modal>,
    )
    expect(screen.getByRole('textbox', { name: 'Название' })).toHaveFocus()
  })

  it('окно без полей открывается, фокус не трогаем', () => {
    render(
      <Modal open onClose={() => {}} title="Новое дело">
        <p>Тело окна</p>
      </Modal>,
    )
    expect(screen.getByRole('dialog', { name: 'Новое дело' })).toHaveAttribute('open')
    expect(document.body).toHaveFocus()
  })

  it('dismissible={false}: открываем обратно после браузера — фокус остаётся на месте', () => {
    render(
      <Modal open onClose={() => {}} title="Новый код" dismissible={false}>
        <TextField label="Пароль" />
        <button type="button">Получить</button>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Новый код' }) as HTMLDialogElement
    screen.getByRole('button', { name: 'Получить' }).focus()

    dialog.close()
    fireEvent(dialog, new Event('close'))

    expect(dialog).toHaveAttribute('open')
    expect(screen.getByRole('button', { name: 'Получить' })).toHaveFocus()
  })

  it('закрытое окно не открыто', () => {
    const { container } = render(
      <Modal open={false} onClose={() => {}} title="Новое дело">
        <p>Тело окна</p>
      </Modal>,
    )
    expect(container.querySelector('dialog')).not.toHaveAttribute('open')
  })

  it('dismissible={false}: нет крестика, Esc и клик по фону не закрывают', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(
      <Modal open onClose={onClose} title="Новый код" dismissible={false}>
        <p>Тело окна</p>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Новый код' })
    expect(screen.queryByRole('button', { name: 'Закрыть' })).not.toBeInTheDocument()

    const cancel = new Event('cancel', { cancelable: true })
    fireEvent(dialog, cancel)
    await user.click(dialog)

    expect(cancel.defaultPrevented).toBe(true)
    expect(onClose).not.toHaveBeenCalled()
    expect(dialog).toHaveAttribute('open')
  })

  it('dismissible={false}: браузер закрыл окно сам — открываем обратно, родитель не закрывал', () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="Новый код" dismissible={false}>
        <p>Тело окна</p>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Новый код' })

    const native = dialog as HTMLDialogElement
    native.close()
    fireEvent(dialog, new Event('close'))

    expect(dialog).toHaveAttribute('open')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('закрытое родителем окно не открывается снова по событию close', () => {
    const { rerender } = render(
      <Modal open onClose={() => {}} title="Новый код" dismissible={false}>
        <p>Тело окна</p>
      </Modal>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Новый код' })

    rerender(
      <Modal open={false} onClose={() => {}} title="Новый код" dismissible={false}>
        <p>Тело окна</p>
      </Modal>,
    )
    expect(dialog).not.toHaveAttribute('open')

    fireEvent(dialog, new Event('close'))
    expect(dialog).not.toHaveAttribute('open')
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
    // Длинное меню на низком экране прокручивается внутри, а не уходит за край.
    expect(document.getElementById(trigger.getAttribute('aria-controls')!)).toHaveClass('max-h-[70dvh]', 'overflow-y-auto')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('button', { name: 'Пункт' })).not.toBeInTheDocument()

    await user.click(trigger)
    await user.click(screen.getByText('Снаружи'))
    expect(screen.queryByRole('button', { name: 'Пункт' })).not.toBeInTheDocument()

    await user.click(trigger)
    await user.click(screen.getByRole('button', { name: 'Пункт' }))
    expect(screen.queryByRole('button', { name: 'Пункт' })).not.toBeInTheDocument()
  })

  describe('возврат фокуса', () => {
    function renderDropdown() {
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
      return screen.getByRole('button', { name: 'Меню' })
    }

    it('возвращается на кнопку после Esc и после выбора пункта', async () => {
      const user = userEvent.setup()
      const trigger = renderDropdown()

      await user.click(trigger)
      screen.getByRole('button', { name: 'Пункт' }).focus()
      await user.keyboard('{Escape}')
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      expect(trigger).toHaveFocus()

      await user.click(trigger)
      await user.click(screen.getByRole('button', { name: 'Пункт' }))
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      expect(trigger).toHaveFocus()
    })

    it('не забирает фокус при клике снаружи', async () => {
      const user = userEvent.setup()
      const trigger = renderDropdown()

      await user.click(trigger)
      screen.getByRole('button', { name: 'Пункт' }).focus()
      fireEvent.pointerDown(screen.getByText('Снаружи'))
      expect(trigger).toHaveAttribute('aria-expanded', 'false')
      expect(trigger).not.toHaveFocus()
    })
  })
})
