/** Совет в боковом меню владельца — подложка в форме кота, как в макете. */
export function CareTip() {
  return (
    <div className="relative px-5 pt-9 pb-5 text-sand-ink">
      <svg aria-hidden viewBox="0 0 200 132" preserveAspectRatio="none" className="absolute inset-0 size-full text-sand">
        <rect x="4" y="26" width="168" height="102" rx="28" fill="currentColor" />
        <path d="M20 40 32 4l24 26z" fill="currentColor" />
        <path d="M72 30 94 4l10 36z" fill="currentColor" />
        <path d="M168 100c20-4 30-20 24-42" fill="none" stroke="currentColor" strokeWidth={10} strokeLinecap="round" />
      </svg>
      <div className="relative">
        <p className="text-sm font-extrabold text-ink">Совет</p>
        <p className="mt-1 text-xs leading-relaxed">Короткие заметки в дневнике помогают врачу увидеть полную картину.</p>
      </div>
    </div>
  )
}
