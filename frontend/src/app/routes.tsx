import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { Spinner } from '../components/ui'
import { RequireRole } from '../features/session/RequireRole'
import { AppShell } from '../layouts/AppShell'
import { AdminClinicPage } from '../pages/admin/AdminClinicPage'
import { AdminClinicsPage } from '../pages/admin/AdminClinicsPage'
import { ChangePasswordPage } from '../pages/auth/ChangePasswordPage'
import { LoginPage } from '../pages/auth/LoginPage'
import { RecoverPage } from '../pages/auth/RecoverPage'
import { RegisterPage } from '../pages/auth/RegisterPage'
import { ClinicAppointmentsPage } from '../pages/clinic/ClinicAppointmentsPage'
import { ClinicPetPage } from '../pages/clinic/ClinicPetPage'
import { ClinicVetsPage } from '../pages/clinic/ClinicVetsPage'
import { NotFoundPage } from '../pages/common/NotFoundPage'
import { ProfilePage } from '../pages/common/ProfilePage'
import { AppointmentsPage } from '../pages/owner/AppointmentsPage'
import { CoursePage } from '../pages/owner/CoursePage'
import { HistoryPage } from '../pages/owner/HistoryPage'
import { HomePage } from '../pages/owner/HomePage'
import { PetsPage } from '../pages/owner/PetsPage'
import { TasksPage } from '../pages/owner/TasksPage'

// Витрина UI-кита попадает только в dev-сборку.
const UiKitPage = import.meta.env.DEV
  ? lazy(() => import('../pages/dev/UiKitPage').then((module) => ({ default: module.UiKitPage })))
  : null

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/recover" element={<RecoverPage />} />
      <Route
        path="/change-password"
        element={
          <RequireRole allow={['owner', 'clinic', 'admin']} passwordChange>
            <ChangePasswordPage />
          </RequireRole>
        }
      />
      <Route
        element={
          <RequireRole allow={['owner', 'clinic', 'admin']}>
            <AppShell />
          </RequireRole>
        }
      >
        <Route
          element={
            <RequireRole allow={['owner']}>
              <Outlet />
            </RequireRole>
          }
        >
          <Route index element={<HomePage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="course" element={<CoursePage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="appointments" element={<AppointmentsPage />} />
          <Route path="pets" element={<PetsPage />} />
        </Route>
        <Route
          path="clinic"
          element={
            <RequireRole allow={['clinic']}>
              <Outlet />
            </RequireRole>
          }
        >
          <Route index element={<Navigate to="appointments" replace />} />
          <Route path="appointments" element={<ClinicAppointmentsPage />} />
          <Route path="vets" element={<ClinicVetsPage />} />
          <Route path="pets/:petId" element={<ClinicPetPage />} />
        </Route>
        <Route
          path="admin"
          element={
            <RequireRole allow={['admin']}>
              <Outlet />
            </RequireRole>
          }
        >
          <Route index element={<Navigate to="clinics" replace />} />
          <Route path="clinics" element={<AdminClinicsPage />} />
          <Route path="clinics/:clinicId" element={<AdminClinicPage />} />
        </Route>
        <Route path="profile" element={<ProfilePage />} />
        {UiKitPage && (
          <Route
            path="dev/ui"
            element={
              <Suspense fallback={<Spinner />}>
                <UiKitPage />
              </Suspense>
            }
          />
        )}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
