
/**
 * Моки MSW включаются только в режиме разработки
 * при явном указании VITE_MOCKS=true.
 * По умолчанию используется реальный API.
 */
export const mocksEnabled =
  import.meta.env.DEV &&
  import.meta.env.VITE_MOCKS === 'true'
