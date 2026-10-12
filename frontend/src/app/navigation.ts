import { Building2, ClipboardList, House, Inbox, NotebookText, Route, Stethoscope, type LucideIcon } from 'lucide-react'
import type { Role } from '../api/schema'
import type { Tone } from '../lib/labels'

export interface NavItem {
  to: string
  label: string
  /** Подпись в нижней навигации на телефоне. */
  shortLabel: string
  icon: LucideIcon
  /** Цвет активного пункта — как у разделов в макете. */
  tone: Tone
}

export const navigation: Record<Role, NavItem[]> = {
  owner: [
    { to: '/', label: 'Главная', shortLabel: 'Главная', icon: House, tone: 'mint' },
    { to: '/tasks', label: 'Дела', shortLabel: 'Дела', icon: Inbox, tone: 'blush' },
    { to: '/course', label: 'Курс лечения', shortLabel: 'Курс', icon: Route, tone: 'sky' },
    { to: '/history', label: 'История', shortLabel: 'История', icon: NotebookText, tone: 'butter' },
    { to: '/appointments', label: 'Записи к врачу', shortLabel: 'Записи', icon: ClipboardList, tone: 'lilac' },
  ],
  clinic: [
    { to: '/clinic/appointments', label: 'Записи', shortLabel: 'Записи', icon: ClipboardList, tone: 'lilac' },
    { to: '/clinic/vets', label: 'Врачи', shortLabel: 'Врачи', icon: Stethoscope, tone: 'mint' },
  ],
  admin: [{ to: '/admin/clinics', label: 'Клиники', shortLabel: 'Клиники', icon: Building2, tone: 'sky' }],
}

export function homePathFor(role: Role): string {
  return navigation[role][0].to
}
