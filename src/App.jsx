import { Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import { lazyWithReload } from './lib/lazyWithReload'
import Layout from './components/Layout'
import Loader from './components/Loader'
import PageGate from './components/PageGate'
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
// "לקוחות" (a never-finished Bambi CRM view) became טפסים; /clients redirects.
const FormsPage = lazyWithReload(() => import('./pages/FormsPage'))
const SignPage = lazyWithReload(() => import('./pages/SignPage'))
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
const TrainingPage = lazyWithReload(() => import('./pages/TrainingPage'))

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

          {/* A client signing a form — public, no login: the link's token is
              the permission, checked by the form-sign edge function. */}
          <Route path="/sign/:token" element={<SignPage />} />

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
            {/* Pages are wrapped in PageGate: who may open each is set in ניהול →
                עמודים והרשאות (lib/access.js), typed address or menu alike. */}
            {/* The opening screen is the calendar; the day-planner has its own
                address. /calendar survives for old links (and the global
                search's ?meeting= deep link), keeping its query string. */}
            <Route path="/" element={<AgentDashboard />} />
            <Route path="/today" element={<PageGate page="today"><TodayPage /></PageGate>} />
            <Route path="/calendar" element={<CalendarRedirect />} />
            <Route path="/claim-yard" element={<PageGate page="claim-yard"><ClaimYardPage /></PageGate>} />
            <Route path="/tasks" element={<PageGate page="tasks"><TasksPage /></PageGate>} />
            <Route path="/whatsapp" element={<PageGate page="whatsapp"><WhatsAppPage /></PageGate>} />
            <Route path="/forms" element={<PageGate page="clients"><FormsPage /></PageGate>} />
            <Route path="/clients" element={<Navigate to="/forms" replace />} />
            <Route path="/day-summary" element={<PageGate page="day-summary"><DaySummaryPage /></PageGate>} />
            <Route path="/agents-daily" element={<PageGate page="agents-daily"><AgentsDailyPage /></PageGate>} />
            <Route path="/info" element={<PageGate page="info"><InfoPage /></PageGate>} />
            <Route path="/speech" element={<PageGate page="speech"><SpeechPage /></PageGate>} />
            <Route path="/objections" element={<PageGate page="objections"><ObjectionsPage /></PageGate>} />
            <Route path="/training" element={<PageGate page="training"><TrainingPage /></PageGate>} />
            <Route path="/reports" element={<PageGate page="reports"><ReportsPage /></PageGate>} />
            <Route path="/manage" element={<ManagePage />} />
            <Route path="/assistant" element={<PageGate page="assistant"><AssistantPage /></PageGate>} />
            <Route path="/leads" element={<PageGate page="leads"><LeadsPage /></PageGate>} />
            <Route path="/leads/:id" element={<PageGate page="leads"><LeadProfilePage /></PageGate>} />
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
