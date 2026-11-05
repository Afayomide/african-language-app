'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { isTransientError } from '@lesson-player/retry'

function createLearnerQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: true,
        // Retry twice when the connection or server failed; a refusal such as 404 is final.
        retry: (failureCount, error) => failureCount < 2 && isTransientError(error),
        retryDelay: (attempt) => Math.min(700 * 2 ** attempt, 4000),
      },
    },
  })
}

export function LearnerQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createLearnerQueryClient)
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
