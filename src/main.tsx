import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initializeAnalytics } from './analytics'
import './styles.css'

initializeAnalytics(import.meta.env.VITE_GA_MEASUREMENT_ID ?? 'G-XTHQXRD7RD', import.meta.env.PROD)

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
