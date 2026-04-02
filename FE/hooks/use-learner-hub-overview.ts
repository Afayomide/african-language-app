'use client'

import { useEffect, useState } from 'react'
import { learnerDashboardService } from '@/services'

export function useLearnerHubOverview(enabled = true) {
  const [languageLabel, setLanguageLabel] = useState('Yoruba')
  const [streakDays, setStreakDays] = useState(0)

  useEffect(() => {
    if (!enabled) return
    learnerDashboardService
      .getOverview()
      .then((data) => {
        setLanguageLabel(data.stats.currentLanguage || 'Yoruba')
        setStreakDays(data.stats.languageStreakDays || data.stats.streakDays || 0)
      })
      .catch(() => {})
  }, [enabled])

  return { languageLabel, streakDays }
}
