/** Моки включены в разработке, пока не задано VITE_API_MOCKS=false. */
export const mocksEnabled = import.meta.env.DEV && import.meta.env.VITE_API_MOCKS !== 'false'
