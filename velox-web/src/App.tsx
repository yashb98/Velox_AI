// src/App.tsx
// Routing config.
// - WithLayout wraps protected pages in the collapsible AppLayout sidebar.
// - Playground and Flow Builder (per-agent) remain full-screen (no sidebar).
// - Top-level routes: /playground (PlaygroundHub), /flow (FlowCanvas), /policy (CompanyPolicy).
// - When VITE_AUTH_ENABLED=false, all routes are accessible without authentication.

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react'
import HomePage from './pages/HomePage'
import DocsPage from './pages/DocsPage'
import AgentFlowBuilder from './pages/AgentFlowBuilder'
import Playground from './pages/Playground'
import PlaygroundHub from './pages/PlaygroundHub'
import FlowCanvas from './pages/FlowCanvas'
import CompanyPolicy from './pages/CompanyPolicy'
import Billing from './pages/Billing'
import Dashboard from './pages/Dashboard'
import Agents from './pages/Agents'
import Calls from './pages/Calls'
import Knowledge from './pages/Knowledge'
import AppLayout from './components/AppLayout'

// Check if auth is enabled (from environment)
const AUTH_ENABLED = import.meta.env.VITE_AUTH_ENABLED !== 'false'
const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// Auth is truly enabled only if both the flag is set and we have a valid key
const isAuthEnabled = AUTH_ENABLED && CLERK_KEY && CLERK_KEY.startsWith('pk_')

// Wrapper: redirects to Clerk sign-in if user is not authenticated
// When auth is disabled, just renders children directly
function Protected({ children }: { children: React.ReactNode }) {
  if (!isAuthEnabled) {
    // Auth disabled - render children directly
    return <>{children}</>
  }

  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </>
  )
}

// Wrap with sidebar layout
function WithLayout({ children }: { children: React.ReactNode }) {
  return (
    <Protected>
      <AppLayout>{children}</AppLayout>
    </Protected>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<HomePage />} />
        <Route path="/docs" element={<DocsPage />} />

        {/* Protected dashboard routes — all wrapped with AppLayout sidebar */}
        <Route path="/dashboard"  element={<WithLayout><Dashboard /></WithLayout>} />
        <Route path="/agents"     element={<WithLayout><Agents /></WithLayout>} />
        <Route path="/playground" element={<WithLayout><PlaygroundHub /></WithLayout>} />
        <Route path="/flow"       element={<WithLayout><FlowCanvas /></WithLayout>} />
        <Route path="/calls"      element={<WithLayout><Calls /></WithLayout>} />
        <Route path="/knowledge"  element={<WithLayout><Knowledge /></WithLayout>} />
        <Route path="/billing"    element={<WithLayout><Billing /></WithLayout>} />
        <Route path="/policy"     element={<WithLayout><CompanyPolicy /></WithLayout>} />

        {/* Full-screen pages — no sidebar (need full canvas/screen space) */}
        <Route
          path="/agents/:agentId/flow"
          element={<Protected><AgentFlowBuilder /></Protected>}
        />
        <Route
          path="/agents/:agentId/playground"
          element={<Protected><Playground /></Protected>}
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
