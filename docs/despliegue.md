# Despliegue del backend (Render)

El backend de M9 está publicado en un servidor en la nube, así el frontend y los otros módulos lo pueden usar sin levantar nada en su compu.

- **Dirección:** https://m9-reservas.onrender.com
- **Salud:** https://m9-reservas.onrender.com/health
- **Documentación de la API:** https://m9-reservas.onrender.com/docs
- **Responsable:** Irina Medera

## Cómo funciona

Frontend (React) → backend en Render → base de datos en Supabase

El backend usa la misma base de Supabase que usamos todos. Nadie más necesita la clave de la base: queda guardada solo en Render.

## Configuración en Render

| Dato | Valor |
|---|---|
| Tipo de servicio | Web Service |
| Repositorio | FRRe-DS/2026-09-TPI (repositorio de la cátedra) |
| Rama | `main` |
| Entorno | Docker |
| Dockerfile | `./backend/Dockerfile` |
| Contexto de Docker | `.` (raíz del repo) |
| Plan | Free |

### Variables de entorno

Se cargan en Render → **Environment**. Nunca van en el repositorio (RNF-06).

| Variable | Valor |
|---|---|
| `DATABASE_URL` | Dirección de Supabase (Session pooler). **Secreta.** |
| `DB_SSL` | `true` |
| `CORS_ORIGIN` | `*` |
| `ANTICIPACION_MINIMA_MINUTOS` | `60` |
| `ANTICIPACION_MAXIMA_DIAS` | `30` |

`PORT` no hace falta: Render lo asigna y el backend lo lee solo.

## Cómo actualizarlo

El despliegue es **automático**. Cada vez que entra un cambio a `main`, el flujo de GitHub Actions
`.github/workflows/deploy-render.yml` llama al *deploy hook* de Render (guardado como secret
`RENDER_DEPLOY_HOOK` en el repositorio) y Render publica la nueva versión.

Para comprobarlo:

1. En GitHub → **Actions**, la ejecución **Deploy a Render** tiene que terminar en verde.
2. En dashboard.render.com → **m9-reservas** → **Deploys**, el último aparece con trigger *Deploy Hook* y estado **Live**.
3. Abrir `/health` y comprobar que diga `"baseDeDatos": "conectada"`.

Si el flujo de Actions falla, se puede publicar a mano desde Render: **Manual Deploy** → **Deploy latest commit**.

Si el deploy queda en **Failed**, abrir **Logs**: casi siempre es un error de compilación de TypeScript. Antes de combinar en `main`, conviene comprobar que `docker compose up --build` levante en la compu.

## Cómo se conecta el frontend

En `frontend/.env`:

```
VITE_API_URL=https://m9-reservas.onrender.com
VITE_USE_MOCK=false
```

## Limitaciones del plan gratuito

- Si nadie lo usa durante 15 minutos, se duerme. El primer pedido después tarda alrededor de un minuto; los siguientes andan normal.
- Antes de una demo, abrir `/health` unos minutos antes para despertarlo.
- Tiene 750 horas gratis por mes, que alcanzan para un servicio.

## Relación con la consigna

- **RNF-04 (contenedores):** el servidor usa el mismo `backend/Dockerfile` que usamos en local.
- **RNF-06 (configuración y secretos):** la clave de la base está en Render, no en el repo.
- **RNF-18 (portabilidad):** el mismo código corre en local con `docker compose up` y publicado en la nube, sin cambios.

Para la entrega igual se muestra el proyecto corriendo en local con `docker compose up --build`. El servidor sirve para que el frontend y los demás módulos lo usen sin depender de la compu de nadie.
