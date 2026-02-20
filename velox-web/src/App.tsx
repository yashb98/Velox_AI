// src/App.tsx
// Shared AppLayout (collapsible sidebar + Velox logo) wraps all protected pages.

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react'
import HomePage from './pages/HomePage'
import DocsPage from './pages/DocsPage'
import AgentFlowBuilder from './pages/AgentFlowBuilder'
import Playground from './pages/Playground'
import Billing from './pages/Billing'
import Dashboard from './pages/Dashboard'
import Agents from './pages/Agents'
import Calls from './pages/Calls'
import Knowledge from './pages/Knowledge'
import AppLayout from './components/AppLayout'

// Wrapper: redirects to Clerk sign-in if user is not authenticated
function Protected({ children }: { children: React.ReactNode }) {
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
        <Route
          path="/dashboard"
          element={<WithLayout><Dashboard /></WithLayout>}
        />
        <Route
          path="/agents"
          element={<WithLayout><Agents /></WithLayout>}
        />
        <Route
          path="/calls"
          element={<WithLayout><Calls /></WithLayout>}
        />
        <Route
          path="/knowledge"
          element={<WithLayout><Knowledge /></WithLayout>}
        />
        <Route
          path="/billing"
          element={<WithLayout><Billing /></WithLayout>}
        />

        {/* Full-screen pages — no sidebar (need full canvas/screen space) */}
        <Route
          path="/agents/:agentId/flow"
          element={
            <Protected>
              <AgentFlowBuilder />
            </Protected>
          }
        />
        <Route
          path="/agents/:agentId/playground"
          element={
            <Protected>
              <Playground />
            </Protected>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
