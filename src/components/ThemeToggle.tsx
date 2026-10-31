import { Moon, Sun } from 'lucide-react'
import { useTheme } from '@/lib/theme'

/** Light / dark switch. Shows the current theme by name and persists the choice. */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme()
  return (
    <div>
      {compact ? null : (
        <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          Theme · {theme === 'dark' ? 'Dark mode' : 'Light mode'}
        </p>
      )}
      <div role="radiogroup" aria-label="Color theme" className="grid grid-cols-2 gap-1 rounded-xl border border-line bg-raised p-1">
        {(
          [
            { id: 'light', label: 'Light', Icon: Sun },
            { id: 'dark', label: 'Dark', Icon: Moon },
          ] as const
        ).map(({ id, label, Icon }) => {
          const active = theme === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(id)}
              className={`flex min-h-[40px] items-center justify-center gap-2 rounded-lg text-sm font-medium transition ${
                active ? 'bg-brand text-onbrand shadow-glow' : 'text-muted hover:text-fg'
              }`}
            >
              <Icon size={15} aria-hidden />
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
