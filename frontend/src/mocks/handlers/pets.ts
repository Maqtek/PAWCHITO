import { http, HttpResponse } from 'msw'
import { pets } from '../db'
import { authorizeAccount } from '../http-utils'
import { readServer } from '../server-state'

export const petHandlers = [
  http.get('*/api/pets', ({ request }) => {
    const account = authorizeAccount(readServer(), request, { allowed: ['owner'] })
    if (account instanceof Response) return account
    const archived = new URL(request.url).searchParams.get('archived') === 'true'
    return HttpResponse.json(
      pets.filter((pet) => pet.owner_id === account.id && (pet.archived_at !== null) === archived),
    )
  }),
]
