import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App'
import { readStoredTheme } from './store/useStore'
import './styles.css'

// До первой отрисовки, чтобы страница не моргала светлой темой.
document.documentElement.dataset.theme = readStoredTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
