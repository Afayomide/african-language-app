// Kela greets visitors in each launch language. Keep these checked by a speaker.
export const GREETINGS = [
  { id: 'yoruba', language: 'Yorùbá', text: 'Ẹ káàbọ̀!', meaning: 'Welcome!' },
  { id: 'igbo', language: 'Igbo', text: 'Nnọọ!', meaning: 'Welcome!' },
  { id: 'hausa', language: 'Hausa', text: 'Barka da zuwa!', meaning: 'Welcome!' },
  { id: 'pidgin', language: 'Pidgin', text: 'How far?', meaning: "What's up?" },
] as const

/** BCP 47 code for a greeting, so screen readers pronounce it in the right language. */
export function greetingLang(id: (typeof GREETINGS)[number]['id']) {
  return { yoruba: 'yo', igbo: 'ig', hausa: 'ha', pidgin: 'pcm' }[id]
}
