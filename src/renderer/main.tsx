import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

// Errors in the overlay: offer to report them (the main process decides how often).
window.addEventListener('error', (e) => {
  // Harmless browser warnings, not bugs.
  if (/ResizeObserver loop|^Script error/i.test(e.message || '')) return
  try { window.clod.rendererProblem(`Window error: ${e.message}`, true) } catch {}
})
window.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason instanceof Error ? e.reason.message : String(e.reason)
  try { window.clod.rendererProblem(`Unhandled: ${reason}`, false) } catch {}
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
)
