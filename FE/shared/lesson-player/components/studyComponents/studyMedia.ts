/**
 * Play an audio clip. If it fails to load, try once more (a dropped connection often
 * recovers), then report the failure through onError so the learner is told instead of
 * hearing nothing. A play() refused by the browser's autoplay rule is not retried.
 */
// Clips currently playing, so recording can silence them before the mic opens.
const activeClips = new Set<HTMLAudioElement>()

/** Stop every lesson clip that is still playing. */
export function stopAllAudio() {
  activeClips.forEach((audio) => {
    audio.pause()
    audio.onended = null
    audio.onerror = null
  })
  activeClips.clear()
}

export function playAudioUrl(url?: string, speed = 1, onEnd?: () => void, onError?: () => void) {
  if (!url) {
    onEnd?.()
    return
  }

  let settled = false
  const fail = () => {
    if (settled) return
    settled = true
    onError?.()
    onEnd?.()
  }

  const attempt = (isRetry: boolean) => {
    const audio = new Audio(url)
    audio.playbackRate = speed
    activeClips.add(audio)
    audio.addEventListener('ended', () => activeClips.delete(audio))
    let failedThisTry = false
    const handleFailure = () => {
      activeClips.delete(audio)
      if (failedThisTry || settled) return
      failedThisTry = true
      if (isRetry) fail()
      else attempt(true)
    }
    audio.onended = () => {
      if (settled) return
      settled = true
      onEnd?.()
    }
    audio.onerror = handleFailure
    audio.play().catch((error: unknown) => {
      if ((error as { name?: string } | null)?.name === 'NotAllowedError') {
        if (!settled) {
          settled = true
          onEnd?.()
        }
        return
      }
      handleFailure()
    })
  }

  attempt(false)
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('audio_read_failed'))
    reader.readAsDataURL(blob)
  })
}
