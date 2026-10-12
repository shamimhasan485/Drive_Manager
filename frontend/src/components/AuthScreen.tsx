import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Cloud, Lock } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api'
import { Button, Input, Spinner } from './ui'

export function AuthScreen({ needsSetup }: { needsSetup: boolean }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const m = useMutation({
    mutationFn: () => (needsSetup ? api.setup(form) : api.login(form)),
    onSuccess: user => { qc.setQueryData(['me'], user); qc.invalidateQueries({ queryKey: ['status'] }) },
  })
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value })

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[880px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-accent-500/25 via-sky-400/20 to-emerald-400/20 blur-3xl" />
      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-600 text-white shadow-lg shadow-accent-600/30">
            <Cloud size={24} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{needsSetup ? 'Welcome to Drive Manager' : 'Sign in'}</h1>
          <p className="mt-1.5 text-sm text-zinc-500">
            {needsSetup ? 'Create the owner account for this server.' : 'All your clouds, one place.'}
          </p>
        </div>
        <form
          onSubmit={e => { e.preventDefault(); m.mutate() }}
          className="space-y-3 rounded-2xl border border-zinc-200 bg-white/80 p-6 shadow-xl shadow-zinc-900/5 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/80"
        >
          {needsSetup && <Input placeholder="Your name" value={form.name} onChange={set('name')} autoFocus required />}
          <Input type="email" placeholder="Email" value={form.email} onChange={set('email')} autoFocus={!needsSetup} required autoComplete="username" />
          <Input type="password" placeholder={needsSetup ? 'Password (10+ characters)' : 'Password'} value={form.password}
            onChange={set('password')} required minLength={needsSetup ? 10 : 1} autoComplete={needsSetup ? 'new-password' : 'current-password'} />
          {m.error && <p className="text-sm text-red-600">{m.error.message}</p>}
          <Button variant="primary" className="w-full !h-10" disabled={m.isPending}>
            {m.isPending ? <Spinner /> : needsSetup ? 'Create account' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-zinc-500">
          <Lock size={12} /> Self-hosted. Your files never leave your clouds.
        </p>
      </div>
    </div>
  )
}
