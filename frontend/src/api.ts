export type User = { id: string; email: string; name: string; is_admin: boolean }
export type Account = { id: string; provider: string; label: string; external_email: string | null; color: string; root_id: string }
export type ProviderInfo = { kind: string; name: string; configured: boolean; coming_soon?: boolean }
export type Entry = {
  id: string; name: string; is_folder: boolean; size: number | null; mime_type: string | null
  modified_at: string | null; parent_ids: string[]; thumbnail_url: string | null; web_url: string | null
}
export type Listing = { entries: Entry[]; next_page_token: string | null }

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) { super(message); this.status = status }
}

async function req<T>(method: string, path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { 'x-requested-with': 'drive-manager' }
  if (body !== undefined && !(body instanceof Blob)) headers['content-type'] = 'application/json'
  const res = await fetch(path, {
    method, credentials: 'same-origin', headers,
    body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
    ...init,
  })
  if (!res.ok) {
    let msg = res.statusText
    try { const j = await res.json(); msg = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail) } catch { /* not json */ }
    throw new ApiError(res.status, msg)
  }
  return res.json()
}

const q = (params: Record<string, string>) => new URLSearchParams(params).toString()
const files = (accountId: string) => `/api/accounts/${accountId}/files`

export const api = {
  status: () => req<{ needs_setup: boolean }>('GET', '/api/auth/status'),
  me: () => req<User>('GET', '/api/auth/me'),
  setup: (b: { name: string; email: string; password: string }) => req<User>('POST', '/api/auth/setup', b),
  login: (b: { email: string; password: string }) => req<User>('POST', '/api/auth/login', b),
  logout: () => req('POST', '/api/auth/logout'),

  providers: () => req<ProviderInfo[]>('GET', '/api/accounts/providers'),
  accounts: () => req<Account[]>('GET', '/api/accounts'),
  connectLocal: () => req<Account>('POST', '/api/accounts/local'),
  updateAccount: (id: string, b: { label?: string; color?: string }) => req<Account>('PATCH', `/api/accounts/${id}`, b),
  disconnect: (id: string) => req('DELETE', `/api/accounts/${id}`),
  quota: (id: string) => req<{ used: number | null; total: number | null }>('GET', `/api/accounts/${id}/quota`),
  oauthStartUrl: (provider: string) => `/api/accounts/oauth/${provider}/start`,

  list: (a: string, folderId: string) => req<Listing>('GET', `${files(a)}?${q({ folder_id: folderId })}`),
  search: (a: string, query: string) => req<Listing>('GET', `${files(a)}/search?${q({ q: query })}`),
  stat: (a: string, id: string) => req<Entry>('GET', `${files(a)}/item?${q({ id })}`),
  mkdir: (a: string, parentId: string, name: string) => req<Entry>('POST', `${files(a)}/folders`, { parent_id: parentId, name }),
  rename: (a: string, id: string, name: string) => req<Entry>('POST', `${files(a)}/rename?${q({ id })}`, { name }),
  move: (a: string, id: string, newParentId: string) => req<Entry>('POST', `${files(a)}/move?${q({ id })}`, { new_parent_id: newParentId }),
  remove: (a: string, id: string) => req('DELETE', `${files(a)}?${q({ id })}`),
  upload: (a: string, parentId: string, file: File) => req<Entry>('POST', `${files(a)}/upload?${q({ parent_id: parentId, name: file.name })}`, file),
  downloadUrl: (a: string, id: string) => `${files(a)}/download?${q({ id })}`,
}
