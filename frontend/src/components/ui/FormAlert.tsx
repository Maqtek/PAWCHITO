/** Ошибка формы над кнопкой отправки; без текста ничего не рендерит. */
export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p role="alert" className="rounded-xl bg-coral-soft p-3 text-sm font-bold text-coral-ink">
      {message}
    </p>
  )
}
