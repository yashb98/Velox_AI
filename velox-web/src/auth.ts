// src/auth.ts
// Auth configuration - determines if Clerk authentication is enabled

const AUTH_ENABLED = import.meta.env.VITE_AUTH_ENABLED !== 'false'
const CLERK_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY

// Auth is truly enabled only if:
// 1. VITE_AUTH_ENABLED is not 'false'
// 2. VITE_CLERK_PUBLISHABLE_KEY exists
// 3. Key starts with 'pk_'
// 4. Key is not a placeholder like "pk_test_..."
export const isAuthEnabled = AUTH_ENABLED &&
  CLERK_KEY &&
  CLERK_KEY.startsWith('pk_') &&
  !CLERK_KEY.includes('...')

export const clerkPublishableKey = CLERK_KEY
