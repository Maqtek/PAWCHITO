import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/errors'
import { TextField } from '../components/ui'
import { renderWithProviders } from '../test/render'
import { useForm, type FormFailure } from './use-form'

type Values = { email: string; password: string }

function TestForm({
  onSubmit,
  onError,
}: {
  onSubmit: (values: Values) => Promise<void>
  onError?: (error: unknown, values: Values) => FormFailure<Values> | undefined
}) {
  const form = useForm<Values>({
    initial: { email: '', password: '' },
    validate: (values) => ({
      email: values.email ? undefined : 'Заполните email',
      password: values.password.length >= 8 ? undefined : 'Короткий пароль',
    }),
    onSubmit,
    onError,
    context: 'login',
  })
  return (
    <form noValidate onSubmit={form.handleSubmit}>
      <TextField label="Email" {...form.field('email')} />
      <TextField label="Пароль" {...form.field('password')} />
      {form.formError && <p role="alert">{form.formError}</p>}
      <button type="submit" disabled={form.submitting}>
        {form.submitting ? 'Отправляем…' : 'Отправить'}
      </button>
    </form>
  )
}

describe('useForm', () => {
  it('до отправки ошибок нет; при отправке — все сразу, фокус на первое неверное, запроса нет', async () => {
    const onSubmit = vi.fn(async () => {})
    const { user } = renderWithProviders(<TestForm onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText('Пароль'), 'a')
    expect(screen.queryByText('Короткий пароль')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(screen.getByText('Заполните email')).toBeInTheDocument()
    expect(screen.getByText('Короткий пароль')).toBeInTheDocument()
    expect(screen.getByLabelText('Email')).toHaveFocus()
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true')
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('после первой отправки ошибки пересчитываются при вводе', async () => {
    const { user } = renderWithProviders(<TestForm onSubmit={async () => {}} />)
    await user.click(screen.getByRole('button', { name: 'Отправить' }))
    await user.type(screen.getByLabelText('Email'), 'a@b.c')
    expect(screen.queryByText('Заполните email')).not.toBeInTheDocument()
    expect(screen.getByText('Короткий пароль')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Пароль'), '12345678')
    expect(screen.queryByText('Короткий пароль')).not.toBeInTheDocument()
  })

  it('верные значения уходят в onSubmit', async () => {
    const onSubmit = vi.fn(async () => {})
    const { user } = renderWithProviders(<TestForm onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText('Email'), 'a@b.c')
    await user.type(screen.getByLabelText('Пароль'), '12345678')
    await user.click(screen.getByRole('button', { name: 'Отправить' }))
    expect(onSubmit).toHaveBeenCalledWith({ email: 'a@b.c', password: '12345678' })
  })

  it('пока идёт запрос, кнопка заблокирована, повторная отправка игнорируется', async () => {
    let release!: () => void
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => (release = resolve)))
    const { user } = renderWithProviders(<TestForm onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText('Email'), 'a@b.c')
    await user.type(screen.getByLabelText('Пароль'), '12345678')
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    const button = await screen.findByRole('button', { name: 'Отправляем…' })
    expect(button).toBeDisabled()
    fireEvent.submit(button.closest('form')!)
    expect(onSubmit).toHaveBeenCalledTimes(1)

    release()
    expect(await screen.findByRole('button', { name: 'Отправить' })).toBeEnabled()
  })

  it('422: ошибки по полям, текст над кнопкой, фокус на поле; ошибка поля пропадает при вводе', async () => {
    const onSubmit = vi.fn(async () => {
      throw new ApiError(422, 'Слишком простой', { fieldErrors: { password: 'Слишком простой', unknown: 'лишнее' } })
    })
    const { user } = renderWithProviders(<TestForm onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText('Email'), 'a@b.c')
    await user.type(screen.getByLabelText('Пароль'), '12345678')
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(await screen.findByText('Слишком простой')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Проверьте поля формы.')
    expect(screen.getByLabelText('Пароль')).toHaveFocus()
    expect(screen.queryByText('лишнее')).not.toBeInTheDocument()

    await user.type(screen.getByLabelText('Пароль'), '9')
    expect(screen.queryByText('Слишком простой')).not.toBeInTheDocument()
  })

  it('ошибки сервера по полям снимаются, когда уходит новая отправка', async () => {
    let attempt = 0
    let release!: () => void
    const onSubmit = vi.fn(async () => {
      attempt += 1
      if (attempt === 1) throw new ApiError(422, 'Email занят', { fieldErrors: { email: 'Email занят' } })
      await new Promise<void>((resolve) => (release = resolve))
    })
    const { user } = renderWithProviders(<TestForm onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText('Email'), 'a@b.c')
    await user.type(screen.getByLabelText('Пароль'), '12345678')
    await user.click(screen.getByRole('button', { name: 'Отправить' }))
    expect(await screen.findByText('Email занят')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(await screen.findByRole('button', { name: 'Отправляем…' })).toBeInTheDocument()
    expect(screen.queryByText('Email занят')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-invalid')
    release()
    expect(await screen.findByRole('button', { name: 'Отправить' })).toBeInTheDocument()
  })

  it('прочие ошибки — текстом формы по контексту', async () => {
    const onSubmit = vi.fn(async () => {
      throw new ApiError(401, 'Неверный email или пароль')
    })
    const { user } = renderWithProviders(<TestForm onSubmit={onSubmit} />)
    await user.type(screen.getByLabelText('Email'), 'a@b.c')
    await user.type(screen.getByLabelText('Пароль'), '12345678')
    await user.click(screen.getByRole('button', { name: 'Отправить' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный email или пароль.')
  })

  it('onError переопределяет разбор ошибки', async () => {
    const onSubmit = vi.fn(async () => {
      throw new ApiError(409, 'Email уже зарегистрирован')
    })
    const { user } = renderWithProviders(
      <TestForm onSubmit={onSubmit} onError={(_, values) => ({ fields: { email: `Занят: ${values.email}` } })} />,
    )
    await user.type(screen.getByLabelText('Email'), 'a@b.c')
    await user.type(screen.getByLabelText('Пароль'), '12345678')
    await user.click(screen.getByRole('button', { name: 'Отправить' }))
    expect(await screen.findByText('Занят: a@b.c')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
