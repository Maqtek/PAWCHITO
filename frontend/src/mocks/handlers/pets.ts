import { http, HttpResponse } from 'msw'
import { pets, users } from '../db'
import { authorize } from '../http-utils'

export const petHandlers = [
  http.get('*/api/pets', ({ request }) => {
    const role = authorize(request, ['owner'])
    if (role instanceof Response) return role
    const archived = new URL(request.url).searchParams.get('archived') === 'true'
    return HttpResponse.json(
      pets.filter((pet) => pet.owner_id === users.owner.id && (pet.archived_at !== null) === archived),
    )
  }),
]
