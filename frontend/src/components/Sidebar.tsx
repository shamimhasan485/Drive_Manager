import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Cloud, LogOut, Moon, MoreHorizontal, Plus, Sun, Unplug } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { api, type Account, type User } from '../api'
import { formatBytes } from '../lib/format'
import { applyTheme } from '../lib/theme'
import { ConnectDialog } from './ConnectDialog'
import { ProviderLogo } from './ProviderLogo'
import { Button } from './ui'

function QuotaBar({ account }: { account: Account }) {
  const q = useQuery({ queryKey: ['quota', account.id], queryFn: () => api.quota(account.id), staleTime: 5 * 60_000 })
  if (!q.data?.used) return null
  const pct = q.data.total ? Math.min(100, (q.data.used / q.data.total) * 100) : 0
  return (
    <div className="mt-1.5 pl-[30px] pr-1">
      {q.data.total ? (
        <div className="h-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct > 90 ? '#ef4444' : account.color }} />
        </div>
      ) : null}
      <p className="mt-1 text-[11px] text-zinc-500">
        {formatBytes(q.data.used)}{q.data.total ? ` of ${formatBytes(q.data.total)}` : ' used'}
      </p>
    </div>
  )
}

export function Sidebar({ user, accounts, activeId, onSelect, onDropToAccount }: {
  user: User; accounts: Account[]; activeId: string | null; onSelect: (a: Account) => void
  onDropToAccount: (a: Account, e: React.DragEvent) => void
}) {
  const qc = useQueryClient()
  const [connectOpen, setConnectOpen] = useState(false)
  const [menu, setMenu] = useState<string | null>(null)
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const disconnect = useMutation({
    mutationFn: api.disconnect,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); toast.success('Account disconnected') },
  })
  const logout = useMutation({ mutationFn: api.logout, onSettled: () => { qc.clear(); location.reload() } })

  const toggleTheme = () => { const next = !dark; setDark(next); applyTheme(next ? 'dark' : 'light') }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-zinc-200 bg-white/70 backdrop-blur dark:border-zinc-800/80 dark:bg-zinc-900/40">
      <div className="flex h-14 items-center gap-2.5 px-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-600 text-white shadow-sm shadow-accent-600/30"><Cloud size={17} /></div>
        <span className="font-semibold tracking-tight">Drive Manager</span>
      </div>

      <div className="px-3 pb-2">
        <Button variant="primary" className="w-full" onClick={() => setConnectOpen(true)}><Plus size={16} /> Connect account</Button>
      </div>

      <nav className="scroll-thin flex-1 overflow-y-auto px-2 py-2">
        <p className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Accounts</p>
        {accounts.length === 0 && <p className="px-2 py-3 text-sm text-zinc-500">No accounts yet. Connect your first drive to get started.</p>}
        {accounts.map(a => (
          <div key={a.id}
            onDragOver={e => { e.preventDefault(); setDropTarget(a.id) }}
            onDragLeave={() => setDropTarget(null)}
            onDrop={e => { setDropTarget(null); onDropToAccount(a, e) }}
            className={clsx('group relative mb-0.5 rounded-lg px-2 py-2 transition',
              activeId === a.id ? 'bg-accent-50 dark:bg-accent-500/10' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/60',
              dropTarget === a.id && 'ring-2 ring-accent-500')}>
            <button className="flex w-full items-center gap-2.5 text-left" onClick={() => onSelect(a)}>
              <span className="relative"><ProviderLogo kind={a.provider} size={20} />
                <span className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ring-2 ring-white dark:ring-zinc-900" style={{ background: a.color }} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={clsx('block truncate text-sm', activeId === a.id ? 'font-semibold text-accent-700 dark:text-accent-100' : 'font-medium')}>{a.label}</span>
              </span>
            </button>
            <button aria-label="Account options" onClick={() => setMenu(menu === a.id ? null : a.id)}
              className="absolute right-1.5 top-1.5 rounded-md p-1 text-zinc-400 opacity-0 transition hover:bg-zinc-200 group-hover:opacity-100 dark:hover:bg-zinc-700">
              <MoreHorizontal size={15} />
            </button>
            {menu === a.id && (
              <div className="animate-pop absolute right-1 top-8 z-20 w-44 rounded-lg border border-zinc-200 bg-white p-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                onMouseLeave={() => setMenu(null)}>
                <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                  onClick={() => { setMenu(null); if (confirm(`Disconnect ${a.label}? Your files stay in the cloud.`)) disconnect.mutate(a.id) }}>
                  <Unplug size={14} /> Disconnect
                </button>
              </div>
            )}
            <QuotaBar account={a} />
          </div>
        ))}
      </nav>

      <div className="flex items-center gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-accent-500 to-sky-500 text-xs font-semibold text-white">
          {user.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{user.name}</p>
          <p className="truncate text-xs text-zinc-500">{user.email}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label="Toggle theme" title="Toggle theme">{dark ? <Sun size={16} /> : <Moon size={16} />}</Button>
        <Button variant="ghost" size="icon" onClick={() => logout.mutate()} aria-label="Sign out" title="Sign out"><LogOut size={16} /></Button>
      </div>

      <ConnectDialog open={connectOpen} onClose={() => setConnectOpen(false)} />
    </aside>
  )
}
