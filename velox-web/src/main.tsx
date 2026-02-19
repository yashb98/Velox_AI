import { StrictMode, Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { ClerkProvider } from '@clerk/clerk-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// ── Top-level error boundary ──────────────────────────────────────────────────
// Catches crashes from ClerkProvider (e.g. invalid publishable key in local dev)
// and renders a helpful fallback instead of a white screen.
class RootErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[RootErrorBoundary]', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, sans-serif',
          background: '#09090b',
          color: '#fafafa',
          padding: '2rem',
          textAlign: 'center',
          gap: '1rem',
        }}>
          <div style={{ fontSize: '3rem' }}>⚠️</div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
            App failed to start
          </h1>
          <p style={{ color: '#a1a1aa', maxWidth: '480px', margin: 0 }}>
            {this.state.error.message}
          </p>
          <details style={{ color: '#71717a', fontSize: '0.875rem', maxWidth: '600px' }}>
            <summary style={{ cursor: 'pointer', marginBottom: '0.5rem' }}>
              Common fix: set a valid VITE_CLERK_PUBLISHABLE_KEY in your .env
            </summary>
            <code style={{ display: 'block', textAlign: 'left', whiteSpace: 'pre-wrap', marginTop: '0.5rem' }}>
              # .env{'\n'}
              VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxxx...{'\n'}
              {'\n'}
              # Get yours at https://dashboard.clerk.com
            </code>
          </details>
        </div>
      )
    }
    return this.props.children
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
    },
  },
})

// Use a dummy key when none is set so ClerkProvider doesn't throw
// before the error boundary can catch it. Auth will still fail at
// runtime but the landing page (public route) will render correctly.
const clerkKey = PUBLISHABLE_KEY && PUBLISHABLE_KEY.startsWith('pk_')
  ? PUBLISHABLE_KEY
  : 'pk_test_placeholder_key_that_wont_work'

if (!PUBLISHABLE_KEY || !PUBLISHABLE_KEY.startsWith('pk_')) {
  console.warn(
    '[Velox] VITE_CLERK_PUBLISHABLE_KEY is missing or invalid — ' +
    'authentication will not work. Public pages (landing, marketing) still render. ' +
    'Get a valid key at https://dashboard.clerk.com'
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <ClerkProvider publishableKey={clerkKey}>
        <QueryClientProvider client={queryClient}>
          <App />
        </QueryClientProvider>
      </ClerkProvider>
    </RootErrorBoundary>
  </StrictMode>,
)
