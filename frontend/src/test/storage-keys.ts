// Ключи хранилища и каналов приложения. В коде они не экспортируются — значения повторены здесь; поменяли там — меняйте здесь.

/** Выбранный питомец: STORAGE_KEY в features/pets/useSelectedPet.ts. */
export const SELECTED_PET_KEY = 'pawchito:selected-pet-id'

/** Метка «выход начат без сети»: LOGOUT_PENDING_KEY в api/session.ts. */
export const LOGOUT_PENDING_KEY = 'pawchito:logout-pending'

/** Канал событий сессии между вкладками: CHANNEL_NAME в api/session.ts. */
export const SESSION_CHANNEL = 'pawchito:session'

/** Состояние мок-сервера: SERVER_KEY в mocks/server-state.ts. */
export const MOCK_SERVER_KEY = 'pawchito:mock-server'
