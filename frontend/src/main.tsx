import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { iniciarSesion } from './auth/sesion'

const raiz = createRoot(document.getElementById('root')!)

// La app se muestra recién cuando el usuario ingresó con Keycloak
iniciarSesion()
  .then(() => {
    raiz.render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
  .catch(() => {
    raiz.render(
      <p className="mensaje error" role="alert">
        No se pudo conectar con el servicio de ingreso. Probá de nuevo en unos minutos.
      </p>,
    )
  })
