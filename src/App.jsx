import { Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import { lazyWithReload } from './lib/lazyWithReload'
import Layout from './components/Layout'
import Loader from './components/Loader'
import LoginPage from './pages/LoginPage'
import AgentDashboard from './pages/AgentDashboard'

// Every page except the dashboard is code-split: it downloads only when first
// visited. Keeps the initial bundle small — the difference between a snappy and
// a sluggish first load on the weak office machines.
const ReportsPage = lazyWithReload(() => import('./pages/ReportsPage'))
const AdminDashboard = lazyWithReload(() => import('./pages/AdminDashboard'))
const ClaimYardPage = lazyWithReload(() => import('./pages/ClaimYardPage'))
const TasksPage = lazyWithReload(() => import('./pages/TasksPage'))
const WhatsAppPage = lazyWithReload(() => import('./pages/WhatsAppPage'))
const ClientsPage = lazyWithReload(() => import('./pages/ClientsPage'))
const DaySummaryPage = lazyWithReload(() => import('./pages/DaySummaryPage'))
const AgentsDailyPage = lazyWithReload(() => import('./pages/AgentsDailyPage'))
const InfoPage = lazyWithReload(() => import('./pages/InfoPage'))
const SpeechPage = lazyWithReload(() => import('./pages/SpeechPage'))
const ManagePage = lazyWithReload(() => import('./pages/ManagePage'))
const AssistantPage = lazyWithReload(() => import('./pages/AssistantPage'))
const LeadsPage = lazyWithReload(() => import('./pages/LeadsPage'))
const TodayPage = lazyWithReload(() => import('./pages/TodayPage'))
const LeadProfilePage = lazyWithReload(() => import('./pages/LeadProfilePage'))
const ObjectionsPage = lazyWithReload(() => import('./pages/ObjectionsPage'))
const TVPage = lazyWithReload(() => import('./pages/TVPage'))

/** Old calendar links redirect home WITH their query — ?meeting= must survive. */
function CalendarRedirect() {
  const { search } = useLocation()
  return <Navigate to={{ pathname: '/', search }} replace />
}

function PageFallback() {
  return (
    <div className="flex justify-center py-16">
      <Loader label="טוען…" size="lg" />
    </div>
  )
}

export default function App() {
  // There is deliberately no opening splash. It used to hold every new tab for
  // 2.35s whether or not anything was loading; the same mark now animates only
  // while something is genuinely being fetched (see components/Loader).
  return (
    <>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* Office wall-board — full screen, no sidebar, no agent picker.
              Signed in is enough; a TV shouldn't need a name chosen. */}
          <Route
            path="/tv"
            element={
              <ProtectedRoute>
                <TVPage />
              </ProtectedRoute>
            }
          />

          {/* Authenticated area shares the header/layout */}
          <Route
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            {/* The opening screen is the calendar; the day-planner has its own
                address. /calendar survives for old links (and the global
                search's ?meeting= deep link), keeping its query string. */}
            <Route path="/" element={<AgentDashboard />} />
            <Route path="/today" element={<TodayPage />} />
            <Route path="/calendar" element={<CalendarRedirect />} />
            <Route path="/claim-yard" element={<ClaimYardPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/whatsapp" element={<WhatsAppPage />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/day-summary" element={<DaySummaryPage />} />
            <Route path="/agents-daily" element={<AgentsDailyPage />} />
            <Route path="/info" element={<InfoPage />} />
            <Route path="/speech" element={<SpeechPage />} />
            <Route path="/objections" element={<ObjectionsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/manage" element={<ManagePage />} />
            <Route path="/assistant" element={<AssistantPage />} />
            <Route path="/leads" element={<LeadsPage />} />
            <Route path="/leads/:id" element={<LeadProfilePage />} />
          </Route>

          {/* Admin-only */}
          <Route
            element={
              <ProtectedRoute requireAdmin>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route path="/admin" element={<AdminDashboard />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  )
}
