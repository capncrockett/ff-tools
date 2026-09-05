export async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(
    url,
    body === undefined
      ? undefined
      : {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-tracker-request': '1' },
          body: JSON.stringify(body),
        },
  )
  const data = await response
    .json()
    .catch(() => ({ error: 'The server returned an unreadable response.' }))
  if (!response.ok) throw new Error(data.error || 'Request failed.')
  return data as T
}
