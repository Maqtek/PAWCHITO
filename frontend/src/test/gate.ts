/** Ворота: тот, кто ждёт opened (обработчик запроса, очередь, onSubmit), держится, пока тест не вызовет release. */
export function createGate() {
  let release!: () => void
  const opened = new Promise<void>((resolve) => {
    release = resolve
  })
  return { opened, release }
}
