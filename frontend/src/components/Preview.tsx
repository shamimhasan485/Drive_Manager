import { clsx } from 'clsx'
import { ArrowDownToLine, ChevronLeft, ChevronRight, ExternalLink, FileQuestion, Music, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, type Account, type Entry } from '../api'
import { formatBytes, formatDate } from '../lib/format'
import { previewKind, type PreviewKind } from '../lib/preview'
import { FileIcon } from './FileIcon'
import { Spinner } from './ui'

const TEXT_LIMIT = 1024 * 1024

export function Preview({ account, entries, index, onIndex, onClose }: {
  account: Account; entries: Entry[]; index: number; onIndex: (i: number) => void; onClose: () => void
}) {
  const entry = entries[index]
  const kind = previewKind(entry)
  const prev = () => index > 0 && onIndex(index - 1)
  const next = () => index < entries.length - 1 && onIndex(index + 1)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && !(e.target instanceof HTMLMediaElement)) prev()
      else if (e.key === 'ArrowRight' && !(e.target instanceof HTMLMediaElement)) next()
    }
    window.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow }
  })

  const src = api.viewUrl(account.id, entry.id, kind === 'gdoc')
  const download = () => { window.location.href = api.downloadUrl(account.id, entry.id) }
  // Audio playlist feel: when a track ends, move on to the next one.
  const onEnded = () => { if (index < entries.length - 1 && previewKind(entries[index + 1]) === 'audio') next() }

  return createPortal(
    <div role="dialog" aria-modal aria-label={`Preview of ${entry.name}`} className="fixed inset-0 z-50 flex flex-col bg-zinc-950/95 text-zinc-100 backdrop-blur-sm">
      <header className="flex h-14 shrink-0 items-center gap-3 px-3 sm:px-4">
        <FileIcon entry={entry} size={20} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{entry.name}</p>
          <p className="truncate text-xs text-zinc-400">
            {[entry.size != null && formatBytes(entry.size), formatDate(entry.modified_at), entries.length > 1 && `${index + 1} of ${entries.length}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        {entry.web_url && (
          <TopButton label={`Open in ${account.provider === 'gdrive' ? 'Google Drive' : 'provider'}`} onClick={() => window.open(entry.web_url!, '_blank', 'noopener')}>
            <ExternalLink size={17} />
          </TopButton>
        )}
        <TopButton label="Download" onClick={download}><ArrowDownToLine size={17} /></TopButton>
        <TopButton label="Close (Esc)" onClick={onClose}><X size={19} /></TopButton>
      </header>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4 sm:px-16" onClick={e => e.target === e.currentTarget && onClose()}>
        <Viewer key={entry.id} kind={kind} src={src} entry={entry} onEnded={onEnded} onDownload={download} />
        {index > 0 && <NavButton side="left" onClick={prev} />}
        {index < entries.length - 1 && <NavButton side="right" onClick={next} />}
      </div>
    </div>,
    document.body,
  )
}

function TopButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-300 transition hover:bg-white/10 hover:text-white">
      {children}
    </button>
  )
}

function NavButton({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={side === 'left' ? 'Previous file' : 'Next file'}
      className={clsx('absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur transition hover:bg-black/70',
        side === 'left' ? 'left-2 sm:left-4' : 'right-2 sm:right-4')}>
      {side === 'left' ? <ChevronLeft size={22} /> : <ChevronRight size={22} />}
    </button>
  )
}

function Viewer({ kind, src, entry, onEnded, onDownload }:
  { kind: PreviewKind; src: string; entry: Entry; onEnded: () => void; onDownload: () => void }) {
  const [failed, setFailed] = useState(false)
  if (failed || kind === 'none') return <NoPreview entry={entry} onDownload={onDownload} failed={failed} />
  switch (kind) {
    case 'image': return <ImageViewer src={src} name={entry.name} onError={() => setFailed(true)} />
    case 'video':
      return <video src={src} controls autoPlay playsInline onError={() => setFailed(true)} onEnded={onEnded}
        className="max-h-full max-w-full rounded-lg bg-black shadow-2xl" />
    case 'audio':
      return (
        <div className="flex w-full max-w-md flex-col items-center gap-6 rounded-3xl bg-white/5 p-8 shadow-2xl ring-1 ring-white/10">
          <div className="flex h-40 w-40 items-center justify-center rounded-3xl bg-gradient-to-br from-accent-500 to-pink-500 shadow-xl">
            <Music size={64} className="text-white" />
          </div>
          <p className="max-w-full truncate text-center font-medium">{entry.name}</p>
          <audio src={src} controls autoPlay onError={() => setFailed(true)} onEnded={onEnded} className="w-full" />
        </div>
      )
    case 'pdf':
    case 'gdoc':
      return <FrameViewer src={src} title={entry.name} />
    case 'text':
      return <TextViewer src={src} onError={() => setFailed(true)} />
  }
}

function ImageViewer({ src, name, onError }: { src: string; name: string; onError: () => void }) {
  const [loaded, setLoaded] = useState(false)
  const [zoom, setZoom] = useState(false)
  return (
    <div className={clsx('relative flex h-full w-full items-center justify-center', zoom && 'overflow-auto')}>
      {!loaded && <Spinner className="absolute text-zinc-400" />}
      <img src={src} alt={name} onLoad={() => setLoaded(true)} onError={onError} onClick={() => setZoom(z => !z)} draggable={false}
        className={clsx('select-none transition-opacity', loaded ? 'opacity-100' : 'opacity-0',
          zoom ? 'max-w-none cursor-zoom-out' : 'max-h-full max-w-full cursor-zoom-in object-contain')} />
      {loaded && (
        <button onClick={() => setZoom(z => !z)} aria-label={zoom ? 'Fit to screen' : 'Actual size'}
          className="absolute bottom-2 right-2 rounded-lg bg-black/50 p-2 text-white backdrop-blur hover:bg-black/70">
          {zoom ? <ZoomOut size={17} /> : <ZoomIn size={17} />}
        </button>
      )}
    </div>
  )
}

function FrameViewer({ src, title }: { src: string; title: string }) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="relative h-full w-full max-w-5xl overflow-hidden rounded-lg bg-white shadow-2xl">
      {!loaded && <div className="absolute inset-0 flex items-center justify-center text-zinc-400"><Spinner /></div>}
      <iframe src={src} title={title} onLoad={() => setLoaded(true)} className="h-full w-full border-0" />
    </div>
  )
}

function TextViewer({ src, onError }: { src: string; onError: () => void }) {
  const [text, setText] = useState<string | null>(null)
  const [truncated, setTruncated] = useState(false)
  const errRef = useRef(onError)
  errRef.current = onError
  useEffect(() => {
    const ctrl = new AbortController()
    fetch(src, { headers: { Range: `bytes=0-${TEXT_LIMIT - 1}` }, signal: ctrl.signal, credentials: 'same-origin' })
      .then(async r => {
        if (!r.ok) throw new Error(r.statusText)
        const total = r.headers.get('content-range')?.split('/')[1]
        setTruncated(r.status === 206 && !!total && Number(total) > TEXT_LIMIT)
        setText(await r.text())
      })
      .catch(e => { if (e.name !== 'AbortError') errRef.current() })
    return () => ctrl.abort()
  }, [src])
  if (text === null) return <Spinner className="text-zinc-400" />
  return (
    <div className="scroll-thin h-full w-full max-w-5xl overflow-auto rounded-lg bg-zinc-900 shadow-2xl ring-1 ring-white/10">
      <pre className="whitespace-pre-wrap break-words p-5 font-mono text-[13px] leading-relaxed text-zinc-200">{text}</pre>
      {truncated && <p className="border-t border-white/10 px-5 py-3 text-xs text-zinc-400">Showing the first 1 MB. Download the file to see all of it.</p>}
    </div>
  )
}

function NoPreview({ entry, onDownload, failed }: { entry: Entry; onDownload: () => void; failed: boolean }) {
  return (
    <div className="flex max-w-sm flex-col items-center rounded-3xl bg-white/5 p-10 text-center ring-1 ring-white/10">
      <FileQuestion size={48} className="text-zinc-400" />
      <p className="mt-4 font-medium">{failed ? "This file can't be shown in the browser" : 'No preview for this kind of file'}</p>
      <p className="mt-1 text-sm text-zinc-400">{entry.name}{entry.size != null && ` · ${formatBytes(entry.size)}`}</p>
      <button onClick={onDownload} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700">
        <ArrowDownToLine size={15} /> Download
      </button>
    </div>
  )
}
