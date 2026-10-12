import { clsx } from 'clsx'
import { X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'

export function Button({ variant = 'secondary', size = 'md', className, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'icon' }) {
  return (
    <button
      {...props}
      className={clsx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition select-none',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/60 disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' && 'h-8 px-3 text-[13px]',
        size === 'md' && 'h-9 px-3.5 text-sm',
        size === 'icon' && 'h-9 w-9',
        variant === 'primary' && 'bg-accent-600 text-white shadow-sm hover:bg-accent-700',
        variant === 'secondary' && 'border border-zinc-200 bg-white text-zinc-800 shadow-sm hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800',
        variant === 'ghost' && 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/70 dark:hover:text-zinc-100',
        variant === 'danger' && 'bg-red-600 text-white shadow-sm hover:bg-red-700',
        className,
      )}
    />
  )
}

export function Input(props: React.ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={clsx(
        'h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm shadow-sm outline-none transition',
        'placeholder:text-zinc-400 focus:border-accent-500 focus:ring-4 focus:ring-accent-500/15',
        'dark:border-zinc-800 dark:bg-zinc-900',
        props.className,
      )}
    />
  )
}

export function Modal({ open, onClose, title, children, footer }:
  { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  // Portal to <body> so ancestors with backdrop-filter/transform can't trap the fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div role="dialog" aria-modal aria-label={title} onMouseDown={e => e.stopPropagation()}
        className="animate-pop w-full max-w-md rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center justify-between px-5 pt-4">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close"><X size={16} /></Button>
        </div>
        <div className="px-5 py-3">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-zinc-100 px-5 py-3 dark:border-zinc-800">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

/** A small text prompt dialog (new folder, rename). Selects the name without the extension. */
export function PromptDialog(props: { open: boolean; title: string; label: string; initial?: string; confirm: string; onSubmit: (v: string) => void; onClose: () => void }) {
  // Mount the form only while open so every opening starts from `initial`.
  return props.open ? <PromptForm {...props} /> : null
}

function PromptForm({ title, label, initial = '', confirm, onSubmit, onClose }:
  { title: string; label: string; initial?: string; confirm: string; onSubmit: (v: string) => void; onClose: () => void }) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    const dot = initial.lastIndexOf('.')
    el.setSelectionRange(0, dot > 0 ? dot : initial.length)
  }, [initial])
  const submit = () => { const v = value.trim(); if (v) onSubmit(v) }
  return (
    <Modal open onClose={onClose} title={title}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit} disabled={!value.trim()}>{confirm}</Button></>}>
      <label className="mb-1.5 block text-xs font-medium text-zinc-500">{label}</label>
      <Input ref={ref} value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
    </Modal>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <span className={clsx('inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)} />
}
