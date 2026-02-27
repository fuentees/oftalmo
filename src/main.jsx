import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

const HARD_REFRESH_PARAM = '__app_hard_refresh'

const runOneTimeHardRefresh = () => {
  if (typeof window === 'undefined') return false
  const url = new URL(window.location.href)
  if (url.searchParams.get(HARD_REFRESH_PARAM) === '1') {
    url.searchParams.delete(HARD_REFRESH_PARAM)
    const nextSearch = url.searchParams.toString()
    const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ''}${url.hash}`
    window.history.replaceState({}, '', nextUrl)
    return false
  }
  url.searchParams.set(HARD_REFRESH_PARAM, '1')
  window.location.replace(url.toString())
  return true
}

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

if (!runOneTimeHardRefresh()) {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <App />
  )
}
