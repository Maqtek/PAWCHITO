import type { ReactNode } from 'react'
import type { Pet } from '../../api/schema'
import { cn } from '../../lib/cn'
import { formatAge } from '../../lib/format'
import { careStatusLabel, careStatusTone, speciesLabel } from '../../lib/labels'
import { PetIllustration } from '../illustrations/PetIllustration'
import { Card, toneInkClass } from '../ui'
import { CareStatusScale } from './CareStatusScale'

export interface PetCardProps {
  pet: Pet
  /** Дата, от которой считается возраст. */
  today: Date
  actions?: ReactNode
}

export function PetCard({ pet, today, actions }: PetCardProps) {
  const meta = [pet.breed, pet.birth_date && formatAge(pet.birth_date, today)].filter(Boolean).join(' · ')

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-4 p-5 sm:gap-6 sm:p-6">
        {pet.photo_url ? (
          <img src={pet.photo_url} alt={pet.name} className="size-20 shrink-0 rounded-3xl object-cover sm:size-28" />
        ) : (
          <PetIllustration species={pet.species} name={pet.name} size="lg" className="size-20 sm:size-28" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{pet.name}</h2>
            <span className="rounded-md bg-surface-muted px-2 py-0.5 text-[11px] font-extrabold tracking-wider text-ink-muted uppercase">
              {speciesLabel[pet.species]}
            </span>
          </div>
          {meta && <p className="mt-1 text-sm text-ink-muted">{meta}</p>}
          {pet.care_status && (
            <p className={cn('mt-2 flex flex-wrap items-center gap-x-2 text-sm font-bold', toneInkClass[careStatusTone[pet.care_status]])}>
              <span aria-hidden className="size-2 rounded-full bg-current" />
              {careStatusLabel[pet.care_status]}
              {pet.care_status_clinic && <span className="font-semibold text-ink-muted">· {pet.care_status_clinic.name}</span>}
            </p>
          )}
        </div>
        {actions}
      </div>
      <div className="border-t border-line bg-surface-muted px-5 py-4 sm:px-6">
        <CareStatusScale status={pet.care_status} />
      </div>
    </Card>
  )
}
