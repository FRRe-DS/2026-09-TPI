# Bitácora DevOps — Módulo 9 (M9: Reservas de Viajes - Grupo 9)

- **Asignaturas:** DevOps (Cultura, Herramientas y Procesos) & Desarrollo de Software — UTN FRRe 2026
- **Módulo asignado:** M9 — Reservas de Viajes
- **Equipo DevOps:** Grupo 03
- **Equipo Desarrollo de Software:** Grupo 9
- **Repositorio:** https://github.com/FRRe-DS/2026-09-TPI

---

## Registro Cronológico

### Entrada 1 — Semana del 11/11/2026 (Hito 1 y avance de Hito 2: Diagnóstico y ampliación de CI + SAST)

- **Fecha:** Semana del 11/11/2026
- **Responsable/s:** Equipo DevOps (Grupo 03)
- **Módulo:** M9 — Reservas de Viajes
- **Objetivo:** Relevar el estado actual del repositorio (código, base de datos, frontend y workflows existentes) y completar el pipeline de Integración Continua (CI) con análisis estático de seguridad (SAST) y verificación del frontend.
- **Tarea ejecutada:**
  1. **Relevamiento del código y workflows existentes:** Se analizó el repositorio, que cuenta con `backend/` (Node.js 24 + TypeScript + Express + PostgreSQL + Vitest/Supertest), `frontend/` (React + Vite + TypeScript + ESLint), `db/` (`schema.sql`, `seed.sql` y migraciones) y `docker-compose.yml`. Se verificó que ya existían `.github/workflows/pruebas.yml` (compilación y tests con cobertura mínima del 90% sobre `postgres:16-alpine`) y `.github/workflows/deploy-render.yml`, pero faltaban análisis estático de seguridad (SAST), validación CI del `frontend/`, instrumentación OpenTelemetry y pruebas de carga k6.
  2. **Ampliación de CI con SAST y Frontend:** Se creó la rama `devops/ci-sast` y se agregó `.github/workflows/ci-sast.yml` (sin alterar los workflows existentes) con disparo en `pull_request` hacia `main` y `push` a `main` y `devops/**`, incorporando dos jobs:
     - `frontend-build-lint`: instala dependencias en `frontend/`, ejecuta `npm run lint` y verifica la compilación con `npm run build`.
     - `sast`: ejecuta **Semgrep** sobre todo el repositorio con los rulesets `p/typescript`, `p/nodejs`, `p/react` y `p/secrets`, exporta `semgrep-report.json` como artifact para trazabilidad y aplica un Quality Gate que falla ante hallazgos de severidad `ERROR`.
- **Decisiones / acuerdos con Desarrollo:**
  - Mantener intactos `.github/workflows/pruebas.yml` y `.github/workflows/deploy-render.yml` del equipo de Desarrollo, sumando el nuevo workflow complementario mediante Pull Request.
  - Utilizar Semgrep en GitHub Actions como herramienta SAST para no requerir configuraciones externas ni cuentas adicionales sobre el repositorio.
  - Acordar como criterio de aceptación (Quality Gate) que ningún PR se mergee si falla `pruebas.yml`, `frontend-build-lint` o si Semgrep detecta hallazgos de severidad `ERROR`.
- **Repositorio / Issue / PR:**
  - Rama: `devops/ci-sast` (mergeada en `main`)
  - Archivo agregado: `.github/workflows/ci-sast.yml`
  - PR / Issue: https://github.com/FRRe-DS/2026-09-TPI/pull/5
- **Evidencia (URL, captura o reporte):**
  - PR #5 con los 5 checks en verde (`Pruebas`, `Frontend Lint & Build` y `SAST Security Scan (Semgrep)`).
- **Resultado:** Pipeline complementario de SAST y validación de frontend ejecutado con éxito y mergeado a `main`.
- **Dificultad o bloqueo:** El repositorio ya contaba con pruebas de backend en `pruebas.yml`, pero no validaba el build/lint del frontend ni poseía escaneo SAST; se incorporaron en un workflow separado para evitar conflictos con el flujo actual del equipo de Desarrollo.
- **Siguiente acción:**
  1. Acordar con Desarrollo las 3 métricas de negocio de M9 y avanzar con pruebas locales de k6 en Docker.

---

### Entrada 2 — 16/11/2026 (Hito 1 y avance de Hito 3: Propuesta de métricas y pruebas locales de k6 en Docker)

- **Fecha:** 16/11/2026
- **Responsable/s:** Equipo DevOps (Grupo 03)
- **Módulo:** M9 — Reservas de Viajes
- **Objetivo:** Formalizar la propuesta de métricas y flujo de carga para acordar con Desarrollo, e implementar y validar el entorno local de pruebas de carga con Grafana k6 en Docker.
- **Tarea ejecutada:**
  1. **Propuesta de métricas y escenario de carga:** Se elaboró el documento `Propuesta_Metricas_M9_DevOps.pdf` detallando las 3 métricas de negocio propuestas para M9, los indicadores técnicos complementarios y el flujo de 4 pasos para k6.
  2. **Entorno local de Grafana k6 en Docker:** Se creó la rama `devops/k6-local` incorporando:
     - `k6/reservas-load.js`: script de carga con generación de UUID v4 para `claveIdempotencia` que ejecuta el flujo completo (`GET /health` → `POST /reservas` → `GET /reservas/:id` → `POST /reservas/:id/cancelar`).
     - `docker-compose.k6.yml`: orquesta `db-k6` (PostgreSQL 16 con `db/schema.sql`), `api-k6` (backend con stubs internos) y `grafana/k6`.
  3. **Prueba de humo local (10 VUs · 15s):** Se ejecutó `docker compose -f docker-compose.k6.yml --profile run run --rm k6` obteniendo **1210/1210 checks exitosos (100%)**, **0.00% de errores** sobre 968 requests (`62.27 req/s`), latencia promedio de `32.08 ms` y `p95 = 110.27 ms`.
- **Decisiones / acuerdos con Desarrollo:**
  - Enviar el documento de métricas al equipo de Desarrollo para su validación antes de instrumentar OpenTelemetry.
  - Aprovechar los stubs internos del backend (`backend/src/stubs/`) para aislar el rendimiento de M9 sin depender de módulos externos en esta etapa.
- **Repositorio / Issue / PR:**
  - Rama: `devops/k6-local`
  - Archivos agregados: `k6/reservas-load.js`, `docker-compose.k6.yml`
  - PR / Issue: *[Pendiente: abrir PR hacia `main` y completar enlace]*
- **Evidencia (URL, captura o reporte):**
  - Salida local de Grafana k6 (10 VUs, 15s): `1210/1210` checks OK, `0.00%` `http_req_failed`, `62.27 req/s`, `avg=32.08ms`, `p95=110.27ms`.
- **Resultado:** Entorno local de k6 en Docker operativo y verificado al 100% sobre la API de M9.
- **Dificultad o bloqueo:** La primera corrida falló con `400 CLAVE_IDEMPOTENCIA_INVALIDA` porque el backend valida formato UUID estricto en `claveIdempotencia`; se resolvió incorporando un generador de UUID v4 en `k6/reservas-load.js`.
- **Siguiente acción:**
  1. Confirmar las 3 métricas con el equipo de Desarrollo.
  2. Instrumentar OpenTelemetry + dashboard en plataforma APM (Hito 2) y preparar el despliegue cloud para los escenarios de 50, 100, 500 y 1000 VUs (Hito 3).

---

### Entrada 3 — 20/11/2026 (Hito 3: Corridas locales de carga con Grafana k6 a 50, 100 y 500 VUs)

- **Fecha:** 20/11/2026
- **Responsable/s:** Equipo DevOps (Grupo 03)
- **Módulo:** M9 — Reservas de Viajes
- **Objetivo:** Ejecutar pruebas de carga progresivas en entorno Docker local (50, 100 y 500 VUs, 20s c/u) para observar el comportamiento de latencia, throughput y punto de saturación antes del despliegue cloud.
- **Tarea ejecutada:**
  - Se levantó el stack completo (`db-k6`, `api-k6`) mediante `docker-compose.k6.yml` y se ejecutaron tres corridas consecutivas con `grafana/k6:latest`:
    - **50 VUs (20s):** `4776` requests (`231.64 req/s`), `0.00%` errores, `100%` checks (`5970/5970`), `avg = 87.47 ms`, `p95 = 260.08 ms`, `max = 1.28 s`.
    - **100 VUs (20s):** `5644` requests (`268.90 req/s`), `0.00%` errores, `100%` checks (`7055/7055`), `avg = 238.02 ms`, `p95 = 490.35 ms`, `max = 946.28 ms`.
    - **500 VUs (20s):** `7440` requests (`324.85 req/s`), `0.00%` errores, `100%` checks (`9300/9300`), `avg = 1.32 s`, `p95 = 3.20 s`, `max = 5.30 s` (se cruzó el umbral `p95 < 2000 ms`).
- **Decisiones / acuerdos con Desarrollo:**
  - Documentar los resultados comparativos en `Resultados_k6_Local_M9_DevOps.pdf` para compartir con Desarrollo.
- **Repositorio / Issue / PR:**
  - Rama: `devops/k6-local`
- **Evidencia (URL, captura o reporte):**
  - Reporte comparativo local: `Resultados_k6_Local_M9_DevOps.pdf`.
- **Resultado:** El servicio soportó hasta 500 VUs sin errores HTTP (`0.00%`), observándose degradación de latencia en `500 VUs` (`p95 = 3.20 s`).
- **Dificultad o bloqueo:** Ninguna en la ejecución local; queda pendiente la ejecución en entorno cloud incluyendo el escenario de 1000 VUs (sin apuntar a la instancia gratuita de Supabase).
- **Siguiente acción:**
  1. Cerrar acuerdo de métricas con Desarrollo, instrumentar OpenTelemetry y ejecutar los 4 escenarios (50, 100, 500, 1000 VUs) en cloud.

---

### Entrada 4 — 20/11/2026 (Hito 2: Instrumentación OpenTelemetry y Dashboard en Grafana)

- **Fecha:** 20/11/2026
- **Responsable/s:** Equipo DevOps (Grupo 03)
- **Módulo:** M9 — Reservas de Viajes
- **Objetivo:** Instrumentar el backend con OpenTelemetry (trazas y las 3 métricas propias de M9), configurar la exportación OTLP hacia Grafana y dejar el dashboard versionado para monitoreo local y en cloud.
- **Tarea ejecutada:**
  1. **SDK OpenTelemetry y auto-instrumentación:** Se agregaron `backend/src/telemetry/sdk.ts` y `backend/src/telemetry/metrics.ts`, inicializando `@opentelemetry/sdk-node` al arranque (`backend/src/index.ts`) con exportación OTLP/HTTP, auto-instrumentación para Express, PostgreSQL (`pg`) y HTTP, y correlación de `X-Request-Id` en `backend/src/middlewares/requestId.ts` (`http.request_id`).
  2. **Tres métricas de negocio de M9:** Se instrumentaron en `crearReserva.service.ts`, `activarReserva.service.ts` y `modificarCancelar.service.ts`:
     - `reservas_creadas_total` (`creada` / `pendiente`, por `tipoVehiculo`).
     - `reservas_activaciones_total` y `reservas_activacion_duracion_ms`.
     - `reservas_cancelaciones_total` y `reservas_modificaciones_total`.
  3. **Stack local y Dashboard:** Se agregaron `docker-compose.otel.yml` (`grafana/otel-lgtm` + PostgreSQL + backend) y `observability/m9-dashboard.json`, y se validó la compilación TypeScript (`npm run build` exitoso).
- **Decisiones / acuerdos con Desarrollo:**
  - Desactivar OpenTelemetry automáticamente durante Vitest (`NODE_ENV === 'test'` o `VITEST`) para no interferir con la suite de pruebas existente.
  - Usar variables estándar OTLP (`OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_HEADERS`) para apuntar fácilmente a Grafana Cloud en el despliegue.
- **Repositorio / Issue / PR:**
  - Rama: `devops/opentelemetry`
  - Archivos agregados/modificados: `backend/src/telemetry/sdk.ts`, `backend/src/telemetry/metrics.ts`, `backend/src/index.ts`, `backend/src/middlewares/requestId.ts`, `backend/src/services/crearReserva.service.ts`, `backend/src/services/activarReserva.service.ts`, `backend/src/services/modificarCancelar.service.ts`, `docker-compose.otel.yml`, `observability/m9-dashboard.json`, `backend/package.json`, `backend/package-lock.json`.
  - PR / Issue: *[Pendiente: abrir PR hacia `main` y completar enlace]*
- **Evidencia (URL, captura o reporte):**
  - Compilación TypeScript (`npm run build`) en verde y dashboard versionado en `observability/m9-dashboard.json`.
- **Resultado:** Backend instrumentado con OpenTelemetry y dashboard listo para operar tanto en local (`docker-compose.otel.yml`) como en Grafana Cloud.
- **Dificultad o bloqueo:** Ninguna en la compilación; queda pendiente el despliegue en entorno cloud conectado a Grafana Cloud y las corridas finales de k6 (50, 100, 500 y 1000 VUs).
- **Siguiente acción:**
  1. Abrir el PR de `devops/opentelemetry` hacia `main` y validarlo con Desarrollo.
  2. Desplegar el servicio en entorno cloud conectado a Grafana Cloud y ejecutar la batería final de k6 (50, 100, 500 y 1000 VUs).
