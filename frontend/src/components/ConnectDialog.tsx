import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '../api'
import { ProviderLogo } from './ProviderLogo'
import { Modal } from './ui'

export function ConnectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const providers = useQuery({ queryKey: ['providers'], queryFn: api.providers, enabled: open })
  const local = useMutation({
    mutationFn: api.connectLocal,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounts'] }); toast.success('Server folder connected'); onClose() },
    onError: e => toast.error(e.message),
  })

  const choose = (kind: string) => {
    if (kind === 'local') return local.mutate()
    window.location.href = api.oauthStartUrl(kind)
  }

  return (
    <Modal open={open} onClose={onClose} title="Connect a storage account">
      <p className="mb-3 text-sm text-zinc-500">You can connect as many accounts as you like, including several of the same kind.</p>
      <div className="space-y-1.5 pb-2">
        {providers.data?.map(p => {
          const disabled = !p.configured
          return (
            <button key={p.kind} disabled={disabled} onClick={() => choose(p.kind)}
              className="group flex w-full items-center gap-3 rounded-xl border border-zinc-200 px-3.5 py-3 text-left transition hover:border-accent-500/50 hover:bg-accent-50/60 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-zinc-200 disabled:hover:bg-transparent dark:border-zinc-800 dark:hover:bg-accent-500/10">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800"><ProviderLogo kind={p.kind} size={20} /></span>
              <span className="flex-1">
                <span className="block text-sm font-medium">{p.name}</span>
                <span className="block text-xs text-zinc-500">
                  {p.coming_soon ? 'Coming soon' : !p.configured ? 'Add OAuth keys on the server to enable' : p.kind === 'local' ? 'Use storage on this server' : 'Sign in to connect'}
                </span>
              </span>
              {!disabled && <ChevronRight size={16} className="text-zinc-400 transition group-hover:translate-x-0.5" />}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
