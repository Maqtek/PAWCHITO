# PAWCHITO — контракты API

Черновик REST-контракта поверх [usecases.pdf](usecases.pdf) (US-xx), [требований](Требования_Pawchito.md) (FR-xx) и [бизнес-правил](Бизнес-правила_Pawchito.md) (БП §x). Финальный источник правды — `openapi.json`, генерируемый из кода FastAPI; этот файл — проектный черновик до реализации, обновляется вместе с бэкендом. Термины и значения enum — по [глоссарию](Глоссарий_Pawchito.md). Значения полей в примерах условные.

Версия 1.1 · 12.10.2026 — приведён к требованиям v1.1, см. [журнал решений](Решения_Pawchito.md). Пометка **(расш.)** — расширенная версия, остальное — MVP.

## Общие правила

- Все пути ниже — относительно префикса `/api`: `POST /auth/login` означает `POST /api/auth/login`.
- **Авторизация** (БП §1, Стек «Авторизация»):
  - запросы требуют `Authorization: Bearer <access_token>`, кроме `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/recover`;
  - access-токен живёт 15 минут;
  - refresh-токен приходит в cookie `refresh_token; HttpOnly; Secure; SameSite=Strict; Path=/api/auth; Max-Age=2592000` и в теле ответа не передаётся.
- **Роли:** `/pets`, `/appointments`, `/reminders`, `/home`, `/calendar` — только owner; `/clinic/*` — только clinic; `/admin/*` — только admin.
- **Коды ответа:**
  - `401` — нет токена или он истёк; фронт один раз вызывает `POST /auth/refresh` и повторяет запрос;
  - `403` — действие вне роли или пользователь заблокирован;
  - `403 {"detail": "password_change_required"}` — у клиники временный пароль; доступны только `GET /users/me`, `POST /auth/change-password`, `POST /auth/logout`;
  - `404` — объект не найден или принадлежит другому пользователю (существование чужих данных не раскрываем);
  - `409` — конфликт: занятый слот, занятый email, недопустимый переход статуса;
  - `422` — невалидные данные;
  - `429` — превышено число попыток входа или восстановления (5 попыток, затем пауза 15 минут).
- Формат ошибки: `{"detail": "..."}`.
- Каждый ответ содержит заголовок `X-Request-ID` — его указывают в баг-репортах, по нему ищут запись в логах.
- **Время:**
  - дата и время — ISO 8601 со смещением; сервер отдаёт время в часовом поясе Europe/Moscow (`2026-10-15T10:00:00+03:00`) и принимает любое смещение;
  - дата без времени — `YYYY-MM-DD`, время суток — `HH:MM`.
- Слот врача — 30 минут в часы работы клиники, запись — максимум на 30 дней вперёд (FR-11, БП §5).
- Архивные объекты (питомцы, врачи, клиники) в списки по умолчанию не попадают. У объекта поле `archived_at`: `null` или дата архивирования.

## Перечисления

| Enum | Значения |
|---|---|
| `role` | `owner`, `clinic`, `admin` |
| `species` | `dog`, `cat`, `other` |
| `sex` | `male`, `female`, `unknown` |
| `care_status` | `routine`, `attention`, `treatment`, `recovery`, `prevention` |
| `condition_kind` | `allergy`, `chronic` |
| `level` (аппетит, энергия) | `low`, `normal`, `high` |
| `data_source` (особенности, наблюдения, прививки) | `owner`, `clinic` |
| `appointment_status` | `requested`, `confirmed`, `completed`, `cancelled` |
| `appointment_reason` | `checkup`, `vaccination`, `illness`, `follow_up`, `other` |
| `cancelled_by` | `owner`, `clinic`, `system` |
| `reminder_source` | `prescription`, `custom` |
| `reminder_status` | `pending`, `done`, `skipped` |
| `event_category` | `treatment`, `routine`, `prevention` |
| `notification_type` | `appointment_requested`, `appointment_cancelled_by_owner`, `appointment_cancelled_pet_archived`, `appointment_confirmed`, `appointment_cancelled_by_clinic`, `appointment_cancelled_clinic_unavailable`, `outcome_added`, `pet_updated_by_clinic`, `appointment_rescheduled` (расш.) |

Подписи для интерфейса и связь причины обращения с типом события — в глоссарии и БП §5.

## Объекты

Ниже — полные формы. В таблицах эндпоинтов на них ссылаются по имени (`Pet`, `Appointment` и т. д.).

**User**

```json
{"id": 1, "email": "owner@example.com", "role": "owner", "full_name": "Иванов И.И.", "must_change_password": false}
```

**Token** — плюс `Set-Cookie: refresh_token=...`

```json
{"access_token": "eyJhbGciOi...", "token_type": "bearer", "expires_in": 900}
```

**Pet** — `photo_url: null` означает, что фронт показывает иллюстрацию по `species`; `care_status: null` — статуса ещё нет (БП §6.3).

```json
{
  "id": 10, "owner_id": 1, "name": "Барсик", "species": "cat", "breed": "Британская короткошёрстная",
  "birth_date": "2022-05-01", "sex": "male", "photo_url": "/media/3f2c9a1e.webp",
  "care_status": "treatment", "care_status_set_at": "2026-10-15T10:40:00+03:00",
  "care_status_clinic": {"id": 2, "name": "ВетДоктор"}, "archived_at": null
}
```

**Condition**

```json
{"id": 5, "pet_id": 10, "kind": "allergy", "title": "Аллергия на курицу", "description": "Сыпь, зуд", "source": "owner", "archived_at": null}
```

**Observation** — вес в кг.

```json
{"id": 7, "pet_id": 10, "date": "2026-10-10", "weight": 4.2, "appetite": "normal", "energy": "normal", "symptoms": null, "note": "Активный, ест хорошо", "source": "owner"}
```

**Vaccination**

```json
{"id": 3, "pet_id": 10, "name": "Рабис", "date": "2026-01-15", "next_date": "2027-01-15", "source": "owner", "appointment_id": null}
```

**Clinic** — `work_days`: 1 — понедельник … 7 — воскресенье.

```json
{"id": 2, "name": "ВетДоктор", "address": "ул. Ленина, 10", "phone": "+79990000000", "opens_at": "09:00", "closes_at": "20:00", "work_days": [1, 2, 3, 4, 5, 6]}
```

**AdminClinic** — Clinic и поля администратора.

```json
{
  "id": 2, "name": "ВетДоктор", "address": "ул. Ленина, 10", "phone": "+79990000000",
  "opens_at": "09:00", "closes_at": "20:00", "work_days": [1, 2, 3, 4, 5, 6],
  "archived_at": null, "account": {"id": 6, "email": "clinic2@example.com", "is_active": true},
  "future_appointments_count": 7
}
```

**Vet**

```json
{"id": 4, "clinic_id": 2, "full_name": "Петров П.П.", "specialization": "терапевт", "on_vacation": false, "archived_at": null}
```

**Slot**

```json
{"slot_start": "2026-10-15T10:00:00+03:00", "slot_end": "2026-10-15T10:30:00+03:00"}
```

**Prescription**

```json
{"id": 8, "drug": "Амоксициллин", "dosage": "1 таблетка 250 мг", "times": ["09:00", "21:00"], "duration_days": 7, "start_date": "2026-10-15"}
```

**Appointment** — `outcome` заполнен только у `completed`.

```json
{
  "id": 20, "pet": {"id": 10, "name": "Барсик"}, "clinic": {"id": 2, "name": "ВетДоктор"},
  "vet": {"id": 4, "full_name": "Петров П.П."},
  "slot_start": "2026-10-15T10:00:00+03:00", "slot_end": "2026-10-15T10:30:00+03:00",
  "reason": "vaccination", "reason_comment": "Плановая от бешенства",
  "status": "completed", "cancelled_by": null, "clinic_comment": null,
  "outcome": {
    "conclusion": "Здоров, плановая вакцинация", "recommendations": "Повторный осмотр через год",
    "care_status": "prevention", "completed_at": "2026-10-15T10:40:00+03:00",
    "prescriptions": [], "vaccinations": [{"id": 9, "name": "Рабис", "date": "2026-10-15", "next_date": "2027-10-15", "source": "clinic", "appointment_id": 20}]
  }
}
```

**Reminder** — `is_overdue` вычисляется: `pending`, а `due_at` уже прошло.

```json
{
  "id": 15, "pet_id": 10, "source": "prescription", "prescription_id": 8,
  "title": "Амоксициллин, 1 таблетка 250 мг", "category": "treatment",
  "due_at": "2026-10-16T09:00:00+03:00", "status": "pending", "is_overdue": false,
  "done_at": null, "repeat_interval_days": null, "series_id": null
}
```

**Notification** — `link` — путь во фронте.

```json
{"id": 31, "type": "appointment_confirmed", "text": "ВетДоктор подтвердила запись Барсика на 15 октября, 10:00", "link": "/appointments/20", "created_at": "2026-10-12T18:05:00+03:00", "read_at": null}
```

**CalendarEvent** — `type`: `reminder`, `appointment`, `vaccination_due`. У `vaccination_due` в `at` только дата.

```json
{"type": "reminder", "id": 15, "at": "2026-10-16T09:00:00+03:00", "title": "Амоксициллин, 1 таблетка 250 мг", "category": "treatment", "status": "pending", "is_overdue": false}
```

## 1. Аккаунт и доступ (US-01–03, US-36; FR-01–02, FR-28–30)

| Метод | Путь | Роль | Тело запроса | Ответ |
|---|---|---|---|---|
| POST | `/auth/register` | Гость | `{"email": "owner@example.com", "password": "secret123", "full_name": "Иванов И.И."}` | `201` `{"user": User, "recovery_code": "K7QM-2XPA-9RTD-4WNB", ...Token}` + cookie<br>`409` email занят · `422` пароль короче 8 символов |
| POST | `/auth/login` | Гость | `{"email": "owner@example.com", "password": "secret123"}` | `200` Token + cookie<br>`401` неверный email или пароль · `403` аккаунт заблокирован · `429` |
| POST | `/auth/refresh` | по cookie | — | `200` Token + новая cookie, старый refresh-токен отозван<br>`401` токена нет, истёк или отозван |
| POST | `/auth/logout` | по cookie | — | `204`, cookie очищена, refresh-токен отозван |
| POST | `/auth/recover` | Гость | `{"email": "owner@example.com", "recovery_code": "K7QM-2XPA-9RTD-4WNB", "new_password": "newsecret1"}` | `200` `{"recovery_code": "P3LV-8HZC-1MEK-6YSU"}` — новый код, все сессии завершены<br>`400` неверный email или код · `429` |
| POST | `/auth/change-password` | owner / clinic / admin | `{"current_password": "secret123", "new_password": "newsecret1"}` | `200` Token + cookie; остальные сессии завершены, `must_change_password` сброшен<br>`400` неверный текущий пароль |
| GET | `/users/me` | owner / clinic / admin | — | `200` User |
| PATCH | `/users/me` | owner / clinic / admin | `{"full_name": "Иванова И.И."}` | `200` User. Email не меняется |
| POST | `/users/me/recovery-code` | owner | `{"current_password": "secret123"}` | `200` `{"recovery_code": "..."}`; старый код перестаёт действовать |

Пароль администратора сбрасывается CLI-командой бэкенда на сервере, через API — нет. Восстановление через email — FR-38 **(расш.)**, контракт появится на этапе 13.

## 2. Питомцы (US-04–08; FR-04, FR-39)

| Метод | Путь | Роль | Тело запроса | Ответ |
|---|---|---|---|---|
| GET | `/pets` | owner | — | `200` `[Pet]` — только активные |
| GET | `/pets?archived=true` **(расш.)** | owner | — | `200` `[Pet]` — только архивные |
| POST | `/pets` | owner | `{"name": "Барсик", "species": "cat", "breed": "Британская короткошёрстная", "birth_date": "2022-05-01", "sex": "male"}` | `201` Pet |
| GET | `/pets/{pet_id}` | owner | — | `200` Pet |
| PATCH | `/pets/{pet_id}` | owner | `{"name": "Барсик", "breed": "Британская короткошёрстная"}` | `200` Pet. Фото и статус ухода владелец не меняет |
| POST | `/pets/{pet_id}/archive` | owner | — | `200` `{"pet": Pet, "cancelled_appointments": 1, "deleted_reminders": 5}` — будущие записи отменены (`cancelled_by: system`), запланированные дела удалены, клиники уведомлены |
| POST | `/pets/{pet_id}/restore` **(расш.)** | owner | — | `200` Pet |

US-08 «Смена питомца» — переключатель на фронте поверх `GET /pets`, отдельного эндпоинта не требует. Выбранный питомец хранится на клиенте и передаётся в запросы как `pet_id`.

## 3. Здоровье (US-09–11; FR-06–08)

| Метод | Путь | Роль | Тело запроса | Ответ |
|---|---|---|---|---|
| GET | `/pets/{pet_id}/conditions` | owner | — | `200` `[Condition]` — свои и добавленные клиникой |
| POST | `/pets/{pet_id}/conditions` | owner | `{"kind": "allergy", "title": "Аллергия на курицу", "description": "Сыпь, зуд"}` | `201` Condition (`source: owner`) |
| PATCH | `/pets/{pet_id}/conditions/{id}` | owner | `{"description": "Сыпь, зуд, покраснение"}` | `200` Condition<br>`403` запись добавлена клиникой |
| POST | `/pets/{pet_id}/conditions/{id}/archive` | owner | — | `200` Condition<br>`403` запись добавлена клиникой |
| GET | `/pets/{pet_id}/observations?date_from=2026-10-01&date_to=2026-10-31` | owner | — | `200` `[Observation]` — от новых к старым |
| POST | `/pets/{pet_id}/observations` | owner | `{"date": "2026-10-10", "weight": 4.2, "appetite": "normal", "energy": "normal", "note": "Активный, ест хорошо"}` | `201` Observation<br>`422` не заполнено ни одно поле, кроме даты |
| GET | `/pets/{pet_id}/vaccinations` | owner | — | `200` `[Vaccination]` — от владельца и от клиник |
| POST | `/pets/{pet_id}/vaccinations` | owner | `{"name": "Рабис", "date": "2026-01-15", "next_date": "2027-01-15"}` | `201` Vaccination (`source: owner`) |
| PATCH | `/pets/{pet_id}/vaccinations/{id}` | owner | `{"next_date": "2027-02-01"}` | `200` Vaccination<br>`403` прививка внесена клиникой |
| DELETE | `/pets/{pet_id}/vaccinations/{id}` | owner | — | `204`<br>`403` прививка внесена клиникой |

Лента истории перенесена на этап 11 — раздел 7.

## 4. Запись к ветеринару (US-13–18; FR-10–14)

| Метод | Путь | Роль | Тело запроса | Ответ |
|---|---|---|---|---|
| GET | `/clinics` | owner | — | `200` `[Clinic]` — только активные |
| GET | `/clinics/{clinic_id}/vets` | owner | — | `200` `[Vet]` — без отпуска и архива |
| GET | `/clinics/{clinic_id}/vets/{vet_id}/slots?date=2026-10-15` | owner | — | `200` `[Slot]` — свободные; пустой список в нерабочий день<br>`422` дата в прошлом или дальше 30 дней |
| POST | `/appointments` | owner | `{"pet_id": 10, "vet_id": 4, "slot_start": "2026-10-15T10:00:00+03:00", "reason": "vaccination", "reason_comment": "Плановая от бешенства"}` | `201` Appointment (`status: requested`); клиника получает уведомление<br>`409` `{"detail": "Слот уже занят"}`<br>`422` время вне сетки, врач или клиника недоступны |
| GET | `/appointments/{id}` | owner | — | `200` Appointment |
| POST | `/appointments/{id}/cancel` | owner | — | `200` Appointment (`status: cancelled`, `cancelled_by: owner`); клиника получает уведомление<br>`409` приём уже начался или запись в конечном статусе |
| GET | `/pets/{pet_id}/appointments?status=completed` | owner | — | `200` `[Appointment]` — предстоящие и история с итогами; без `status` — все |

Клиника определяется по врачу, поэтому `clinic_id` в теле не передаётся. Причина — значение `appointment_reason`; тип события в календаре сервер выводит из неё (БП §5).

## 5. Кабинет клиники (US-19–25, US-38; FR-13, FR-15–19, FR-32–33, FR-36)

### Записи

| Метод | Путь | Роль | Тело запроса | Ответ |
|---|---|---|---|---|
| GET | `/clinic/appointments?status=requested&date_from=2026-10-15&date_to=2026-10-21&vet_id=4` | clinic | — | `200` `[Appointment]`. Фильтры необязательны. Также `awaiting_outcome=true` — «Ждут итога», `requires_decision=true` — записи врачей в отпуске или архиве |
| POST | `/clinic/appointments/{id}/confirm` | clinic | — | `200` Appointment (`status: confirmed`); владелец получает уведомление<br>`409` статус не `requested` |
| POST | `/clinic/appointments/{id}/cancel` | clinic | `{"comment": "Врач заболел, перезапишитесь на другое время"}` | `200` Appointment (`cancelled_by: clinic`, `clinic_comment`); владелец получает уведомление<br>`422` без комментария · `409` конечный статус |
| POST | `/clinic/appointments/{id}/reschedule` **(расш.)** | clinic | `{"vet_id": 5, "slot_start": "2026-10-16T09:00:00+03:00", "comment": "Перенесли к другому врачу"}` | `200` Appointment (`status: confirmed`); владелец получает уведомление<br>`409` слот занят |
| POST | `/clinic/appointments/{id}/outcome` | clinic | см. ниже | `200` `{"appointment": Appointment, "created_reminders": 14}`<br>`409` статус не `confirmed` или время приёма не наступило · `422` нет заключения или статуса ухода |

Тело `outcome` — одна транзакция (FR-19, БП §6.1). Обязательны `conclusion` и `care_status`, остальное — по необходимости.

```json
{
  "conclusion": "Отит правого уха",
  "recommendations": "Повторный осмотр через 10 дней",
  "care_status": "treatment",
  "prescriptions": [{"drug": "Амоксициллин", "dosage": "1 таблетка 250 мг", "times": ["09:00", "21:00"], "duration_days": 7, "start_date": "2026-10-15"}],
  "vaccinations": [{"name": "Рабис", "date": "2026-10-15", "next_date": "2027-10-15"}],
  "pet_update": {"weight": 4.3, "breed": "Британская короткошёрстная", "birth_date": "2022-05-01", "sex": "male"},
  "conditions": [{"kind": "chronic", "title": "Хронический отит", "description": "Обострения осенью"}]
}
```

- Сервер создаёт дела курса на каждую дату и время рецепта, пропуская прошедшее время.
- Вес сохраняется наблюдением с `source: clinic`, прививки и особенности здоровья — тоже с `source: clinic`.
- Владельцу уходят уведомления `outcome_added` и, если изменились данные, `pet_updated_by_clinic`.
- Фото загружается отдельным запросом после итога.

### Карточка питомца

Чтение — при неотменённой записи питомца в эту клинику; изменение — только после завершённого приёма (BR-10.2, FR-18, FR-32–33). В остальных случаях — `404`.

| Метод | Путь | Роль | Тело запроса | Ответ |
|---|---|---|---|---|
| GET | `/clinic/pets/{pet_id}` | clinic | — | `200` `{"pet": Pet, "conditions": [Condition], "vaccinations": [Vaccination], "appointments": [Appointment]}` — приёмы только этой клиники |
| GET | `/clinic/pets/{pet_id}/observations?date_from=2026-09-01` | clinic | — | `200` `[Observation]` |
| PATCH | `/clinic/pets/{pet_id}` | clinic | `{"breed": "Британская короткошёрстная", "birth_date": "2022-05-01", "sex": "male"}` | `200` Pet; владелец получает уведомление<br>`403` нет завершённого приёма |
| POST | `/clinic/pets/{pet_id}/weight` | clinic | `{"date": "2026-10-20", "weight": 4.4}` | `201` Observation (`source: clinic`); владелец получает уведомление |
| POST | `/clinic/pets/{pet_id}/conditions` | clinic | `{"kind": "allergy", "title": "Аллергия на пенициллин", "description": null}` | `201` Condition (`source: clinic`); владелец получает уведомление |
| PUT | `/clinic/pets/{pet_id}/photo` | clinic | `multipart/form-data`, поле `file` | `200` `{"photo_url": "/media/3f2c9a1e.webp"}` — заменяет прежнее фото; владелец получает уведомление<br>`413` больше 5 МБ · `415` не JPEG / PNG / WebP |

### Клиника и врачи

| Метод | Путь | Роль | Тело запроса | Ответ |
|---|---|---|---|---|
| GET | `/clinic` | clinic | — | `200` Clinic — своя клиника, только чтение |
| GET | `/clinic/vets?include_archived=true` | clinic | — | `200` `[Vet]`; без параметра — только активные |
| POST | `/clinic/vets` | clinic | `{"full_name": "Петров П.П.", "specialization": "терапевт"}` | `201` Vet |
| PATCH | `/clinic/vets/{id}` | clinic | `{"on_vacation": true}` | `200` Vet. Будущие записи не отменяются, они попадают в `requires_decision` |
| POST | `/clinic/vets/{id}/archive` | clinic | — | `200` Vet |
| POST | `/clinic/vets/{id}/restore` | clinic | — | `200` Vet |

Врачей не удаляют — только архивируют (BR-05.5, BR-10.7).

## 6. Дела (US-26–29; FR-20–23)

| Метод | Путь | Роль | Тело запроса | Ответ |
|---|---|---|---|---|
| GET | `/reminders?pet_id=10&date_from=2026-10-12&date_to=2026-10-20&status=pending&prescription_id=8` | owner | — | `200` `[Reminder]`. Фильтры необязательны; `prescription_id` — дела одного курса (раздел «Курс лечения») |
| POST | `/reminders` | owner | `{"pet_id": 10, "title": "Почистить зубы", "due_at": "2026-10-20T08:00:00+03:00", "category": "routine", "repeat_interval_days": 7}` | `201` Reminder (`source: custom`). `category` по умолчанию — `routine`; `repeat_interval_days` — `null` или от 1 до 365 |
| POST | `/reminders/{id}/done` | owner | — | `200` `{"reminder": Reminder, "next": Reminder}`; `next` — следующее дело серии, у разового дела — `null`<br>`409` статус не `pending` |
| POST | `/reminders/{id}/skip` | owner | — | `200` `{"reminder": Reminder, "next": Reminder}` — пропуск не обрывает серию<br>`409` статус не `pending` |
| DELETE | `/reminders/{id}` | owner | — | `204` — удаляет дело и будущие дела серии<br>`403` дело курса |
| GET | `/prescriptions/{id}/progress` | owner | — | `200` `{"prescription_id": 8, "total": 14, "done": 6, "skipped": 1, "pending": 7}` |

- Следующее дело серии получает дату `due_at` + `repeat_interval_days`, считая от плановой даты, а не от момента отметки (БП §7).
- Дела курса (`source: prescription`) создаёт система внутри `POST /clinic/appointments/{id}/outcome` — отдельного эндпоинта на создание нет (актёр «Система» на диаграмме).

## 7. Главная, календарь, лента (US-12, US-30–31; FR-09, FR-24–25, FR-37)

| Метод | Путь | Роль | Тело запроса | Ответ |
|---|---|---|---|---|
| GET | `/home/summary?pet_id=10` | owner | — | `200` см. ниже |
| GET | `/calendar?pet_id=10` | owner | — | `200` `{"today": [CalendarEvent], "tomorrow": [CalendarEvent], "later": [CalendarEvent]}` — «today» включает просроченные дела, «later» — до 30 дней вперёд, прошлое не попадает |
| GET | `/calendar?pet_id=10&category=treatment` **(расш.)** | owner | — | то же, только события указанного типа |
| GET | `/pets/{pet_id}/timeline?before=2026-10-01&limit=50` | owner | — | `200` `[{"type": "observation", "date": "2026-10-10", "data": Observation}, {"type": "appointment", "date": "2026-10-15", "data": Appointment}, {"type": "prescription", "date": "2026-10-15", "data": Prescription}, {"type": "vaccination", "date": "2026-01-15", "data": Vaccination}]` — от новых к старым; отменённые записи и отдельные дела не входят |

Ответ `GET /home/summary`:

```text
{
  "pet": Pet,
  "active_courses": [{"prescription_id": 8, "drug": "Амоксициллин", "total": 14, "done": 6, "skipped": 1}],
  "today": [Reminder],              — дела на сегодня вместе с просроченными
  "next_appointment": Appointment | null
}
```

Последние 5 уведомлений главная берёт из `GET /notifications?limit=5`.

## 8. Уведомления (US-37; FR-34–35)

| Метод | Путь | Роль | Тело запроса | Ответ |
|---|---|---|---|---|
| GET | `/notifications?limit=50` | owner / clinic | — | `200` `{"unread_count": 3, "items": [Notification]}` — от новых к старым, максимум 50 |
| GET | `/notifications/unread-count` | owner / clinic | — | `200` `{"unread_count": 3}` — фронт опрашивает раз в 60 секунд |
| POST | `/notifications/{id}/read` | owner / clinic | — | `204` |
| POST | `/notifications/read-all` | owner / clinic | — | `204` |

Уведомления создаёт только сервер, при событиях из БП §9. Отдельного эндпоинта на создание нет.

## 9. Администрирование клиник (US-32–35, US-39; FR-03, FR-26, FR-31)

| Метод | Путь | Роль | Тело запроса | Ответ |
|---|---|---|---|---|
| GET | `/admin/clinics` | admin | — | `200` `[AdminClinic]` — включая скрытые |
| GET | `/admin/clinics/{id}` | admin | — | `200` AdminClinic. Значение `future_appointments_count` показывается перед скрытием |
| POST | `/admin/clinics` | admin | `{"name": "ВетДоктор", "address": "ул. Ленина, 10", "phone": "+79990000000", "opens_at": "09:00", "closes_at": "20:00", "work_days": [1, 2, 3, 4, 5, 6]}` | `201` AdminClinic<br>`422` `opens_at` не раньше `closes_at` |
| PATCH | `/admin/clinics/{id}` | admin | `{"phone": "+79991112233", "closes_at": "21:00"}` | `200` AdminClinic. Существующие записи не меняются, новые слоты считаются по новым часам |
| POST | `/admin/clinics/{id}/archive` | admin | — | `200` `{"clinic": AdminClinic, "cancelled_appointments": 7}` — будущие записи отменены (`cancelled_by: system`), владельцы уведомлены, аккаунт клиники заблокирован, его сессии завершены. История приёмов сохраняется (BR-10.5) |
| POST | `/admin/clinics/{id}/restore` | admin | — | `200` AdminClinic — аккаунт разблокирован, отменённые записи не восстанавливаются |
| POST | `/admin/clinics/{id}/account` | admin | `{"email": "clinic2@example.com"}` | `201` `{"user": User, "temporary_password": "vT4q-9mKx-2Lpe"}` — пароль показывается один раз, при первом входе его нужно сменить<br>`409` у клиники уже есть аккаунт или email занят |
| POST | `/admin/clinics/{id}/account/reset-password` | admin | — | `200` `{"temporary_password": "..."}` — сессии клиники завершены, `must_change_password: true` |

## Что изменилось относительно черновика

- Общие правила:
  - префикс `/api`;
  - время в Europe/Moscow со смещением вместо UTC;
  - коды `401` / `403` / `404` / `429` разведены;
  - заголовок `X-Request-ID`;
  - раздел «Перечисления» и общие объекты.
- **Авторизация:** добавлены `refresh`, `logout`, `recover`, `change-password`, `PATCH /users/me`, `POST /users/me/recovery-code`; refresh-токен в cookie.
- **Удаление → архивирование:**
  - `DELETE /pets/{id}` → `POST /pets/{id}/archive`;
  - для врачей и клиник — `archive` / `restore`;
  - `is_hidden` → `archived_at`;
  - `/hide` → `/archive`.
- **Отмена записи:** `DELETE /appointments/{id}` и `DELETE /clinic/appointments/{id}` → `POST …/cancel`; у клиники комментарий обязателен.
- **Перенос:** `PATCH /clinic/appointments/{id}` → `POST …/reschedule`, расширенная версия.
- **Причина записи** — справочник `appointment_reason`; `clinic_id` убран из тела `POST /appointments`.
- **Рецепт:** `schedule: "2 раза в день"` → `times: ["09:00", "21:00"]` + `start_date`.
- **Итог приёма:** добавлены `pet_update` и `conditions`. Отдельно добавлены эндпоинты клиники для веса, особенностей здоровья, данных и фото питомца.
- **Клиника:** читает данные питомца через `/clinic/pets/...`, а `/pets/...` остался только за владельцем. `GET /clinic/vets/{id}/appointments` заменён фильтрами `vet_id` и `requires_decision` в `GET /clinic/appointments`.
- **Дела:**
  - `source: course` → `prescription`;
  - `missed` → `skipped`;
  - `repeat_period: "P7D"` → `repeat_interval_days: 7`;
  - добавлены `category` и `is_overdue`;
  - `PATCH …/complete` → `POST …/done`;
  - добавлены `DELETE /reminders/{id}` и счётчик `skipped` в прогрессе курса.
- **Прививки:** `source: manual` → `owner` / `clinic`; добавлены `GET`, `PATCH`, `DELETE`.
- **Особенности здоровья:** добавлены поля `kind` и `source`, изменение и архивирование.
- **Календарь:** ответ сгруппирован на `today` / `tomorrow` / `later`; фильтр `category` — расширенная версия.
- **Лента истории** перенесена в раздел 7 (этап 11).
- **Новые разделы:** уведомления; часы работы клиники; аккаунт клиники с временным паролем и сбросом пароля.
