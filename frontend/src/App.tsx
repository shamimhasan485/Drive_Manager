import { useQuery } from '@tanstack/react-query'
import { Cloud } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api, ApiError, type Account } from './api'
import { AuthScreen } from './components/AuthScreen'
import { DRAG_MIME, FileBrowser, type Crumb } from './components/FileBrowser'
import { Sidebar } from './components/Sidebar'
import { Spinner } from './components/ui'

export default function App() {
  const status = useQuery({ queryKey: ['status'], queryFn: api.status })
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, retry: (n, e) => !(e instanceof ApiError && e.status === 401) && n < 1 })

  if (status.isLoading || me.isLoading)
    return <div className="flex h-full items-center justify-center text-zinc-400"><Spinner /></div>
  if (!me.data) return <AuthScreen needsSetup={!!status.data?.needs_setup} />
  return <Shell />
}

function Shell() {
  const me = useQuery({ queryKey: ['me'], queryFn: api.me })
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: api.accounts })
  const [active, setActive] = useState<Account | null>(null)
  const [path, setPath] = useState<Crumb[]>([])

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

  const select = (a: Account) => { setActive(a); setPath([{ id: a.root_id, name: a.label }]) }

  const dropToAccount = (target: Account, e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(DRAG_MIME)
    if (!raw) return
    const { accountId } = JSON.parse(raw) as { accountId: string }
    if (accountId !== target.id) toast.info('Copying between accounts arrives with background transfers (milestone M4).')
  }

  return (
    <div className="flex h-full">
      <Sidebar user={me.data!} accounts={accounts.data ?? []} activeId={active?.id ?? null} onSelect={select} onDropToAccount={dropToAccount} />
      {active && path.length ? (
        <FileBrowser key={active.id} account={active} path={path} onNavigate={setPath} />
      ) : (
        <main className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent-50 text-accent-600 dark:bg-accent-500/10"><Cloud size={30} /></div>
          <h2 className="text-xl font-semibold tracking-tight">Bring all your clouds together</h2>
          <p className="mt-2 max-w-sm text-sm text-zinc-500">Connect Google Drive, Dropbox, Box and more, then browse, search and move files across all of them from one place.</p>
        </main>
      )}
    </div>
  )
}
