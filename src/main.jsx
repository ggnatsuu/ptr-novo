import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './styles/style.css'
import './styles/navbar.css'
import './styles/perfil.css'
import './styles/home.css'
import './styles/agenda.css'
import './styles/jornal.css'
import './styles/login.css'
import './styles/rankGeral.css'
import './styles/sorteio.css'
import './styles/teamTrials.css'
import './styles/buscadorPistas.css'
import './styles/regulamento.css'
import './styles/responsive.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)