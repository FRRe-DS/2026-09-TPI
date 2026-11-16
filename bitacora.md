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
  - Rama: `devops/ci-sast`
  - Archivo agregado: `.github/workflows/ci-sast.yml`
  - PR / Issue: *[Pegar aquí el enlace al Issue/PR una vez publicado en GitHub]*
- **Evidencia (URL, captura o reporte):**
  - *[Pegar aquí el enlace a la ejecución en GitHub Actions y al artifact `semgrep-sast-report` tras el push]*
- **Resultado:** Pipeline complementario de SAST y validación de frontend configurado y listo para su ejecución en GitHub Actions mediante Pull Request.
- **Dificultad o bloqueo:** El repositorio ya contaba con pruebas de backend en `pruebas.yml`, pero no validaba el build/lint del frontend ni poseía escaneo SAST; se incorporaron en un workflow separado para evitar conflictos con el flujo actual del equipo de Desarrollo.
- **Siguiente acción:**
  1. Hacer push de `devops/ci-sast`, abrir el Pull Request hacia `main`, verificar la ejecución en verde y mergear.
  2. Acordar con Desarrollo las 3 métricas de negocio de M9 e implementar la instrumentación con OpenTelemetry + dashboard (Hito 2).
