// src/components/AppLayout.tsx
// Shared layout: collapsible sidebar + Velox AI logo on every protected page.

import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  Bot,
  Phone,
  BookOpen,
  CreditCard,
  Menu,
  ChevronLeft,
  ChevronRight,
  Zap,
  ExternalLink,
  Play,
  GitBranch,
  Shield,
} from 'lucide-react'

// ── Nav items ──────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { to: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/agents',     label: 'Agents',     icon: Bot },
  { to: '/playground', label: 'Playground', icon: Play },
  { to: '/flow',       label: 'Flow',       icon: GitBranch },
  { to: '/calls',      label: 'Calls',      icon: Phone },
  { to: '/knowledge',  label: 'Knowledge',  icon: BookOpen },
  { to: '/policy',     label: 'Policy',     icon: Shield },
  { to: '/billing',    label: 'Billing',    icon: CreditCard },
]

const BOTTOM_ITEMS = [
  { to: '/docs',       label: 'Docs',       icon: ExternalLink, external: true },
]

// ── Component ──────────────────────────────────────────────────────────────────
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar_collapsed') === 'true' } catch { return false }
  })
  const [mobileOpen, setMobileOpen] = useState(false)

  // Persist collapsed state
  useEffect(() => {
    try { localStorage.setItem('sidebar_collapsed', String(collapsed)) } catch { /* noop */ }
  }, [collapsed])

  // Close mobile sidebar on route change
  useEffect(() => { setMobileOpen(false) }, [location.pathname])

  const isActive = (to: string) => location.pathname === to || location.pathname.startsWith(to + '/')

  function SidebarContent({ mobile = false }: { mobile?: boolean }) {
    return (
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className={`flex items-center gap-2.5 px-4 py-5 border-b border-stone-200 ${collapsed && !mobile ? 'justify-center px-0' : ''}`}>
          <Link
            to="/"
            className="flex items-center gap-2.5 group"
            title="Velox AI — Home"
          >
            <div className="h-8 w-8 rounded-lg bg-amber-600 flex items-center justify-center shrink-0 group-hover:shadow-[0_0_12px_rgba(217,119,6,0.5)] transition-shadow duration-300">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <AnimatePresence>
              {(!collapsed || mobile) && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.15 }}
                  className="text-base font-bold text-stone-900 whitespace-nowrap overflow-hidden group-hover:text-amber-700 transition-colors"
                >
                  Velox AI
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
        </div>

        {/* Nav links */}
        <nav className="flex-1 py-4 space-y-0.5 px-2">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
            const active = isActive(to)
            return (
              <Link
                key={to}
                to={to}
                title={collapsed && !mobile ? label : undefined}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150
                  ${active
                    ? 'bg-amber-100 text-amber-800 border border-amber-200'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100 border border-transparent'}
                  ${collapsed && !mobile ? 'justify-center px-0' : ''}
                `}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-amber-700' : ''}`} />
                <AnimatePresence>
                  {(!collapsed || mobile) && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      transition={{ duration: 0.15 }}
                      className="whitespace-nowrap overflow-hidden"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </Link>
            )
          })}
        </nav>

        {/* Bottom links */}
        <div className="py-3 px-2 border-t border-stone-200 space-y-0.5">
          {BOTTOM_ITEMS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              title={collapsed && !mobile ? label : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-stone-500 hover:text-stone-700 hover:bg-stone-100 transition-all ${collapsed && !mobile ? 'justify-center px-0' : ''}`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <AnimatePresence>
                {(!collapsed || mobile) && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.15 }}
                    className="whitespace-nowrap overflow-hidden"
                  >
                    {label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          ))}

          {/* Collapse toggle (desktop only) */}
          {!mobile && (
            <button
              onClick={() => setCollapsed((c) => !c)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-stone-500 hover:text-stone-700 hover:bg-stone-100 transition-all ${collapsed ? 'justify-center px-0' : ''}`}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? (
                <ChevronRight className="h-4 w-4 shrink-0" />
              ) : (
                <>
                  <ChevronLeft className="h-4 w-4 shrink-0" />
                  <span className="text-xs">Collapse</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-[#faf9f7] overflow-hidden">
      {/* ── Desktop sidebar ──────────────────────────────────────────────────── */}
      <motion.aside
        animate={{ width: collapsed ? 60 : 220 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="hidden md:flex flex-col border-r border-stone-200 bg-white shrink-0 overflow-hidden"
      >
        <SidebarContent />
      </motion.aside>

      {/* ── Mobile sidebar overlay ───────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 bg-black/40 md:hidden"
            />
            {/* Drawer */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-stone-200 flex flex-col md:hidden"
            >
              <SidebarContent mobile />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Main content area ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar with hamburger */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-stone-200 bg-white/90 backdrop-blur-sm shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-stone-500 hover:text-stone-900 transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/" className="flex items-center gap-2 group">
            <div className="h-6 w-6 rounded bg-amber-600 flex items-center justify-center group-hover:shadow-[0_0_8px_rgba(217,119,6,0.4)] transition-shadow">
              <Zap className="h-3 w-3 text-white" />
            </div>
            <span className="text-sm font-bold text-stone-900 group-hover:text-amber-700 transition-colors">Velox AI</span>
          </Link>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
