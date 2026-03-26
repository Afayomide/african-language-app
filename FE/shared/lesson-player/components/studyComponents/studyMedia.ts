export function playAudioUrl(url?: string, speed = 1, onEnd?: () => void) {
  if (!url) {
    onEnd?.()
    return
  }

  const audio = new Audio(url)
  audio.playbackRate = speed
  if (onEnd) {
    audio.onended = onEnd
    audio.onerror = onEnd
  }
  audio.play().catch(() => onEnd?.())
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('audio_read_failed'))
    reader.readAsDataURL(blob)
  })
}
