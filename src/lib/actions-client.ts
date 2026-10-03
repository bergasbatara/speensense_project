import { getAuthToken } from 'deepspace'

export async function callAction<T>(name: string, params: unknown): Promise<T> {
  const token = await getAuthToken()
  if (!token) throw new Error('Please sign in again')
  const response = await fetch(`/api/actions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(params),
  })
  const result = await response.json().catch(() => { throw new Error(`Server request failed (${response.status}). Please try again.`) }) as { success: boolean; data?: T; error?: string }
  if (!response.ok || !result.success) throw new Error(result.error ?? 'Request failed')
  return result.data as T
}
