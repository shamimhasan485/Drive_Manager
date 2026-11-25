import type { Entry } from '../api'

export type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'gdoc' | 'text' | 'none'

const EXT: Record<string, PreviewKind> = {}
const add = (exts: string, kind: PreviewKind) => exts.split(' ').forEach(e => (EXT[e] = kind))
add('jpg jpeg png gif webp avif bmp svg ico', 'image')
add('mp4 webm mov m4v ogv mkv', 'video')
add('mp3 wav ogg oga m4a aac flac opus weba', 'audio')
add('pdf', 'pdf')
add('txt md markdown log csv tsv json xml yaml yml toml ini conf cfg env js mjs cjs ts tsx jsx py rb go rs java kt c h cpp hpp cs php sh bat ps1 sql html htm css scss vue svelte gitignore dockerfile', 'text')

const GOOGLE_DOCS = new Set([
  'application/vnd.google-apps.document', 'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.presentation', 'application/vnd.google-apps.drawing',
])

export function previewKind(e: Entry): PreviewKind {
  if (e.is_folder) return 'none'
  const mime = e.mime_type ?? ''
  if (GOOGLE_DOCS.has(mime)) return 'gdoc'
  if (mime.startsWith('image/') && mime !== 'image/heic' && mime !== 'image/heif') return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime === 'application/pdf') return 'pdf'
  const ext = e.name.includes('.') ? e.name.split('.').pop()!.toLowerCase() : e.name.toLowerCase()
  if (EXT[ext]) return EXT[ext]
  if (mime.startsWith('text/') || mime === 'application/json') return 'text'
  return 'none'
}
