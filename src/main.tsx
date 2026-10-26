import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App'
import { applyTheme, settingsStore } from './lib/settings'
import { initAuth } from './lib/auth'
import { setStatsProvider, startSync } from './lib/sync'
import { crewStats } from './lib/useProgress'
import { requestPersistentStorage } from './lib/db'
import { unlockAudio } from './lib/sounds'
import { registerServiceWorker } from './lib/pwa'

applyTheme(settingsStore.get().theme)
unlockAudio()
void requestPersistentStorage()
setStatsProvider(crewStats)
void initAuth().then(startSync)
registerServiceWorker()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
