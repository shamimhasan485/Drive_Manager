import { HardDrive } from 'lucide-react'

/** Simple brand-neutral marks; swap in official logos per each provider's brand guidelines. */
export function ProviderLogo({ kind, size = 18 }: { kind: string; size?: number }) {
  if (kind === 'gdrive')
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <path d="M8 3h8l6 10.5h-8z" fill="#FBBC04" /><path d="M2 13.5 8 3l4 7-6 10.5z" fill="#34A853" /><path d="M6 20.5l3-5h13l-3 5z" fill="#4285F4" />
      </svg>
    )
  if (kind === 'dropbox')
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill="#0061FF">
        <path d="m7 3 5 3.2L7 9.4 2 6.2zm10 0 5 3.2-5 3.2-5-3.2zM2 12.6l5-3.2 5 3.2-5 3.2zm15-3.2 5 3.2-5 3.2-5-3.2zM7 17l5-3.2 5 3.2-5 3.2z" />
      </svg>
    )
  if (kind === 'box')
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
        <rect x="2" y="5" width="20" height="14" rx="4" fill="#0061D5" />
        <text x="12" y="15.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="white" fontFamily="Inter, sans-serif">box</text>
      </svg>
    )
  return <HardDrive size={size} className="text-zinc-500" />
}
