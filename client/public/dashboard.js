async function refresh() {
  try {
    const response = await fetch('/metrics', { cache: 'no-store' })
    if (!response.ok) throw new Error(String(response.status))
    document.querySelector('#metrics').textContent = await response.text()
  } catch {
    document.querySelector('#metrics').textContent = 'Server unavailable. Retrying…'
  }
}
void refresh()
setInterval(refresh, 2000)
