export type Theme = 'light' | 'dark' | 'system'

export function getTheme(): Theme {
  try { return (localStorage.getItem('dm-theme') as Theme) || 'system' } catch { return 'system' }
}

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  try { localStorage.setItem('dm-theme', theme) } catch { /* private mode */ }
}
