import { useQuery } from '@tanstack/react-query'
import { Cloud, Menu } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api, ApiError, type Account } from './api'
import { AuthScreen } from './components/AuthScreen'
import { DRAG_MIME, FileBrowser, type Crumb } from './components/FileBrowser'
import { SettingsPage, type Section } from './components/SettingsPage'
import { Sidebar } from './components/Sidebar'
import { Spinner } from './components/ui'

export default function App() {
  const status = useQuery({ queryKey: ['status'], queryFn: api.status })
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, retry: (n, e) => !(e instanceof ApiError && e.status === 401) && n < 1 })

  if (status.isLoading || me.isLoading)
    return <div className="flex h-full items-center justify-center text-zinc-400"><Spinner /></div>
  if (status.error)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <p className="font-medium">Can't reach the Drive Manager server</p>
        <p className="max-w-md text-sm text-zinc-500">Make sure the backend is running on port 8000, then reload this page. ({status.error.message})</p>
      </div>
    )
  if (!me.data) return <AuthScreen needsSetup={!!status.data?.needs_setup} />
  return <Shell />
}

function Shell() {
  const me = useQuery({ queryKey: ['me'], queryFn: api.me })
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: api.accounts })
  const [active, setActive] = useState<Account | null>(null)
  const [path, setPath] = useState<Crumb[]>([])
  const [settings, setSettings] = useState<Section | null>(null)
  const [drawer, setDrawer] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.has('connected')) toast.success('Account connected')
    if (params.has('connect_error')) toast.error(`Connection failed: ${params.get('connect_error')}`)
    if (params.size) history.replaceState(null, '', '/')
  }, [])

  useEffect(() => {
    const list = accounts.data ?? []
    if (!active || !list.some(a => a.id === active.id)) {
      const first = list[0] ?? null
      setActive(first)
      setPath(first ? [{ id: first.root_id, name: first.label }] : [])
    }
  }, [accounts.data, active])

  const select = (a: Account) => { setDrawer(false); setSettings(null); setActive(a); setPath([{ id: a.root_id, name: a.label }]) }

  const dropToAccount = (target: Account, e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(DRAG_MIME)
    if (!raw) return
    const { accountId } = JSON.parse(raw) as { accountId: string }
    if (accountId !== target.id) toast.info('Copying between accounts arrives with background transfers (milestone M4).')
  }

  const sidebar = (
    <Sidebar user={me.data!} accounts={accounts.data ?? []} activeId={active?.id ?? null} onSelect={select} onDropToAccount={dropToAccount}
      onOpenSettings={s => { setDrawer(false); setSettings(s ?? 'account') }} />
  )

  return (
    <div className="flex h-full">
      <div className="hidden md:flex">{sidebar}</div>
      {drawer && (
        <div className="fixed inset-0 z-40 flex md:hidden" onClick={() => setDrawer(false)}>
          <div className="absolute inset-0 bg-zinc-950/40" />
          <div className="animate-pop relative flex h-full bg-white shadow-2xl dark:bg-zinc-950" onClick={e => e.stopPropagation()}>{sidebar}</div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-200 px-2 md:hidden dark:border-zinc-800/80">
          <button onClick={() => setDrawer(true)} aria-label="Open menu" className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"><Menu size={19} /></button>
          <span className="font-semibold tracking-tight">Drive Manager</span>
        </div>
      {settings ? (
        <SettingsPage user={me.data!} section={settings} onSection={setSettings} onClose={() => setSettings(null)} />
      ) : active && path.length ? (
        <FileBrowser key={active.id} account={active} path={path} onNavigate={setPath} />
      ) : (
        <main className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-50 text-accent-600 dark:bg-accent-500/10"><Cloud size={30} /></div>
          <h2 className="text-xl font-semibold tracking-tight">Bring all your clouds together</h2>
          <p className="mt-2 max-w-sm text-sm text-zinc-500">Connect Google Drive, Dropbox, Box and more, then browse, search and move files across all of them from one place.</p>
        </main>
      )}
      </div>
    </div>
  )
}
