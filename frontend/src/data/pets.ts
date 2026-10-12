export interface Pet {
  id: string;
  name: string;
  type: string;
  breed: string;
  age: string;
  status: string;
  tags: string[];
}

export const defaultPet: Pet = {
  id: '1',
  name: 'Майло',
  type: 'СОБАКА',
  breed: 'Золотистый ретривер',
  age: '4 года',
  status: 'Проходит курс лечения',
  tags: ['Плановый уход', 'Внимание', 'Лечение', 'Восстановление', 'Профилактика'],
};
