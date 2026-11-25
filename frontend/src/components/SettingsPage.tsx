import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Check, Cloud, Copy, ExternalLink, Globe, KeyRound, Shield, Trash2, User as UserIcon, UserPlus, Users, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { api, type SecretKey, type SettingsPage as Page, type SettingsUpdate, type User } from '../api'
import { ProviderLogo } from './ProviderLogo'
import { Button, Input, Modal, Spinner } from './ui'

export type Section = 'account' | 'providers' | 'users' | 'general'

const SECTIONS: { id: Section; label: string; icon: typeof Cloud; admin?: boolean }[] = [
  { id: 'account', label: 'My account', icon: UserIcon },
  { id: 'providers', label: 'Cloud providers', icon: Cloud, admin: true },
  { id: 'users', label: 'Family & users', icon: Users, admin: true },
  { id: 'general', label: 'General', icon: Globe, admin: true },
]

export function SettingsPage({ user, section, onSection, onClose }:
  { user: User; section: Section; onSection: (s: Section) => void; onClose: () => void }) {
  const sections = SECTIONS.filter(s => !s.admin || user.is_admin)
  const current = sections.some(s => s.id === section) ? section : 'account'
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-zinc-200 px-6 dark:border-zinc-800/80">
        <h1 className="font-semibold">Settings</h1>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close settings"><X size={17} /></Button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-zinc-200 p-3 md:w-56 md:flex-col md:border-b-0 md:border-r dark:border-zinc-800/80">
          {sections.map(s => (
            <button key={s.id} onClick={() => onSection(s.id)}
              className={clsx('flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition',
                current === s.id ? 'bg-accent-50 font-semibold text-accent-700 dark:bg-accent-500/10 dark:text-accent-100' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/60')}>
              <s.icon size={16} /> {s.label}
            </button>
          ))}
        </nav>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl space-y-6 p-6 pb-16">
            {current === 'account' && <AccountSection user={user} />}
            {current === 'providers' && <ProvidersSection />}
            {current === 'users' && <UsersSection me={user} />}
            {current === 'general' && <GeneralSection />}
          </div>
        </div>
      </div>
    </main>
  )
}

/* ---------- building blocks ---------- */

function Card({ title, description, icon, children, footer }:
  { title: string; description?: ReactNode; icon?: ReactNode; children?: ReactNode; footer?: ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60">
      <div className="flex gap-3 p-5 pb-0">
        {icon && <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">{icon}</div>}
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {description && <div className="mt-0.5 text-sm text-zinc-500">{description}</div>}
        </div>
      </div>
      <div className="space-y-4 p-5">{children}</div>
      {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-100 px-5 py-3 dark:border-zinc-800">{footer}</div>}
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-zinc-500">{hint}</span>}
    </label>
  )
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={clsx('relative h-6 w-11 shrink-0 rounded-full transition', checked ? 'bg-accent-600' : 'bg-zinc-300 dark:bg-zinc-700')}>
      <span className={clsx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', checked ? 'left-[22px]' : 'left-0.5')} />
    </button>
  )
}

function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }
    catch { toast.error('Copy failed; select the text and copy it manually') }
  }
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-950">{value}</code>
      <Button size="sm" type="button" onClick={copy}>{copied ? <Check size={14} /> : <Copy size={14} />}{copied ? 'Copied' : 'Copy'}</Button>
    </div>
  )
}

function SecretInput({ isSet, value, onChange, placeholder }: { isSet: boolean; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <Input type="password" autoComplete="new-password" value={value} onChange={e => onChange(e.target.value)}
      placeholder={isSet ? '•••••••• saved (type to replace)' : placeholder} />
  )
}

function useSettings() {
  const qc = useQueryClient()
  const query = useQuery({ queryKey: ['admin-settings'], queryFn: api.settings })
  const save = useMutation({
    mutationFn: (b: SettingsUpdate) => api.saveSettings(b),
    onSuccess: data => {
      qc.setQueryData(['admin-settings'], data)
      qc.invalidateQueries({ queryKey: ['providers'] })
      toast.success('Settings saved')
    },
    onError: e => toast.error(e.message),
  })
  return { query, save }
}

/* ---------- My account ---------- */

function AccountSection({ user }: { user: User }) {
  const qc = useQueryClient()
  const [name, setName] = useState(user.name)
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' })
  const saveName = useMutation({
    mutationFn: () => api.updateMe(name.trim()),
    onSuccess: u => { qc.setQueryData(['me'], u); toast.success('Name updated') },
    onError: e => toast.error(e.message),
  })
  const changePw = useMutation({
    mutationFn: () => api.changePassword(pw.current, pw.next),
    onSuccess: () => { setPw({ current: '', next: '', confirm: '' }); toast.success('Password changed. Other devices were signed out.') },
    onError: e => toast.error(e.message),
  })
  const pwError = pw.next && pw.next.length < 10 ? 'Use at least 10 characters' : pw.confirm && pw.confirm !== pw.next ? "Passwords don't match" : ''

  return (
    <>
      <Card title="Profile" icon={<UserIcon size={17} />} description={user.is_admin ? 'You are an admin of this server.' : undefined}
        footer={<Button variant="primary" size="sm" disabled={!name.trim() || name.trim() === user.name || saveName.isPending} onClick={() => saveName.mutate()}>Save</Button>}>
        <Field label="Name"><Input value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="Email" hint="Ask an admin to change your email."><Input value={user.email} disabled /></Field>
      </Card>
      <Card title="Password" icon={<KeyRound size={17} />}
        footer={<Button variant="primary" size="sm" disabled={!pw.current || !pw.next || !!pwError || pw.confirm !== pw.next || changePw.isPending} onClick={() => changePw.mutate()}>Change password</Button>}>
        <Field label="Current password"><Input type="password" autoComplete="current-password" value={pw.current} onChange={e => setPw({ ...pw, current: e.target.value })} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New password"><Input type="password" autoComplete="new-password" value={pw.next} onChange={e => setPw({ ...pw, next: e.target.value })} /></Field>
          <Field label="Confirm new password"><Input type="password" autoComplete="new-password" value={pw.confirm} onChange={e => setPw({ ...pw, confirm: e.target.value })} /></Field>
        </div>
        {pwError && <p className="text-sm text-red-600">{pwError}</p>}
      </Card>
    </>
  )
}

/* ---------- Cloud providers ---------- */

type ProviderForm = {
  kind: 'gdrive' | 'dropbox' | 'box'; name: string; idKey: 'google_client_id' | 'dropbox_app_key' | 'box_client_id'
  secretKey: SecretKey; idLabel: string; secretLabel: string; consoleUrl: string; steps: ReactNode[]; comingSoon?: boolean
}

const PROVIDERS: ProviderForm[] = [
  {
    kind: 'gdrive', name: 'Google Drive', idKey: 'google_client_id', secretKey: 'google_client_secret',
    idLabel: 'Client ID', secretLabel: 'Client secret', consoleUrl: 'https://console.cloud.google.com/apis/credentials',
    steps: [
      <>In Google Cloud Console, create a project and enable the <b>Google Drive API</b>.</>,
      <>Set up the <b>OAuth consent screen</b> (External) and add your family's Gmail addresses as test users.</>,
      <>Go to <b>Credentials → Create credentials → OAuth client ID</b>, choose <b>Web application</b>, and paste the redirect URI below.</>,
      <>Copy the Client ID and Client secret Google shows you into the fields here.</>,
    ],
  },
  {
    kind: 'dropbox', name: 'Dropbox', idKey: 'dropbox_app_key', secretKey: 'dropbox_app_secret',
    idLabel: 'App key', secretLabel: 'App secret', consoleUrl: 'https://www.dropbox.com/developers/apps', comingSoon: true,
    steps: [<>Create an app with <b>Full Dropbox</b> access, add the redirect URI below, and copy its App key and App secret.</>],
  },
  {
    kind: 'box', name: 'Box', idKey: 'box_client_id', secretKey: 'box_client_secret',
    idLabel: 'Client ID', secretLabel: 'Client secret', consoleUrl: 'https://app.box.com/developers/console', comingSoon: true,
    steps: [<>Create a <b>Custom App</b> with <b>User Authentication (OAuth 2.0)</b>, add the redirect URI below, and copy its Client ID and secret.</>],
  },
]

function ProvidersSection() {
  const { query } = useSettings()
  if (!query.data) return <Loading error={query.error} />
  return (
    <>
      <p className="text-sm text-zinc-500">
        Each cloud needs its own sign-in keys, created for free in that provider's developer console. Keys are stored encrypted on this server.
      </p>
      {PROVIDERS.map(p => <ProviderCard key={p.kind} form={p} page={query.data} />)}
    </>
  )
}

function ProviderCard({ form, page }: { form: ProviderForm; page: Page }) {
  const { save } = useSettings()
  const savedId = page.values[form.idKey] ?? ''
  const secretSet = page.secrets_set[form.secretKey]
  const [id, setId] = useState(savedId)
  const [secret, setSecret] = useState('')
  useEffect(() => setId(savedId), [savedId])
  const ready = !!savedId && secretSet
  const dirty = id.trim() !== savedId || !!secret

  return (
    <Card title={form.name} icon={<ProviderLogo kind={form.kind} size={20} />}
      description={form.comingSoon
        ? <span>Connecting {form.name} arrives in the next update. You can save its keys now.</span>
        : ready ? <span className="inline-flex items-center gap-1 text-emerald-600"><Check size={14} /> Ready. Family members can connect their {form.name} accounts.</span>
          : 'Not set up yet.'}
      footer={<>
        {(savedId || secretSet) && (
          <Button size="sm" variant="ghost" className="mr-auto !text-red-600" disabled={save.isPending}
            onClick={() => { if (confirm(`Remove the ${form.name} keys? Already-connected accounts will stop working.`)) save.mutate({ [form.idKey]: null, [form.secretKey]: null }) }}>
            Remove keys
          </Button>
        )}
        <Button variant="primary" size="sm" disabled={!dirty || !id.trim() || (!secretSet && !secret) || save.isPending}
          onClick={() => save.mutate({ [form.idKey]: id.trim(), [form.secretKey]: secret }, { onSuccess: () => setSecret('') })}>
          {save.isPending ? <Spinner /> : 'Save'}
        </Button>
      </>}>
      <details className="group rounded-xl bg-zinc-50 px-4 py-3 text-sm dark:bg-zinc-950/60" open={!ready && !form.comingSoon}>
        <summary className="cursor-pointer select-none font-medium">How to get these keys</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-zinc-600 dark:text-zinc-400">
          {form.steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
        <a href={form.consoleUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 font-medium text-accent-600 hover:underline">
          Open the {form.name} developer console <ExternalLink size={13} />
        </a>
      </details>
      <Field label="Redirect URI" hint="Paste this exactly into the provider's console.">
        <CopyField value={page.redirect_uris[form.kind]} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={form.idLabel}><Input value={id} onChange={e => setId(e.target.value)} spellCheck={false} /></Field>
        <Field label={form.secretLabel}><SecretInput isSet={secretSet} value={secret} onChange={setSecret} placeholder={`Paste the ${form.secretLabel.toLowerCase()}`} /></Field>
      </div>
    </Card>
  )
}

/* ---------- Users ---------- */

function UsersSection({ me }: { me: User }) {
  const qc = useQueryClient()
  const users = useQuery({ queryKey: ['admin-users'], queryFn: api.users })
  const [adding, setAdding] = useState(false)
  const [resetFor, setResetFor] = useState<User | null>(null)
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin-users'] })
  const update = useMutation({
    mutationFn: ({ id, b }: { id: string; b: { is_admin?: boolean } }) => api.updateUser(id, b),
    onSuccess: refresh, onError: e => toast.error(e.message),
  })
  const remove = useMutation({
    mutationFn: api.deleteUser,
    onSuccess: () => { refresh(); toast.success('User removed') }, onError: e => toast.error(e.message),
  })

  if (!users.data) return <Loading error={users.error} />
  return (
    <>
      <Card title="People on this server" icon={<Users size={17} />}
        description="Each person signs in with their own email and password and connects their own clouds. Admins can change settings and manage people."
        footer={<Button variant="primary" size="sm" onClick={() => setAdding(true)}><UserPlus size={14} /> Add person</Button>}>
        <ul className="-my-2 divide-y divide-zinc-100 dark:divide-zinc-800">
          {users.data.map(u => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-500 to-sky-500 text-sm font-semibold text-white">
                {u.name.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{u.name}{u.id === me.id && <span className="ml-1.5 text-xs font-normal text-zinc-500">(you)</span>}</p>
                <p className="truncate text-xs text-zinc-500">{u.email}</p>
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
                <Shield size={13} /> Admin
                <Toggle label={`Admin: ${u.name}`} checked={u.is_admin} onChange={v => update.mutate({ id: u.id, b: { is_admin: v } })} />
              </label>
              <Button size="sm" onClick={() => setResetFor(u)}><KeyRound size={14} /> {u.id === me.id ? 'Set password' : 'Reset password'}</Button>
              {u.id !== me.id && (
                <Button size="icon" variant="ghost" aria-label={`Remove ${u.name}`} className="!text-red-600"
                  onClick={() => { if (confirm(`Remove ${u.name}? Their connected accounts are disconnected; files in their clouds are not touched.`)) remove.mutate(u.id) }}>
                  <Trash2 size={15} />
                </Button>
              )}
            </li>
          ))}
        </ul>
      </Card>
      {adding && <AddUserDialog onClose={() => setAdding(false)} onDone={() => { setAdding(false); refresh() }} />}
      {resetFor && <ResetPasswordDialog user={resetFor} onClose={() => setResetFor(null)} />}
    </>
  )
}

function AddUserDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: '', email: '', password: '', is_admin: false })
  const create = useMutation({
    mutationFn: () => api.createUser(f),
    onSuccess: u => { toast.success(`${u.name} can now sign in with ${u.email}`); onDone() },
    onError: e => toast.error(e.message),
  })
  const valid = f.name.trim() && /.+@.+\..+/.test(f.email) && f.password.length >= 10
  return (
    <Modal open onClose={onClose} title="Add a person"
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid || create.isPending} onClick={() => create.mutate()}>Add</Button></>}>
      <div className="space-y-3">
        <Field label="Name"><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Temporary password" hint="At least 10 characters. They can change it under Settings → My account.">
          <Input type="text" value={f.password} onChange={e => setF({ ...f, password: e.target.value })} autoComplete="off" spellCheck={false} />
        </Field>
        <label className="flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2.5 text-sm dark:bg-zinc-950/60">
          Make them an admin <Toggle label="Admin" checked={f.is_admin} onChange={v => setF({ ...f, is_admin: v })} />
        </label>
      </div>
    </Modal>
  )
}

function ResetPasswordDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const [pw, setPw] = useState('')
  const reset = useMutation({
    mutationFn: () => api.updateUser(user.id, { password: pw }),
    onSuccess: () => { toast.success(`Password updated for ${user.name}`); onClose() },
    onError: e => toast.error(e.message),
  })
  return (
    <Modal open onClose={onClose} title={`New password for ${user.name}`}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" disabled={pw.length < 10 || reset.isPending} onClick={() => reset.mutate()}>Set password</Button></>}>
      <Field label="New password" hint="At least 10 characters. They'll be signed out of their other devices.">
        <Input type="text" value={pw} onChange={e => setPw(e.target.value)} autoFocus autoComplete="off" spellCheck={false} />
      </Field>
    </Modal>
  )
}

/* ---------- General ---------- */

function GeneralSection() {
  const { query, save } = useSettings()
  const page = query.data
  const [url, setUrl] = useState('')
  const [folder, setFolder] = useState('')
  useEffect(() => {
    if (!page) return
    setUrl(page.values.public_url || '')
    setFolder(page.values.server_folder_path || '')
  }, [page])
  if (!page) return <Loading error={query.error} />

  return (
    <>
      <Card title="Web address" icon={<Globe size={17} />}
        description="The address people use to reach Drive Manager. Cloud sign-in uses it to send people back here."
        footer={<>
          {page.values.public_url && <Button size="sm" variant="ghost" className="mr-auto" onClick={() => save.mutate({ public_url: null })}>Detect automatically</Button>}
          <Button variant="primary" size="sm" disabled={url.trim() === (page.values.public_url || '') || save.isPending} onClick={() => save.mutate({ public_url: url.trim() || null })}>Save</Button>
        </>}>
        <Field label="Address" hint={<>Leave empty to detect it from the browser. Detected now: <b>{page.detected_url}</b></>}>
          <Input value={url} onChange={e => setUrl(e.target.value)} placeholder={page.detected_url} spellCheck={false} />
        </Field>
      </Card>

      <Card title="Server folder storage" icon={<ProviderLogo kind="local" size={18} />}
        description="Lets people use a folder on this server as one more drive. Each person gets their own subfolder."
        footer={<Button variant="primary" size="sm" disabled={folder.trim() === page.values.server_folder_path || !folder.trim() || save.isPending}
          onClick={() => save.mutate({ server_folder_path: folder.trim() })}>Save</Button>}>
        <div className="flex items-center justify-between gap-4">
          <span className="text-sm">Allow server folder drives</span>
          <Toggle label="Allow server folder drives" checked={page.values.server_folder_enabled}
            onChange={v => save.mutate({ server_folder_enabled: v })} />
        </div>
        <Field label="Folder on this server" hint={<>Default: {page.defaults.server_folder_path}</>}>
          <Input value={folder} onChange={e => setFolder(e.target.value)} disabled={!page.values.server_folder_enabled} spellCheck={false} />
        </Field>
      </Card>
    </>
  )
}

function Loading({ error }: { error: Error | null }) {
  return error
    ? <p className="text-sm text-red-600">{error.message}</p>
    : <div className="flex justify-center py-16 text-zinc-400"><Spinner /></div>
}
