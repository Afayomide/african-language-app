'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'

function createLearnerQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 10 * 60 * 1000,
        refetchOnWindowFocus: true,
        retry: 1,
      },
    },
  })
}

export function LearnerQueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createLearnerQueryClient)
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
