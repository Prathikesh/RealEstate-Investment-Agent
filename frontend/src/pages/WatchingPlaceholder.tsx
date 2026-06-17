import { Bookmark } from 'lucide-react'
import { useLang } from '../context/LanguageContext'

export default function WatchingPlaceholder() {
  const { t } = useLang()
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center p-6">
      <div className="w-14 h-14 rounded-2xl bg-accent/15 flex items-center justify-center">
        <Bookmark size={24} className="text-accent" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-ink">{t('watching')}</h2>
        <p className="text-sm text-muted mt-1 max-w-xs">
          Watch list requires broker authentication (Phase 3). Use the "Watch" button on any property detail page to save listings.
        </p>
      </div>
    </div>
  )
}
