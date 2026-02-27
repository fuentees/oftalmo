import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

const clearLegacyBrowserCaches = async () => {
  try {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((registration) => registration.unregister()))
    }
  } catch {
    // Cleanup best effort only.
  }

  try {
    if (typeof window !== 'undefined' && 'caches' in window) {
      const cacheKeys = await caches.keys()
      await Promise.all(cacheKeys.map((key) => caches.delete(key)))
    }
  } catch {
    // Cleanup best effort only.
  }
}

clearLegacyBrowserCaches()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
