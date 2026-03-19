import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'
import { isAuthEnabled, clerkPublishableKey } from './auth'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
})

if (!isAuthEnabled) {
  console.warn(
    '[Velox] Authentication is disabled — running in dev mode without auth. ' +
    'All routes are accessible. Set VITE_AUTH_ENABLED=true and provide a valid ' +
    'VITE_CLERK_PUBLISHABLE_KEY for production.'
  )
}

// Render app with or without Clerk based on auth status
const rootElement = document.getElementById('root')!

if (isAuthEnabled) {
  // Production mode with Clerk authentication
  createRoot(rootElement).render(
    <StrictMode>
      <ClerkProvider publishableKey={clerkPublishableKey}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </ClerkProvider>
    </StrictMode>,
  )
} else {
  // Dev mode without Clerk - bypass authentication entirely
  createRoot(rootElement).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  )
}
