import { lazy, Suspense, useEffect, useRef, type ReactNode } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Icon, type IconName } from './design/icons'
import { cx } from './components/ui'
import { Toasts } from './components/Toasts'
import { ErrorBoundary } from './components/ErrorBoundary'
import { kvGet, kvSet } from './lib/db'
import { useProgress } from './lib/useProgress'
import { celebrate } from './lib/toast'
import { updateStore } from './lib/pwa'
import Home from './pages/Home'
const LogList = lazy(() => import('./pages/LogList'))
const LogEditor = lazy(() => import('./pages/LogEditor'))
const LogDetail = lazy(() => import('./pages/LogDetail'))
const Tricks = lazy(() => import('./pages/Tricks'))
const TrickDetail = lazy(() => import('./pages/TrickDetail'))
const Quiz = lazy(() => import('./pages/Quiz'))
const Vault = lazy(() => import('./pages/Vault'))
const Crew = lazy(() => import('./pages/Crew'))
const Coach = lazy(() => import('./pages/Coach'))
const More = lazy(() => import('./pages/More'))
const Stats = lazy(() => import('./pages/Stats'))
const Goals = lazy(() => import('./pages/Goals'))
const Trips = lazy(() => import('./pages/Trips'))
const TripDetail = lazy(() => import('./pages/TripDetail'))
const CrewTripDetail = lazy(() => import('./pages/CrewTripDetail'))
const Weather = lazy(() => import('./pages/Weather'))
const GearPage = lazy(() => import('./pages/Gear'))
const Rider = lazy(() => import('./pages/Rider'))
const Snow = lazy(() => import('./pages/Snow'))
const Wrapped = lazy(() => import('./pages/Wrapped'))
const Settings = lazy(() => import('./pages/Settings'))
const Badges = lazy(() => import('./pages/Badges'))
const DesignSystem = lazy(() => import('./pages/DesignSystem'))

const TABS = [
  { to: '/', label: 'Home', icon: 'home', end: true },
  { to: '/log', label: 'Logboek', icon: 'log' },
  { to: '/tricks', label: 'Bijbel', icon: 'book' },
  { to: '/crew', label: 'Crew', icon: 'crew' },
  { to: '/meer', label: 'Meer', icon: 'more' },
] satisfies { to: string; label: string; icon: IconName; end?: boolean }[]

function TabBar() {
  const { pathname } = useLocation()
  if (pathname === '/log/nieuw' || pathname.endsWith('/bewerk') || pathname === '/coach') return null
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t hairline bg-bg/90 backdrop-blur-xl">
      <div className="mx-auto flex max-w-xl">
        {TABS.map(({ to, label, icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cx(
                'flex flex-1 flex-col items-center gap-1 pt-2 pb-0.5 text-[10px] font-medium transition-colors duration-150',
                isActive ? 'text-accent-text' : 'text-muted',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon name={icon} size={25} stroke={isActive ? 2.1 : 1.6} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

/** Viert nieuwe badges en level-ups (één keer). */
function CelebrationWatcher() {
  const progress = useProgress()
  const busy = useRef(false)
  useEffect(() => {
    if (!progress || busy.current) return
    // Even wachten tot alle wijzigingen van één actie binnen zijn (bijv. dag + tricks opslaan)
    const timer = setTimeout(() => {
      busy.current = true
      void (async () => {
        const seen = await kvGet<string[] | null>('badgesSeen', null)
        const ids = progress.badges.map((b) => b.id)
        if (seen === null) {
          // eerste keer: niks vieren wat al bestond (bijv. na sync op nieuw apparaat)
          await kvSet('badgesSeen', ids)
          await kvSet('levelSeen', progress.level.level)
        } else {
          const fresh = progress.badges.filter((b) => !seen.includes(b.id))
          const lvl = await kvGet('levelSeen', 1)
          // Eén viering tegelijk: level-up gaat voor, meerdere badges worden samengevat
          if (progress.level.level > lvl) {
            celebrate(
              'level',
              `Level ${progress.level.level}: ${progress.level.name}`,
              fresh.length ? `+ ${fresh.length} nieuwe badge${fresh.length > 1 ? 's' : ''}` : 'Je bent een level omhoog!',
              'trophy',
            )
            await kvSet('levelSeen', progress.level.level)
          } else if (fresh.length === 1) {
            celebrate('badge', `${fresh[0].rare ? 'Zeldzame sticker' : 'Badge'}: ${fresh[0].name}`, fresh[0].desc, fresh[0].icon)
          } else if (fresh.length > 1) {
            celebrate('badge', `${fresh.length} nieuwe badges`, fresh.map((b) => b.name).join(', '), 'trophy')
          }
          if (fresh.length) await kvSet('badgesSeen', ids)
        }
        busy.current = false
      })()
    }, 700)
    return () => clearTimeout(timer)
  }, [progress])
  return null
}

function UpdateBanner() {
  const u = updateStore.use()
  if (!u.ready) return null
  return (
    <div className="pt-safe fixed inset-x-0 top-0 z-40 flex justify-center px-4">
      <button onClick={u.apply} className="pop-in mt-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink shadow-lg">
        Nieuwe versie klaar · tik om te updaten
      </button>
    </div>
  )
}

function Routed({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>
}

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <HashRouter>
      <ScrollTop />
      <UpdateBanner />
      <main className="min-h-dvh">
        <Routed>
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/log" element={<LogList />} />
              <Route path="/log/nieuw" element={<LogEditor />} />
              <Route path="/log/:id" element={<LogDetail />} />
              <Route path="/log/:id/bewerk" element={<LogEditor />} />
              <Route path="/tricks" element={<Tricks />} />
              <Route path="/tricks/:id" element={<TrickDetail />} />
              <Route path="/quiz" element={<Quiz />} />
              <Route path="/kluis" element={<Vault />} />
              <Route path="/crew" element={<Crew />} />
              <Route path="/coach" element={<Coach />} />
              <Route path="/meer" element={<More />} />
              <Route path="/stats" element={<Stats />} />
              <Route path="/badges" element={<Badges />} />
              <Route path="/doelen" element={<Goals />} />
              <Route path="/reizen" element={<Trips />} />
              <Route path="/reizen/crew/:id" element={<CrewTripDetail />} />
              <Route path="/reizen/:id" element={<TripDetail />} />
              <Route path="/weer" element={<Weather />} />
              <Route path="/gear" element={<GearPage />} />
              <Route path="/rider/:id" element={<Rider />} />
              <Route path="/snow/:id" element={<Snow />} />
              <Route path="/wrapped" element={<Wrapped />} />
              <Route path="/instellingen" element={<Settings />} />
              <Route path="/design" element={<DesignSystem />} />
              <Route path="*" element={<Home />} />
            </Routes>
          </Suspense>
        </Routed>
      </main>
      <TabBar />
      <Toasts />
      <CelebrationWatcher />
    </HashRouter>
  )
}
