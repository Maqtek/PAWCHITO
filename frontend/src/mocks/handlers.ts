import { http, HttpResponse } from 'msw';
import { defaultPet } from '../data/pets';

export const handlers = [
  http.get('*/api/pets/current', () => {
    return HttpResponse.json(defaultPet);
  }),
];