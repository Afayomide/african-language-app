import { redirect } from 'next/navigation'

export default function ReviewPage() {
  // Legacy standalone adaptive review page is intentionally disabled.
  // Personalized review now lives inside the next generated review lesson.
  redirect('/dashboard')
}
