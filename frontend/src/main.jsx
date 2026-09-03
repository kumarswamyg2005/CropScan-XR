import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { LanguageProvider } from './context/LanguageContext'
import './index.css'

/**
 * Evict anything a previous project left behind on this origin.
 *
 * A dev port is shared by every project you have ever run on it. A service
 * worker registered by one of them keeps serving ITS cached app from
 * localhost:5173 forever, so you load this project and get the old one --
 * and no amount of restarting the server fixes it, because the server is
 * never asked.
 *
 * Dev only. If this app ever ships a real service worker, production must not
 * unregister it.
 */
if (import.meta.env.DEV && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    if (registrations.length === 0) return
    console.warn(
      `[CropScan] removing ${registrations.length} stale service worker(s) on this origin`,
    )
    Promise.all(registrations.map((r) => r.unregister()))
      .then(() => (window.caches ? caches.keys() : Promise.resolve([])))
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      // The page was very likely served BY the worker being removed, so it has
      // to be fetched again to show this project rather than the old one.
      .then(() => window.location.reload())
      .catch(() => {})
  }).catch(() => {})
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <App />
      </LanguageProvider>
    </BrowserRouter>
  </React.StrictMode>
)
