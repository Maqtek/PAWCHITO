import { Pill, Plus, Trash2 } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { PetIllustration } from '../../components/illustrations/PetIllustration'
import { CareStatusScale } from '../../components/pet/CareStatusScale'
import {
  Avatar,
  Badge,
  Button,
  Card,
  CountBadge,
  Dropdown,
  EmptyState,
  IconButton,
  menuItemClass,
  Modal,
  ProgressBar,
  SelectField,
  Spinner,
  Tabs,
  TextareaField,
  TextField,
} from '../../components/ui'
import { PageHeader } from '../../layouts/PageHeader'
import {
  appointmentStatusLabel,
  appointmentStatusTone,
  eventCategoryLabel,
  eventCategoryTone,
} from '../../lib/labels'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-lg font-extrabold">{title}</h2>
      <Card className="flex flex-wrap items-center gap-4 p-6">{children}</Card>
    </section>
  )
}

export function UiKitPage() {
  const [modalOpen, setModalOpen] = useState(false)
  const [tab, setTab] = useState<'all' | 'treatment' | 'routine'>('all')

  return (
    <>
      <PageHeader eyebrow="Разработка" title="UI-кит" description="Все элементы интерфейса на одной странице." />

      <Section title="Кнопки">
        <Button icon={Plus}>Основная</Button>
        <Button variant="secondary">Вторичная</Button>
        <Button variant="ghost">Тихая</Button>
        <Button variant="danger" icon={Trash2}>
          Опасная
        </Button>
        <Button size="sm">Маленькая</Button>
        <Button size="lg">Большая</Button>
        <Button disabled>Недоступна</Button>
        <IconButton icon={Pill} label="Иконка" />
      </Section>

      <Section title="Статус ухода, типы событий, статусы записи">
        <CareStatusScale status="treatment" />
        <CareStatusScale status={null} />
        <div className="flex flex-wrap gap-2">
          {Object.entries(eventCategoryLabel).map(([key, label]) => (
            <Badge key={key} tone={eventCategoryTone[key as keyof typeof eventCategoryTone]}>
              {label}
            </Badge>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(appointmentStatusLabel).map(([key, label]) => (
            <Badge key={key} tone={appointmentStatusTone[key as keyof typeof appointmentStatusTone]}>
              {label}
            </Badge>
          ))}
          <CountBadge count={3} label="Счётчик: 3" />
        </div>
      </Section>

      <Section title="Поля">
        <div className="grid w-full gap-4 sm:grid-cols-2">
          <TextField label="Кличка" placeholder="Майло" hint="До 50 символов" />
          <TextField label="С ошибкой" defaultValue="" error="Заполните поле" />
          <SelectField
            label="Вид"
            placeholder="Выберите вид"
            defaultValue=""
            options={[
              { value: 'dog', label: 'Собака' },
              { value: 'cat', label: 'Кошка' },
              { value: 'other', label: 'Другое' },
            ]}
          />
          <TextareaField label="Заметка" placeholder="Как прошёл день" />
        </div>
      </Section>

      <Section title="Вкладки и прогресс">
        <Tabs
          label="Тип события"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'all', label: 'Все' },
            { id: 'treatment', label: 'Лечение' },
            { id: 'routine', label: 'Уход' },
          ]}
        />
        <div className="w-full max-w-md">
          <ProgressBar value={6} max={14} label="Прогресс курса" />
          <p className="mt-1 text-xs text-ink-muted">6 из 14 приёмов</p>
        </div>
      </Section>

      <Section title="Иллюстрации и аватары">
        <PetIllustration species="dog" name="Майло" size="lg" />
        <PetIllustration species="cat" name="Барсик" />
        <PetIllustration species="other" size="sm" />
        <Avatar name="Анна Смирнова" />
      </Section>

      <Section title="Карточки">
        <Card className="w-48 p-4">Обычная</Card>
        <Card tone="muted" className="w-48 p-4">
          Приглушённая
        </Card>
        <Card tone="primary" className="w-48 p-4">
          Акцентная
        </Card>
        <Card tone="sand" className="w-48 p-4">
          Песочная
        </Card>
      </Section>

      <Section title="Окна, меню, загрузка, пустое состояние">
        <Button onClick={() => setModalOpen(true)}>Открыть окно</Button>
        <Modal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Новое дело"
          footer={
            <>
              <Button variant="secondary" onClick={() => setModalOpen(false)}>
                Отмена
              </Button>
              <Button onClick={() => setModalOpen(false)}>Сохранить</Button>
            </>
          }
        >
          <TextField label="Название" placeholder="Почистить зубы" />
        </Modal>
        <Dropdown label="Пример меню" button={<span className="rounded-xl border border-line px-4 py-2 text-sm font-bold">Меню</span>}>
          {(close) => (
            <button type="button" className={menuItemClass} onClick={close}>
              Пункт меню
            </button>
          )}
        </Dropdown>
        <Spinner label="Загрузка" />
        <EmptyState className="w-full" icon={Pill} title="Пока пусто" description="Так выглядит пустой раздел." />
      </Section>
    </>
  )
}
