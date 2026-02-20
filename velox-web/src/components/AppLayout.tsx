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
} from 'lucide-react'

// ── Nav items ──────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { to: '/dashboard',  label: 'Dashboard',  icon: LayoutDashboard },
  { to: '/agents',     label: 'Agents',     icon: Bot },
  { to: '/playground', label: 'Playground', icon: Play },
  { to: '/flow',       label: 'Flow',       icon: GitBranch },
  { to: '/calls',      label: 'Calls',      icon: Phone },
  { to: '/knowledge',  label: 'Knowledge',  icon: BookOpen },
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
        <div className={`flex items-center gap-2.5 px-4 py-5 border-b border-slate-800 ${collapsed && !mobile ? 'justify-center px-0' : ''}`}>
          <Link
            to="/"
            className="flex items-center gap-2.5 group"
            title="Velox AI — Home"
          >
            <div className="h-8 w-8 rounded-lg bg-blue-600 flex items-center justify-center shrink-0 group-hover:shadow-[0_0_12px_rgba(59,130,246,0.6)] transition-shadow duration-300">
              <Zap className="h-4 w-4 text-white" />
            </div>
            <AnimatePresence>
              {(!collapsed || mobile) && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: 'auto' }}
                  exit={{ opacity: 0, width: 0 }}
                  transition={{ duration: 0.15 }}
                  className="text-base font-bold text-white whitespace-nowrap overflow-hidden group-hover:text-blue-400 transition-colors"
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
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/80 border border-transparent'}
                  ${collapsed && !mobile ? 'justify-center px-0' : ''}
                `}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-blue-400' : ''}`} />
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
        <div className="py-3 px-2 border-t border-slate-800 space-y-0.5">
          {BOTTOM_ITEMS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              title={collapsed && !mobile ? label : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-all ${collapsed && !mobile ? 'justify-center px-0' : ''}`}
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
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-500 hover:text-slate-300 hover:bg-slate-800/60 transition-all ${collapsed ? 'justify-center px-0' : ''}`}
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
    <div className="flex h-screen bg-slate-950 overflow-hidden">
      {/* ── Desktop sidebar ──────────────────────────────────────────────────── */}
      <motion.aside
        animate={{ width: collapsed ? 60 : 220 }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        className="hidden md:flex flex-col border-r border-slate-800 bg-slate-900/50 shrink-0 overflow-hidden"
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
              className="fixed inset-0 z-40 bg-black/60 md:hidden"
            />
            {/* Drawer */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 border-r border-slate-800 flex flex-col md:hidden"
            >
              <SidebarContent mobile />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Main content area ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar with hamburger */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-950/95 backdrop-blur shrink-0">
          <button
            onClick={() => setMobileOpen(true)}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link to="/" className="flex items-center gap-2 group">
            <div className="h-6 w-6 rounded bg-blue-600 flex items-center justify-center group-hover:shadow-[0_0_8px_rgba(59,130,246,0.5)] transition-shadow">
              <Zap className="h-3 w-3 text-white" />
            </div>
            <span className="text-sm font-bold text-white group-hover:text-blue-400 transition-colors">Velox AI</span>
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
