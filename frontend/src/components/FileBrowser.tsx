import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import {
  ArrowDownToLine, ChevronRight, ExternalLink, FolderPlus, LayoutGrid, List, Pencil, RefreshCw, Search, Trash2, Upload, UploadCloud, X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api, type Account, type Entry } from '../api'
import { formatBytes, formatDate } from '../lib/format'
import { FileIcon } from './FileIcon'
import { ProviderLogo } from './ProviderLogo'
import { Button, PromptDialog, Spinner } from './ui'

export type Crumb = { id: string; name: string }
type SortKey = 'name' | 'modified_at' | 'size'
export const DRAG_MIME = 'application/x-drive-manager'

function useView() {
  const [view, setView] = useState<'list' | 'grid'>(() => {
    try { return (localStorage.getItem('dm-view') as 'list' | 'grid') || 'list' } catch { return 'list' }
  })
  return [view, (v: 'list' | 'grid') => { setView(v); try { localStorage.setItem('dm-view', v) } catch { /* ignore */ } }] as const
}

export function FileBrowser({ account, path, onNavigate }: { account: Account; path: Crumb[]; onNavigate: (p: Crumb[]) => void }) {
  const qc = useQueryClient()
  const folder = path[path.length - 1]
  const [view, setView] = useView()
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const anchor = useRef<string | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'name', asc: true })
  const [menu, setMenu] = useState<{ x: number; y: number; entry: Entry } | null>(null)
  const [dialog, setDialog] = useState<null | { kind: 'mkdir' } | { kind: 'rename'; entry: Entry }>(null)
  const [dragOver, setDragOver] = useState(false)
  const [dropFolder, setDropFolder] = useState<string | null>(null)
  const [uploads, setUploads] = useState<{ name: string; done: boolean }[]>([])
  const fileInput = useRef<HTMLInputElement>(null)
  const searchInput = useRef<HTMLInputElement>(null)

  useEffect(() => { const t = setTimeout(() => setDebounced(query.trim()), 250); return () => clearTimeout(t) }, [query])
  useEffect(() => { setSelected(new Set()); setQuery('') }, [account.id, folder.id])

  const key = ['list', account.id, folder.id]
  const listing = useQuery({ queryKey: key, queryFn: () => api.list(account.id, folder.id) })
  const search = useQuery({ queryKey: ['search', account.id, debounced], queryFn: () => api.search(account.id, debounced), enabled: !!debounced })
  const active = debounced ? search : listing

  const entries = useMemo(() => {
    const list = [...(active.data?.entries ?? [])]
    const dir = sort.asc ? 1 : -1
    return list.sort((a, b) => {
      if (a.is_folder !== b.is_folder) return a.is_folder ? -1 : 1
      if (sort.key === 'name') return dir * a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
      if (sort.key === 'size') return dir * ((a.size ?? -1) - (b.size ?? -1))
      return dir * ((a.modified_at ?? '').localeCompare(b.modified_at ?? ''))
    })
  }, [active.data, sort])

  const refresh = () => qc.invalidateQueries({ queryKey: ['list', account.id] })
  const onError = (e: Error) => toast.error(e.message)

  const mkdir = useMutation({ mutationFn: (name: string) => api.mkdir(account.id, folder.id, name), onSuccess: () => { refresh(); setDialog(null) }, onError })
  const rename = useMutation({
    mutationFn: ({ e, name }: { e: Entry; name: string }) => api.rename(account.id, e.id, name),
    onSuccess: () => { refresh(); setDialog(null) }, onError,
  })
  const move = useMutation({
    mutationFn: async ({ ids, target }: { ids: string[]; target: Entry }) => { for (const id of ids) await api.move(account.id, id, target.id) },
    onSuccess: (_, v) => { refresh(); setSelected(new Set()); toast.success(`Moved ${v.ids.length} item${v.ids.length > 1 ? 's' : ''} to ${v.target.name}`) },
    onError,
  })
  const remove = useMutation({
    mutationFn: async (items: Entry[]) => { for (const e of items) await api.remove(account.id, e.id) },
    onSuccess: (_, items) => { refresh(); setSelected(new Set()); toast.success(`Deleted ${items.length} item${items.length > 1 ? 's' : ''}`) },
    onError,
  })

  const upload = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length) return
    setUploads(list.map(f => ({ name: f.name, done: false })))
    let ok = 0
    for (const [i, f] of list.entries()) {
      try { await api.upload(account.id, folder.id, f); ok++ } catch (e) { toast.error(`${f.name}: ${(e as Error).message}`) }
      setUploads(u => u.map((x, j) => (j === i ? { ...x, done: true } : x)))
    }
    refresh()
    if (ok) toast.success(`Uploaded ${ok} file${ok > 1 ? 's' : ''}`)
    setTimeout(() => setUploads([]), 1200)
  }, [account.id, folder.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const open = (e: Entry) => {
    if (e.is_folder) onNavigate(debounced ? [...path.slice(0, 1), { id: e.id, name: e.name }] : [...path, { id: e.id, name: e.name }])
    else window.location.href = api.downloadUrl(account.id, e.id)
  }

  const click = (ev: React.MouseEvent, e: Entry) => {
    const next = new Set(ev.metaKey || ev.ctrlKey ? selected : [])
    if (ev.shiftKey && anchor.current) {
      const a = entries.findIndex(x => x.id === anchor.current), b = entries.findIndex(x => x.id === e.id)
      entries.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(x => next.add(x.id))
    } else if ((ev.metaKey || ev.ctrlKey) && selected.has(e.id)) next.delete(e.id)
    else { next.add(e.id); anchor.current = e.id }
    setSelected(next)
  }

  const selectedEntries = entries.filter(e => selected.has(e.id))
  const confirmDelete = (items: Entry[]) => {
    if (items.length && confirm(`Delete ${items.length === 1 ? `"${items[0].name}"` : `${items.length} items`}?${account.provider === 'gdrive' ? ' They will go to the Drive trash.' : ''}`))
      remove.mutate(items)
  }

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, [role=dialog]')
      if (e.key === '/' && !typing) { e.preventDefault(); searchInput.current?.focus(); return }
      if (typing) return
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') { e.preventDefault(); setSelected(new Set(entries.map(x => x.id))) }
      else if (e.key === 'Escape') { setSelected(new Set()); setMenu(null) }
      else if (e.key === 'Delete' || (e.key === 'Backspace' && e.metaKey)) confirmDelete(selectedEntries)
      else if (e.key === 'F2' && selectedEntries.length === 1) setDialog({ kind: 'rename', entry: selectedEntries[0] })
      else if (e.key === 'Enter' && selectedEntries.length === 1) open(selectedEntries[0])
      else if (e.key === 'Backspace' && path.length > 1) onNavigate(path.slice(0, -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  useEffect(() => { const close = () => setMenu(null); window.addEventListener('click', close); return () => window.removeEventListener('click', close) }, [])

  // Drag and drop: OS files upload; internal items move into folders (same account).
  const dragIds = (e: Entry) => (selected.has(e.id) ? [...selected] : [e.id])
  const onItemDragStart = (ev: React.DragEvent, e: Entry) => {
    ev.dataTransfer.setData(DRAG_MIME, JSON.stringify({ accountId: account.id, ids: dragIds(e) }))
    ev.dataTransfer.effectAllowed = 'move'
  }
  const onFolderDrop = (ev: React.DragEvent, target: Entry) => {
    ev.preventDefault(); ev.stopPropagation(); setDropFolder(null); setDragOver(false)
    const raw = ev.dataTransfer.getData(DRAG_MIME)
    if (raw) {
      const { accountId, ids } = JSON.parse(raw) as { accountId: string; ids: string[] }
      const moving = ids.filter(id => id !== target.id)
      if (accountId === account.id && moving.length) move.mutate({ ids: moving, target })
    }
  }

  const sortBy = (k: SortKey) => setSort(s => ({ key: k, asc: s.key === k ? !s.asc : true }))
  const SortHead = ({ k, label, className }: { k: SortKey; label: string; className?: string }) => (
    <button onClick={() => sortBy(k)} className={clsx('flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100', className)}>
      {label}{sort.key === k && <span className="text-[10px]">{sort.asc ? '▲' : '▼'}</span>}
    </button>
  )

  const itemProps = (e: Entry) => ({
    draggable: true,
    onDragStart: (ev: React.DragEvent) => onItemDragStart(ev, e),
    onClick: (ev: React.MouseEvent) => { ev.stopPropagation(); click(ev, e) },
    onDoubleClick: () => open(e),
    onContextMenu: (ev: React.MouseEvent) => {
      ev.preventDefault(); ev.stopPropagation()
      if (!selected.has(e.id)) setSelected(new Set([e.id]))
      setMenu({ x: Math.min(ev.clientX, innerWidth - 220), y: Math.min(ev.clientY, innerHeight - 240), entry: e })
    },
    ...(e.is_folder && {
      onDragOver: (ev: React.DragEvent) => { if (ev.dataTransfer.types.includes(DRAG_MIME)) { ev.preventDefault(); ev.stopPropagation(); setDropFolder(e.id) } },
      onDragLeave: () => setDropFolder(null),
      onDrop: (ev: React.DragEvent) => onFolderDrop(ev, e),
    }),
  })

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {/* Top bar */}
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-zinc-200 px-4 dark:border-zinc-800/80">
        <nav className="flex min-w-0 flex-1 items-center gap-0.5 text-sm" aria-label="Breadcrumb">
          <ProviderLogo kind={account.provider} size={18} />
          {path.map((c, i) => (
            <span key={c.id + i} className="flex min-w-0 items-center gap-0.5">
              {i > 0 && <ChevronRight size={14} className="shrink-0 text-zinc-400" />}
              <button onClick={() => onNavigate(path.slice(0, i + 1))}
                className={clsx('truncate rounded-md px-1.5 py-1 hover:bg-zinc-100 dark:hover:bg-zinc-800',
                  i === path.length - 1 ? 'font-semibold' : 'text-zinc-500')}>
                {i === 0 ? account.label : c.name}
              </button>
            </span>
          ))}
        </nav>
        <div className="relative hidden w-72 md:block">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input ref={searchInput} value={query} onChange={e => setQuery(e.target.value)} placeholder={`Search ${account.label}`}
            className="h-9 w-full rounded-lg border border-transparent bg-zinc-100 pl-9 pr-14 text-sm outline-none transition placeholder:text-zinc-400 focus:border-accent-500 focus:bg-white focus:ring-4 focus:ring-accent-500/15 dark:bg-zinc-800/70 dark:focus:bg-zinc-900" />
          {query ? (
            <button className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-zinc-400 hover:text-zinc-700" onClick={() => setQuery('')} aria-label="Clear search"><X size={14} /></button>
          ) : (
            <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-zinc-300 px-1.5 text-[10px] text-zinc-400 dark:border-zinc-700">/</kbd>
          )}
        </div>
      </header>

      {/* Toolbar */}
      <div className="flex h-12 shrink-0 items-center gap-1.5 px-4">
        {selected.size > 0 ? (
          <div className="animate-pop flex items-center gap-1.5">
            <span className="mr-1 text-sm font-medium">{selected.size} selected</span>
            {selectedEntries.length === 1 && !selectedEntries[0].is_folder && (
              <Button size="sm" onClick={() => open(selectedEntries[0])}><ArrowDownToLine size={14} /> Download</Button>
            )}
            {selectedEntries.length === 1 && <Button size="sm" onClick={() => setDialog({ kind: 'rename', entry: selectedEntries[0] })}><Pencil size={14} /> Rename</Button>}
            <Button size="sm" onClick={() => confirmDelete(selectedEntries)} className="!text-red-600"><Trash2 size={14} /> Delete</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}><X size={14} /></Button>
          </div>
        ) : (
          <>
            <Button size="sm" variant="primary" onClick={() => fileInput.current?.click()}><Upload size={14} /> Upload</Button>
            <Button size="sm" onClick={() => setDialog({ kind: 'mkdir' })}><FolderPlus size={14} /> New folder</Button>
          </>
        )}
        <div className="flex-1" />
        <Button size="icon" variant="ghost" onClick={refresh} title="Refresh" aria-label="Refresh">
          <RefreshCw size={15} className={clsx(active.isFetching && 'animate-spin')} />
        </Button>
        <div className="flex rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800/70">
          {(['list', 'grid'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} aria-label={`${v} view`}
              className={clsx('rounded-md p-1.5 transition', view === v ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-white' : 'text-zinc-500')}>
              {v === 'list' ? <List size={15} /> : <LayoutGrid size={15} />}
            </button>
          ))}
        </div>
        <input ref={fileInput} type="file" multiple hidden onChange={e => { if (e.target.files) upload(e.target.files); e.target.value = '' }} />
      </div>

      {/* Content */}
      <div
        className="scroll-thin relative flex-1 overflow-y-auto px-4 pb-6"
        onClick={() => setSelected(new Set())}
        onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true) } }}
        onDragLeave={e => { if (e.currentTarget === e.target) setDragOver(false) }}
        onDrop={e => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files.length) upload(e.dataTransfer.files) }}
      >
        {active.isLoading ? (
          <div className="space-y-2 pt-2">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-11 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800/50" style={{ opacity: 1 - i * 0.1 }} />)}</div>
        ) : active.error ? (
          <div className="flex flex-col items-center py-24 text-center">
            <p className="font-medium">Couldn't load this folder</p>
            <p className="mt-1 max-w-md text-sm text-zinc-500">{active.error.message}</p>
            <Button className="mt-4" onClick={refresh}>Try again</Button>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center py-24 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800/70"><UploadCloud size={28} className="text-zinc-400" /></div>
            <p className="font-medium">{debounced ? 'No matches' : 'This folder is empty'}</p>
            <p className="mt-1 text-sm text-zinc-500">{debounced ? `Nothing named like "${debounced}".` : 'Drop files here or use Upload.'}</p>
          </div>
        ) : view === 'list' ? (
          <div role="grid" className="text-sm">
            <div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_110px_90px] gap-4 border-b border-zinc-200 bg-zinc-50/90 px-3 py-2 text-xs font-medium text-zinc-500 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/90 md:grid-cols-[minmax(0,1fr)_140px_110px]">
              <SortHead k="name" label="Name" /><SortHead k="modified_at" label="Modified" /><SortHead k="size" label="Size" className="justify-end" />
            </div>
            {entries.map(e => (
              <div key={e.id} role="row" aria-selected={selected.has(e.id)} {...itemProps(e)}
                className={clsx('grid cursor-default select-none grid-cols-[minmax(0,1fr)_110px_90px] items-center gap-4 rounded-lg px-3 py-2.5 md:grid-cols-[minmax(0,1fr)_140px_110px]',
                  selected.has(e.id) ? 'bg-accent-50 dark:bg-accent-500/15' : 'hover:bg-zinc-100/80 dark:hover:bg-zinc-800/50',
                  dropFolder === e.id && 'ring-2 ring-accent-500')}>
                <span className="flex min-w-0 items-center gap-3"><FileIcon entry={e} /><span className="truncate">{e.name}</span></span>
                <span className="text-zinc-500">{formatDate(e.modified_at)}</span>
                <span className="text-right tabular-nums text-zinc-500">{e.is_folder ? '—' : formatBytes(e.size)}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3 pt-1">
            {entries.map(e => (
              <div key={e.id} {...itemProps(e)}
                className={clsx('group flex cursor-default select-none flex-col overflow-hidden rounded-xl border transition',
                  selected.has(e.id) ? 'border-accent-500 bg-accent-50 ring-2 ring-accent-500/30 dark:bg-accent-500/15' : 'border-zinc-200 bg-white hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900',
                  dropFolder === e.id && 'ring-2 ring-accent-500')}>
                <div className="flex aspect-[4/3] items-center justify-center bg-zinc-50 dark:bg-zinc-800/40">
                  {e.thumbnail_url ? <img src={e.thumbnail_url} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" loading="lazy" /> : <FileIcon entry={e} size={40} />}
                </div>
                <div className="flex items-center gap-2 px-2.5 py-2">
                  <FileIcon entry={e} size={14} /><span className="truncate text-[13px] font-medium">{e.name}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {dragOver && (
          <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-2xl border-2 border-dashed border-accent-500 bg-accent-50/80 dark:bg-accent-500/10">
            <div className="flex flex-col items-center text-accent-700 dark:text-accent-100">
              <UploadCloud size={36} /><p className="mt-2 font-medium">Drop to upload to {folder.id === account.root_id ? account.label : folder.name}</p>
            </div>
          </div>
        )}
      </div>

      {/* Context menu */}
      {menu && (
        <div className="animate-pop fixed z-40 w-52 rounded-xl border border-zinc-200 bg-white p-1 text-sm shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
          style={{ left: menu.x, top: menu.y }} onClick={e => e.stopPropagation()}>
          {[
            { icon: menu.entry.is_folder ? ChevronRight : ArrowDownToLine, label: menu.entry.is_folder ? 'Open' : 'Download', run: () => open(menu.entry) },
            ...(menu.entry.web_url ? [{ icon: ExternalLink, label: `Open in ${account.provider === 'gdrive' ? 'Google Drive' : 'provider'}`, run: () => window.open(menu.entry.web_url!, '_blank', 'noopener') }] : []),
            { icon: Pencil, label: 'Rename', hint: 'F2', run: () => setDialog({ kind: 'rename', entry: menu.entry }) },
            { icon: Trash2, label: 'Delete', hint: 'Del', danger: true, run: () => confirmDelete(selectedEntries.length > 1 ? selectedEntries : [menu.entry]) },
          ].map(item => (
            <button key={item.label} onClick={() => { setMenu(null); item.run() }}
              className={clsx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left',
                'danger' in item && item.danger ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800')}>
              <item.icon size={15} /><span className="flex-1">{item.label}</span>
              {'hint' in item && <kbd className="text-[11px] text-zinc-400">{item.hint}</kbd>}
            </button>
          ))}
        </div>
      )}

      {/* Upload progress */}
      {uploads.length > 0 && (
        <div className="animate-pop fixed bottom-4 left-1/2 z-30 w-80 -translate-x-1/2 rounded-xl border border-zinc-200 bg-white p-3 shadow-xl dark:border-zinc-700 dark:bg-zinc-900">
          <p className="mb-2 text-sm font-medium">Uploading {uploads.filter(u => u.done).length} of {uploads.length}</p>
          <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div className="h-full rounded-full bg-accent-600 transition-all" style={{ width: `${(uploads.filter(u => u.done).length / uploads.length) * 100}%` }} />
          </div>
          <p className="mt-2 flex items-center gap-2 truncate text-xs text-zinc-500">
            {uploads.some(u => !u.done) && <Spinner className="!h-3 !w-3" />}{uploads.find(u => !u.done)?.name ?? 'Done'}
          </p>
        </div>
      )}

      <PromptDialog open={dialog?.kind === 'mkdir'} title="New folder" label="Folder name" initial="Untitled folder" confirm="Create"
        onClose={() => setDialog(null)} onSubmit={v => mkdir.mutate(v)} />
      <PromptDialog open={dialog?.kind === 'rename'} title="Rename" label="New name" initial={dialog?.kind === 'rename' ? dialog.entry.name : ''} confirm="Rename"
        onClose={() => setDialog(null)} onSubmit={v => dialog?.kind === 'rename' && rename.mutate({ e: dialog.entry, name: v })} />
    </div>
  )
}
