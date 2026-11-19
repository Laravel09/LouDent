import { ReactNode, useState, useRef, useEffect } from "react"
import { Dentist, PatientProfile, Screen } from "../types"
import { Logo, Button, LogoutDialog, ProfileAvatar, icons } from "./common"

// ─── Patient Layout ───────────────────────────────────────────────────────────

interface PatientLayoutProps {
  children: ReactNode
  activeScreen: Screen
  navigate: (screen: Screen, params?: any) => void
  onLogout: () => void
  profile: PatientProfile
}

type NavGroup = {
  label: string
  items: NavItem[]
}

type NavItem = {
  screen: Screen
  label: string
  icon: ReactNode
  match?: Screen[]
}

const patientNavGroups: NavGroup[] = [
  {
    label: "Main",
    items: [
      { screen: "patient-home", label: "Home", icon: icons.home },
      {
        screen: "services",
        label: "Services",
        icon: icons.services,
        match: ["services", "service-detail"],
      },
      {
        screen: "dentists",
        label: "Dentists",
        icon: icons.dentists,
        match: ["dentists", "dentist-profile"],
      },
      {
        screen: "my-appointments",
        label: "My Appointments",
        icon: icons.appointments,
        match: ["my-appointments", "appointment-detail"],
      },
    ],
  },
  {
    label: "Account",
    items: [
      {
        screen: "profile",
        label: "Profile",
        icon: icons.profile,
        match: ["profile", "edit-profile"],
      },
      { screen: "settings", label: "Settings", icon: icons.settings },
    ],
  },
]

export function PatientLayout({
  children,
  activeScreen,
  navigate,
  onLogout,
  profile,
}: PatientLayoutProps) {
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const isActive = (screen: Screen, match?: Screen[]) => {
    if (match) return match.includes(activeScreen)
    return activeScreen === screen
  }
  const go = (screen: Screen, params?: any) => {
    setMobileOpen(false)
    navigate(screen, params)
  }
  const initials = profile.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
  const displayName =
    profile.name.length > 18
      ? `${profile.name.split(" ")[0]} ${profile.name.split(" ").at(-1)?.[0] ?? ""}.`
      : profile.name

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* Sidebar */}
      {mobileOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-navy/30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-border flex flex-col flex-shrink-0 transition-transform md:static md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-5 py-5 border-b border-border">
          <Logo />
        </div>

        <div className="px-3 py-3">
          <Button
            variant="primary"
            size="md"
            fullWidth
            onClick={() => go("book-category", { freshBooking: true })}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
              <path
                d="M8 3v10M3 8h10"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            Book Appointment
          </Button>
        </div>

        <nav className="flex-1 px-3 pb-3 overflow-y-auto space-y-4">
          {patientNavGroups.map(({ label, items }) => (
            <div key={label}>
              <p className="px-3 mb-1 text-[10px] font-bold text-muted uppercase tracking-widest">
                {label}
              </p>
              <div className="space-y-0.5">
                {items.map(({ screen, label: itemLabel, icon, match }) => {
                  const active = isActive(screen, match)
                  return (
                    <button
                      key={screen}
                      onClick={() => go(screen)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        active
                          ? "bg-blue-tint text-blue"
                          : "text-muted hover:bg-surface-2 hover:text-navy"
                      }`}
                    >
                      <span className={active ? "text-blue" : "text-muted"}>
                        {icon}
                      </span>
                      {itemLabel}
                      {active && (
                        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue" />
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-border">
          <button
            onClick={() => setLogoutOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted hover:bg-red-50 hover:text-danger transition-colors"
          >
            <span>{icons.logout}</span>
            Log Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto flex flex-col min-w-0">
        {/* Top bar */}
        <div className="sticky top-0 z-20 bg-white border-b border-border px-4 sm:px-8 py-3.5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 text-sm text-muted">
            <button
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-navy hover:bg-surface md:hidden"
            >
              <span className="block h-0.5 w-5 bg-current mb-1" />
              <span className="block h-0.5 w-5 bg-current mb-1" />
              <span className="block h-0.5 w-5 bg-current" />
            </button>
            <span className="font-medium text-navy">LouDent</span>
            <span className="text-border">·</span>
            <span>Dental Clinic, Cebu City</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Profile dropdown */}
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen((v) => !v)}
                className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg hover:bg-surface-2 transition-colors"
              >
                <ProfileAvatar
                  photo={profile.photoDataUrl}
                  initials={initials}
                  className="h-8 w-8 text-xs"
                />
                <div className="text-left">
                  <div className="text-sm font-semibold text-navy leading-tight">
                    {displayName}
                  </div>
                  <div className="text-xs text-muted leading-tight">
                    Patient
                  </div>
                </div>
                <svg
                  className={`w-3.5 h-3.5 text-muted transition-transform ${
                    profileOpen ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 16 16"
                >
                  <path
                    d="M4 6l4 4 4-4"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-border rounded-xl shadow-lg py-1 z-50">
                  <button
                    onClick={() => {
                      setProfileOpen(false)
                      navigate("profile")
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-navy hover:bg-surface transition-colors"
                  >
                    {icons.profile} My Profile
                  </button>
                  <button
                    onClick={() => {
                      setProfileOpen(false)
                      navigate("settings")
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-navy hover:bg-surface transition-colors"
                  >
                    {icons.settings} Settings
                  </button>
                  <div className="h-px bg-border my-1" />
                  <button
                    onClick={() => {
                      setProfileOpen(false)
                      setLogoutOpen(true)
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-danger hover:bg-red-50 transition-colors"
                  >
                    {icons.logout} Log Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-8 py-7 flex-1">{children}</div>
      </main>

      {logoutOpen && (
        <LogoutDialog
          onConfirm={() => {
            setLogoutOpen(false)
            onLogout()
          }}
          onCancel={() => setLogoutOpen(false)}
        />
      )}
    </div>
  )
}

// ─── Admin Layout ─────────────────────────────────────────────────────────────

interface AdminLayoutProps {
  children: ReactNode
  activeScreen: Screen
  navigate: (screen: Screen, params?: any) => void
  onLogout: () => void
  dentist: Dentist
}

const adminNavItems = [
  {
    screen: "admin-dashboard" as Screen,
    label: "Dashboard",
    icon: icons.dashboard,
  },
  {
    screen: "admin-appointments" as Screen,
    label: "Appointments",
    icon: icons.appointments,
  },
  {
    screen: "admin-availability" as Screen,
    label: "Availability",
    icon: icons.availability,
  },
  {
    screen: "admin-profile" as Screen,
    label: "My Profile",
    icon: icons.profile,
  },
  {
    screen: "admin-settings" as Screen,
    label: "Settings",
    icon: icons.settings,
  },
]

export function AdminLayout({
  children,
  activeScreen,
  navigate,
  onLogout,
  dentist,
}: AdminLayoutProps) {
  const [logoutOpen, setLogoutOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const isActive = (screen: Screen) => {
    if (screen === "admin-appointments")
      return ["admin-appointments", "admin-appointment-detail"].includes(
        activeScreen,
      )
    return activeScreen === screen
  }
  const go = (screen: Screen) => {
    setMobileOpen(false)
    navigate(screen)
  }

  return (
    <div className="flex h-screen bg-surface overflow-hidden">
      {/* Sidebar */}
      {mobileOpen && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-navy/30 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-60 bg-white border-r border-border flex flex-col flex-shrink-0 transition-transform md:static md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-5 py-5 border-b border-border">
          <Logo />
          <span className="mt-2 block text-xs font-semibold text-muted uppercase tracking-wider">
            Dentist Portal
          </span>
        </div>

        <nav className="flex-1 px-3 pt-4 space-y-0.5 overflow-y-auto">
          {adminNavItems.map(({ screen, label, icon }) => (
            <button
              key={screen}
              onClick={() => go(screen)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive(screen)
                  ? "bg-blue-tint text-blue"
                  : "text-muted hover:bg-surface-2 hover:text-navy"
              }`}
            >
              <span className={isActive(screen) ? "text-blue" : "text-muted"}>
                {icon}
              </span>
              {label}
              {isActive(screen) && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue" />
              )}
            </button>
          ))}
        </nav>

        <div className="px-3 py-4 border-t border-border space-y-0.5">
          <button
            onClick={() => setLogoutOpen(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted hover:bg-red-50 hover:text-danger transition-colors"
          >
            <span>{icons.logout}</span>
            Log Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-20 bg-white border-b border-border px-4 sm:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-sm text-muted">
            <button
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
              className="rounded-lg p-2 text-navy hover:bg-surface md:hidden"
            >
              <span className="block h-0.5 w-5 bg-current mb-1" />
              <span className="block h-0.5 w-5 bg-current mb-1" />
              <span className="block h-0.5 w-5 bg-current" />
            </button>
            LouDent · Dentist Portal
          </div>
          <div className="flex items-center gap-2">
            <ProfileAvatar
              photo={dentist.photo}
              initials={dentist.name
                .split(" ")
                .slice(1)
                .map((part) => part[0])
                .join("")
                .slice(0, 2)}
              className="h-8 w-8 text-xs"
            />
            <span className="text-sm font-medium text-navy">
              {dentist.name}
            </span>
          </div>
        </div>
        <div className="px-4 sm:px-8 py-7 w-full">{children}</div>
      </main>

      {logoutOpen && (
        <LogoutDialog
          onConfirm={() => {
            setLogoutOpen(false)
            onLogout()
          }}
          onCancel={() => setLogoutOpen(false)}
        />
      )}
    </div>
  )
}

// ─── Public Header ────────────────────────────────────────────────────────────

interface PublicHeaderProps {
  navigate: (screen: Screen, params?: any) => void
  activeScreen?: Screen
}

type PublicNavItem = {
  label: string
  screen: Screen
}

const PUBLIC_NAV_ITEMS: PublicNavItem[] = [
  { label: "Home", screen: "landing" },
  { label: "Services", screen: "services" },
  { label: "About", screen: "about" },
  { label: "Contact", screen: "contact" },
]

export function PublicHeader({ navigate, activeScreen }: PublicHeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <header className="sticky top-0 z-30 bg-white border-b border-border">
      <div className="max-w-6xl mx-auto px-6 h-18 flex items-center justify-between py-4">
        <button onClick={() => navigate("landing")} className="cursor-pointer">
          <Logo />
        </button>
        <nav className="hidden md:flex items-center gap-6">
          {PUBLIC_NAV_ITEMS.map(({ label, screen }) => {
            const isActive =
              activeScreen === screen ||
              (screen === "landing" && activeScreen === "landing")
            return (
              <button
                key={label}
                onClick={() => navigate(screen)}
                className={`text-sm font-medium transition-colors ${
                  isActive
                    ? "text-blue border-b-2 border-blue pb-0.5"
                    : "text-muted hover:text-navy"
                }`}
              >
                {label}
              </button>
            )
          })}
        </nav>
        <div className="hidden sm:flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate("signup")}
          >
            Sign Up
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate("patient-login")}
          >
            Log In
          </Button>
        </div>
        <button
          aria-label="Toggle menu"
          onClick={() => setMobileOpen((value) => !value)}
          className="rounded-lg border border-border p-2 text-navy md:hidden"
        >
          <span className="block h-0.5 w-5 bg-current mb-1" />
          <span className="block h-0.5 w-5 bg-current mb-1" />
          <span className="block h-0.5 w-5 bg-current" />
        </button>
      </div>
      {mobileOpen && (
        <div className="border-t border-border bg-white px-6 py-4 md:hidden">
          <div className="flex flex-col gap-2">
            {PUBLIC_NAV_ITEMS.map(({ label, screen }) => (
              <button
                key={screen}
                onClick={() => {
                  setMobileOpen(false)
                  navigate(screen)
                }}
                className="rounded-lg px-3 py-2 text-left text-sm font-medium text-navy hover:bg-surface"
              >
                {label}
              </button>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setMobileOpen(false)
                  navigate("signup")
                }}
              >
                Sign Up
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  setMobileOpen(false)
                  navigate("patient-login")
                }}
              >
                Log In
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}

// ─── Public Footer ────────────────────────────────────────────────────────────

export function PublicFooter({
  navigate,
}: {
  navigate?: (screen: Screen) => void
}) {
  return (
    <footer className="bg-navy text-white">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                <path
                  d="M16 3C11.5 3 7.5 6.5 7.5 11.5c0 2.2.7 4.2 1.6 6.2L11 24c.5 1.8 1.2 3 2.8 3h4.4c1.6 0 2.3-1.2 2.8-3l1.9-6.3c.9-2 1.6-4 1.6-6.2C24.5 6.5 20.5 3 16 3z"
                  fill="#60A5FA"
                  opacity="0.4"
                />
                <path
                  d="M16 3C11.5 3 7.5 6.5 7.5 11.5c0 2.2.7 4.2 1.6 6.2L11 24c.5 1.8 1.2 3 2.8 3h4.4c1.6 0 2.3-1.2 2.8-3l1.9-6.3c.9-2 1.6-4 1.6-6.2C24.5 6.5 20.5 3 16 3z"
                  stroke="#60A5FA"
                  strokeWidth="1.5"
                />
              </svg>
              <span className="font-bold text-white text-lg">LouDent</span>
            </div>
            <p className="text-sm text-white/60 leading-relaxed">
              Professional dental care in Cebu City. Your smile is our passion.
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-3">Quick Links</h4>
            <ul className="space-y-2">
              {[
                ["Home", "landing"],
                ["Services", "services"],
                ["About", "about"],
                ["Contact", "contact"],
                ["Dentist Login", "admin-login"],
              ].map(([label, screen]) => (
                <li key={label}>
                  <button
                    onClick={() => navigate?.(screen as Screen)}
                    className="text-sm text-white/60 hover:text-white transition-colors"
                  >
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold text-sm mb-3">Contact</h4>
            <ul className="space-y-2 text-sm text-white/60">
              <li>Cebu City, Cebu</li>
              <li>(032) 555-1234</li>
              <li>info@loudent.com</li>
              <li>Mon–Fri · 9:00 AM–6:00 PM</li>
              <li>Saturday · 9:00 AM–3:00 PM</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 pt-6 flex flex-col gap-2 text-xs text-white/40 sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {new Date().getFullYear()} LouDent · Classroom demo only
          </span>
          <a
            href="https://unsplash.com/@karibjorn"
            target="_blank"
            rel="noreferrer"
            className="hover:text-white"
          >
            Hero photography by Kari Bjorn on Unsplash
          </a>
        </div>
      </div>
    </footer>
  )
}
