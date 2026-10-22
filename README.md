# M9 — Reservas de Viajes

**Trabajo Práctico Integrador — Desarrollo de Software 2026**  
**Grupo 9**

## Descripción

El Módulo 9 (M9) forma parte de una plataforma de movilidad urbana y se encarga de gestionar reservas anticipadas de viajes en auto o moto.

Permite programar viajes para una fecha y hora determinadas, administrar las reservas y coordinar su activación con el módulo de despacho.

El sistema cuenta con una API REST, una base de datos propia y mecanismos de integración con los demás módulos de la plataforma.

## Integrantes — Grupo 9

- Marco Maiocchi
- Ramiro Escobar
- Valentina Maciel
- Mariano Del Valle
- Irina Medera
- Bianca Gómez Báez
- Valentino Cabás
- Oriana Aguilar
- Lara Wolman

## Funcionalidades

| Requerimiento | Descripción |
|---|---|
| RF-9.1 | Crear reservas indicando origen, destino, tipo de vehículo, fecha, hora y zona horaria. |
| RF-9.2 | Validar la anticipación mínima y máxima permitida. |
| RF-9.3 | Validar los datos de la reserva y la habilitación del cliente. |
| RF-9.5 | Gestionar la confirmación de reservas. |
| RF-9.6 | Modificar y reprogramar reservas según las condiciones permitidas. |
| RF-9.7 | Cancelar reservas y registrar el motivo. |
| RF-9.9 | Activar reservas mediante el servicio de despacho. |
| RF-9.10 | Evitar activaciones duplicadas mediante controles de concurrencia e idempotencia. |
| RF-9.12 | Mantener un historial de cambios y transiciones de estado. |

## Tecnologías

| Tecnología | Uso |
|---|---|
| Node.js y TypeScript | Desarrollo del backend |
| Express | API REST |
| React y Vite | Frontend |
| PostgreSQL | Base de datos |
| Supabase | Servicio de base de datos |
| Docker y Docker Compose | Ejecución en contenedores |
| Vitest y Supertest | Pruebas automatizadas |
| OpenAPI | Documentación de la API |
| Git y GitHub | Control de versiones |

## Arquitectura

El backend se organiza en capas para separar las responsabilidades del sistema:

- **Rutas y middlewares:** recepción de solicitudes HTTP, manejo de errores y trazabilidad mediante `X-Request-Id`.
- **Controladores:** procesamiento de solicitudes y generación de respuestas.
- **Servicios:** validaciones, reglas de negocio y comunicación con otros módulos.
- **Repositorios:** acceso y persistencia de datos en PostgreSQL.

### Integración con otros módulos

| Módulo | Integración |
|---|---|
| M1 — Identidad y Acceso | Autenticación y autorización. |
| M2 — Clientes | Validación de la existencia y habilitación del cliente. |
| M4 — Ubicación y Disponibilidad | Validación de ubicaciones, distancia y tiempo estimado. |
| M5 — Solicitud y Despacho | Activación de reservas y solicitud de vehículos. |
| M7 — Tarifas, Pagos y Liquidaciones | Consulta de tarifas estimadas. |
| M8 — Notificaciones, Documentos y Soporte | Comunicación de eventos relacionados con las reservas. |

Las integraciones utilizan solicitudes HTTP y eventos asíncronos, según la operación.

## Base de datos

El módulo utiliza PostgreSQL y dispone de dos tablas principales:

- **`reserva`:** almacena los datos del viaje programado, el cliente, las ubicaciones, la fecha y hora, el tipo de vehículo y el estado.
- **`historial_reserva`:** registra las modificaciones y transiciones de estado, incluyendo el tipo de cambio, los valores modificados, el actor y la fecha.

Las ubicaciones de origen y destino se almacenan en formato `JSONB`. El modelo contempla identificadores UUID, restricciones de integridad y claves de idempotencia.

## Estructura del proyecto

```text
2026-09-TPI/
├── api/
├── backend/
├── db/
├── docs/
├── frontend/
├── .env.example
├── docker-compose.yml
└── README.md
```

## Instalación y ejecución

### Requisitos

- Node.js y npm.
- Docker y Docker Compose.
- PostgreSQL y los datos de conexión correspondientes.

### Configuración

Crear un archivo `.env` a partir de `.env.example` y completar las variables de entorno necesarias.

El archivo `.env` no debe incorporarse al repositorio.

### Ejecutar el backend

Desde la raíz del proyecto:

```bash
cd backend
npm install
npm run dev
```

El backend utiliza el puerto `3000` por defecto.

### Ejecutar con Docker

Desde la raíz del proyecto:

```bash
docker compose up --build
```

## API REST

Las rutas contempladas para la gestión de reservas son:

| Método | Endpoint | Descripción |
|---|---|---|
| POST | `/reservas` | Crear una reserva. |
| GET | `/reservas/{id}` | Consultar una reserva por su identificador. |
| GET | `/reservas?clienteId={clienteId}` | Consultar las reservas de un cliente. |
| PATCH | `/reservas/{id}` | Modificar o reprogramar una reserva. |
| POST | `/reservas/{id}/cancelar` | Cancelar una reserva. |
| POST | `/reservas/{id}/activar` | Activar una reserva. |
| GET | `/reservas/{id}/historial` | Consultar el historial de una reserva. |
| GET | `/health` | Consultar el estado del servicio. |

La especificación de parámetros, esquemas, respuestas y códigos de error se encuentra en `api/openapi.yaml`.

## Pruebas

El backend utiliza Vitest y Supertest para las pruebas automatizadas.

Para ejecutarlas:

```bash
cd backend
npm test
```

Las pruebas requieren la configuración del entorno y de los servicios correspondientes.

## Documentación

| Archivo | Contenido |
|---|---|
| `docs/decisiones.md` | Justificación de las tecnologías seleccionadas. |
| `docs/arquitectura/` | Diagramas de contexto, capas y secuencia. |
| `api/openapi.yaml` | Contrato de la API REST. |
| `docs/catalogo-eventos.md` | Eventos e integraciones entre módulos. |
| `db/` | Esquema y archivos de base de datos. |

## Control de versiones

El proyecto utiliza Git y GitHub para el control de versiones y el trabajo colaborativo. El código se encuentra en el repositorio del Grupo 9 de la organización FRRe-DS.

## Organización del trabajo por bloques

Para organizar el desarrollo del Módulo 9, el equipo se dividió en cuatro bloques de trabajo, distribuyendo las responsabilidades entre los integrantes.

### Bloque 1 — Análisis y documentación inicial

**Integrantes:**
- Marco Maiocchi
- Ramiro Escobar

**Responsabilidades:**
- Análisis de los requerimientos del módulo.
- Definición de las funcionalidades de reservas anticipadas.
- Documentación general del proyecto y decisiones técnicas.
- Organización de los contratos e integraciones con otros módulos.

### Bloque 2 — Backend y lógica de negocio

**Integrantes:**
- Valentina Maciel
- Mariano Del Valle

**Responsabilidades:**
- Desarrollo de los servicios y endpoints de la API REST.
- Implementación de las validaciones y reglas de negocio.
- Gestión de los estados de las reservas.
- Comunicación entre el backend y la base de datos.

### Bloque 3 — Base de datos e integraciones

**Integrantes:**
- Irina Medera
- Bianca Gómez Báez
- Valentino Cabás
- Oriana Aguilar

**Responsabilidades:**
- Diseño y configuración de la base de datos.
- Persistencia de reservas e historial de cambios.
- Desarrollo de las integraciones y simulaciones de otros módulos.
- Pruebas de funcionamiento y manejo de errores.

### Bloque 4 — Frontend e interfaz de usuario

**Integrante:**
- Lara Wolman

**Responsabilidades:**
- Desarrollo de la interfaz web con React.
- Implementación del formulario de reservas.
- Visualización y gestión de las reservas.
- Conexión de la interfaz con los endpoints del backend.
