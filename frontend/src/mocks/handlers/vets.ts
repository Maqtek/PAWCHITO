import { http, HttpResponse } from 'msw'
import type { Vet, VetCreate, VetUpdate } from '../../api/schema'
import { authorizeClinic } from '../access'
import { notFound, readBody, validateBody } from '../http-utils'
import { newVet, readServer, updateServer, type MockServerState } from '../server-state'
import { normalizeText } from '../text-validation'
import { specializationError, vacationError, vetNameError } from '../vet-validation'

const vetNotFound = () => notFound('Врач не найден')

/** Врач своей клиники; врач другой клиники — как несуществующий, 404 (Р-39). */
function findVet(state: MockServerState, clinicId: number, rawId: unknown): Vet | undefined {
  const id = Number(rawId)
  return state.vets.find((vet) => vet.id === id && vet.clinic_id === clinicId)
}

// Как у бэкенда: сначала доступ, потом тело (422), потом поиск врача (404).
export const vetHandlers = [
  http.get('*/api/clinic/vets', ({ request }) => {
    const state = readServer()
    const clinicId = authorizeClinic(state, request)
    if (clinicId instanceof Response) return clinicId
    const includeArchived = new URL(request.url).searchParams.get('include_archived') === 'true'
    return HttpResponse.json(
      state.vets.filter((vet) => vet.clinic_id === clinicId && (includeArchived || vet.archived_at === null)),
    )
  }),

  http.post('*/api/clinic/vets', async ({ request }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      const clinicId = authorizeClinic(state, request)
      if (clinicId instanceof Response) return clinicId
      const invalid = validateBody({
        full_name: vetNameError(raw.full_name),
        specialization: 'specialization' in raw ? specializationError(raw.specialization) : null,
      })
      if (invalid) return invalid
      const body = raw as VetCreate
      // Новый врач не в отпуске: on_vacation из тела POST не берётся.
      const vet = newVet({
        id: state.nextVetId,
        clinic_id: clinicId,
        full_name: body.full_name.trim(),
        specialization: normalizeText(body.specialization),
      })
      state.nextVetId += 1
      state.vets.push(vet)
      return HttpResponse.json(vet, { status: 201 })
    })
  }),

  http.patch('*/api/clinic/vets/:id', async ({ request, params }) => {
    const raw = await readBody(request)
    return updateServer((state) => {
      const clinicId = authorizeClinic(state, request)
      if (clinicId instanceof Response) return clinicId
      // Проверяются только присланные поля; null проходит только у специализации — он её убирает.
      const sent = (field: string) => field in raw
      const invalid = validateBody({
        full_name: sent('full_name') ? vetNameError(raw.full_name) : null,
        specialization: sent('specialization') ? specializationError(raw.specialization) : null,
        on_vacation: sent('on_vacation') ? vacationError(raw.on_vacation) : null,
      })
      if (invalid) return invalid
      const vet = findVet(state, clinicId, params.id)
      if (!vet) return vetNotFound()
      const body = raw as VetUpdate
      if (body.full_name !== undefined) vet.full_name = body.full_name.trim()
      if (body.specialization !== undefined) vet.specialization = normalizeText(body.specialization)
      if (body.on_vacation !== undefined) vet.on_vacation = body.on_vacation
      return HttpResponse.json(vet)
    })
  }),

  http.post('*/api/clinic/vets/:id/archive', ({ request, params }) =>
    updateServer((state) => {
      const clinicId = authorizeClinic(state, request)
      if (clinicId instanceof Response) return clinicId
      const vet = findVet(state, clinicId, params.id)
      if (!vet) return vetNotFound()
      // Повторное архивирование ничего не меняет. Флаг отпуска остаётся до возврата.
      vet.archived_at ??= new Date().toISOString()
      return HttpResponse.json(vet)
    }),
  ),

  http.post('*/api/clinic/vets/:id/restore', ({ request, params }) =>
    updateServer((state) => {
      const clinicId = authorizeClinic(state, request)
      if (clinicId instanceof Response) return clinicId
      const vet = findVet(state, clinicId, params.id)
      if (!vet) return vetNotFound()
      vet.archived_at = null
      return HttpResponse.json(vet)
    }),
  ),
]
