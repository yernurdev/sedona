import { Check } from 'lucide-react'
import { useState, type ReactNode } from 'react'

function read(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]')
  } catch {
    return []
  }
}

function linkify(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s)]+?)(?=[.,]?(?:\s|$))/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noreferrer" className="text-brand-deep underline underline-offset-2" onClick={(e) => e.stopPropagation()}>
        {part.replace(/^https?:\/\//, '')}
      </a>
    ) : (
      part
    ),
  )
}

// A to-do list whose ticks are remembered in this browser per case.
export default function Checklist({ items, storageKey }: { items: string[]; storageKey: string }) {
  const [done, setDone] = useState<string[]>(() => read(storageKey))
  const toggle = (item: string) => {
    const next = done.includes(item) ? done.filter((d) => d !== item) : [...done, item]
    setDone(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }
  if (items.length === 0) return <p className="text-sm text-ink-soft">Nothing due.</p>
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const on = done.includes(item)
        return (
          <li key={item}>
            <button
              type="button"
              onClick={() => toggle(item)}
              className="flex w-full items-start gap-3 rounded-[10px] px-2 py-2 text-left text-sm transition-colors hover:bg-ink/[.03]"
              aria-pressed={on}
            >
              <span className={`mt-px grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors ${on ? 'border-brand bg-brand text-white' : 'border-ink/25 bg-white'}`}>
                {on && <Check className="size-3" strokeWidth={3} />}
              </span>
              <span className={on ? 'text-ink-soft line-through decoration-ink/30' : ''}>{linkify(item)}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
