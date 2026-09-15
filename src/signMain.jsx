// The signing page on its own — the entry behind sign.html.
//
// A client's link must not be a door into the meetings app: no login screen one
// click away, and none of its code shipped to a stranger's phone. So the page a
// client opens is a separate build with one route. Anything else on this page's
// domain goes to the college's website (vercel.json redirects it; this is the
// same rule for a path the redirect didn't catch).
import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import SignPage from './pages/SignPage.jsx'
import './index.css'

const COLLEGE_SITE = 'https://www.res-nadlan.co.il'

function Elsewhere() {
  useEffect(() => {
    window.location.replace(COLLEGE_SITE)
  }, [])
  return null
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/sign/:token" element={<SignPage />} />
        <Route path="*" element={<Elsewhere />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
