import { AppRoutes } from '../app/routes'
import { renderWithProviders } from './render'

// Отдельно от render.tsx: его подключает setup.ts, и тогда все страницы приложения грузились бы в каждый тест.

/** Всё приложение на адресе route — как его откроет пользователь. */
export const renderRoute = (route: string) => renderWithProviders(<AppRoutes />, { route })
