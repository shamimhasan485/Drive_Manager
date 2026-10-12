import { File, FileArchive, FileAudio, FileCode, FileImage, FileSpreadsheet, FileText, FileVideo, Folder, Presentation } from 'lucide-react'
import type { Entry } from '../api'

const EXT: Record<string, [typeof File, string]> = {}
const add = (exts: string, icon: typeof File, color: string) => exts.split(' ').forEach(e => (EXT[e] = [icon, color]))
add('jpg jpeg png gif webp svg heic bmp tiff avif', FileImage, 'text-pink-500')
add('mp4 mov mkv avi webm m4v', FileVideo, 'text-violet-500')
add('mp3 wav flac aac ogg m4a', FileAudio, 'text-orange-500')
add('zip rar 7z tar gz bz2 xz', FileArchive, 'text-amber-600')
add('xls xlsx csv ods numbers', FileSpreadsheet, 'text-emerald-600')
add('ppt pptx key odp', Presentation, 'text-orange-600')
add('pdf', FileText, 'text-red-500')
add('doc docx odt rtf txt md pages', FileText, 'text-sky-600')
add('js ts tsx jsx py go rs java c cpp h json yaml yml toml html css sh', FileCode, 'text-teal-600')

const GOOGLE: Record<string, [typeof File, string]> = {
  'application/vnd.google-apps.document': [FileText, 'text-sky-600'],
  'application/vnd.google-apps.spreadsheet': [FileSpreadsheet, 'text-emerald-600'],
  'application/vnd.google-apps.presentation': [Presentation, 'text-amber-500'],
}

export function FileIcon({ entry, size = 20 }: { entry: Entry; size?: number }) {
  if (entry.is_folder) return <Folder size={size} className="shrink-0 fill-sky-400/25 text-sky-500" />
  const [Icon, color] = GOOGLE[entry.mime_type ?? ''] ?? EXT[entry.name.split('.').pop()?.toLowerCase() ?? ''] ?? [File, 'text-zinc-400']
  return <Icon size={size} className={`shrink-0 ${color}`} />
}
