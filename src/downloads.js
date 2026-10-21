export function downloadText(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  // Give mobile browsers time to consume the download before releasing it.
  window.setTimeout(() => URL.revokeObjectURL(url), 30000)
}
