import { HttpNetworkFrame } from 'msw/experimental'
import { describe, expect, it, vi } from 'vitest'
import { onUnhandledFrame } from './unhandled'

/** Кадр HTTP без настоящего источника: колбэку нужны только тип кадра и запрос. */
function httpFrame(url: string): HttpNetworkFrame {
  return Object.assign(Object.create(HttpNetworkFrame.prototype) as HttpNetworkFrame, {
    data: { request: new Request(url) },
  })
}

function handle(frame: HttpNetworkFrame) {
  const defaults = { warn: vi.fn(), error: vi.fn() }
  if (typeof onUnhandledFrame !== 'function') throw new Error('ожидался колбэк')
  void onUnhandledFrame({ frame, defaults })
  return defaults
}

describe('моки: запросы без обработчика', () => {
  it('предупреждают о запросе к /api/ без мока', () => {
    const defaults = handle(httpFrame('http://localhost:5173/api/vets?clinic_id=2'))
    expect(defaults.warn).toHaveBeenCalledOnce()
    expect(defaults.error).not.toHaveBeenCalled()
  })

  it.each([
    'http://localhost:5173/login',
    'http://localhost:5173/src/main.tsx',
    'http://localhost:5173/node_modules/.vite/deps/react.js',
    'http://localhost:5173/favicon.svg',
    'http://localhost:5173/apiary',
  ])('молчат про навигацию и ассеты: %s', (url) => {
    const defaults = handle(httpFrame(url))
    expect(defaults.warn).not.toHaveBeenCalled()
    expect(defaults.error).not.toHaveBeenCalled()
  })
})
