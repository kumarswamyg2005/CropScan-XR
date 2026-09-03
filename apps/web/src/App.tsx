import { Suspense, lazy } from 'react'
import { Route, Routes } from 'react-router-dom'

import Nav from './components/Nav'
import { Loading, NotFound } from './components/Status'
import AboutPage from './pages/AboutPage'
import DiseaseDetailPage from './pages/DiseaseDetailPage'
import DiseasesPage from './pages/DiseasesPage'
import Landing from './pages/Landing'
import LedgerPage from './pages/LedgerPage'
import OrderPage from './pages/OrderPage'
import ResultPage from './pages/ResultPage'
import ScanPage from './pages/ScanPage'
import { useLang } from './lib/lang'

// The one lazy route. three.js, @react-three/* and the XR scenes live behind
// this import so the landing page never downloads them (PRD 8, issue #33).
const FieldPage = lazy(() => import('./pages/FieldPage'))

export default function App() {
  const { t } = useLang()

  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-sheet focus:px-3 focus:py-2 focus:border focus:border-ink"
      >
        {t('skipToContent')}
      </a>
      <Nav />
      <main id="main" className="mx-auto w-full max-w-5xl px-4 pb-24 sm:px-6">
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/scan" element={<ScanPage />} />
            <Route path="/scan/:id" element={<ResultPage />} />
            <Route path="/diseases" element={<DiseasesPage />} />
            <Route path="/diseases/:id" element={<DiseaseDetailPage />} />
            <Route path="/field" element={<FieldPage />} />
            <Route path="/ledger" element={<LedgerPage />} />
            <Route path="/orders/:id" element={<OrderPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
    </>
  )
}
