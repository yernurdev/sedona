export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:8080/api'

const TOKEN_KEY = 'sedona.token'

const friendly: Record<string, string> = {
  llm_unavailable: 'Email drafting is temporarily unavailable. All numbers on this page are still correct.',
  llm_failed: 'The writing service is busy right now. Try again in a few seconds.',
  internal: 'We couldn’t finish this calculation. Please try again in a moment.',
  payments_unavailable: 'Payments are temporarily unavailable. Please try again shortly.',
  not_found: 'We couldn’t find this plan. It may belong to another browser session — start a new one.',
  network: 'Can’t reach the server. Check your connection and try again.',
}

export class ApiError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

function writeToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* storage unavailable: session lives in memory only */
  }
}

let memoryToken: string | null = readToken()
let pending: Promise<string> | null = null

export function getToken() {
  return memoryToken
}

export async function ensureSession(): Promise<string> {
  if (memoryToken) return memoryToken
  pending ??= fetch(`${API_URL}/sessions`, { method: 'POST' })
    .then(async (r) => {
      if (!r.ok) throw new ApiError(r.status, 'session_failed', 'Could not start a session. Check your connection.')
      const body = (await r.json()) as { token: string }
      memoryToken = body.token
      writeToken(body.token)
      return body.token
    })
    .finally(() => {
      pending = null
    })
  return pending
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const token = await ensureSession()
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
    })
  } catch {
    throw new ApiError(0, 'network', friendly.network)
  }
  if (res.status === 401 && retry) {
    memoryToken = null
    writeToken(null)
    return api<T>(path, init, false)
  }
  if (res.status === 204) return undefined as T
  const text = await res.text()
  let body: { error?: { code?: string; message?: string } } = {}
  try {
    body = text ? JSON.parse(text) : {}
  } catch {
    throw new ApiError(res.status, 'internal', friendly.internal)
  }
  if (!res.ok) {
    const e = body.error ?? {}
    const code = e.code ?? 'error'
    throw new ApiError(res.status, code, friendly[code] ?? e.message ?? 'Something went wrong. Please try again.')
  }
  return body as T
}

export const post = <T,>(path: string, body: unknown) => api<T>(path, { method: 'POST', body: JSON.stringify(body) })
export const del = (path: string) => api<void>(path, { method: 'DELETE' })

export async function download(path: string, filename: string) {
  const token = await ensureSession()
  const r = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new ApiError(r.status, 'download_failed', 'Download failed.')
  const blob = await r.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}
