// src/App.tsx
// 5.4 — Added Clerk SignedIn/SignedOut guards on all protected routes.
// 5.5 — Added routes for Dashboard, Agents, Calls, Knowledge pages.

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/clerk-react'
import HomePage from './pages/HomePage'
import AgentFlowBuilder from './pages/AgentFlowBuilder'
import Playground from './pages/Playground'
import Billing from './pages/Billing'
import Dashboard from './pages/Dashboard'
import Agents from './pages/Agents'
import Calls from './pages/Calls'
import Knowledge from './pages/Knowledge'

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

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public landing page */}
        <Route path="/" element={<HomePage />} />

        {/* Protected dashboard routes */}
        <Route
          path="/dashboard"
          element={
            <Protected>
              <Dashboard />
            </Protected>
          }
        />
        <Route
          path="/agents"
          element={
            <Protected>
              <Agents />
            </Protected>
          }
        />
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
        <Route
          path="/calls"
          element={
            <Protected>
              <Calls />
            </Protected>
          }
        />
        <Route
          path="/knowledge"
          element={
            <Protected>
              <Knowledge />
            </Protected>
          }
        />
        <Route
          path="/billing"
          element={
            <Protected>
              <Billing />
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
