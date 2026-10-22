# Arquitectura y Diseño del Módulo 9 (Reservas de Viajes)

**Trabajo Práctico Integrador — Desarrollo de Software 2026**  
**Grupo 9 — Módulo 9: Reservas de Viajes**

En este documento se presenta el diseño arquitectónico del Módulo 9 tanto en su relación con los demás servicios de la plataforma (diagrama de contexto) como en su organización interna por capas y el comportamiento detallado de sus operaciones principales mediante diagramas de secuencia.

En la carpeta `docs/arquitectura/` se encuentran las imágenes en formato `.png` de cada uno de los diagramas que se describen a continuación, junto con el archivo editable `diagramas_arquitectura_m9.drawio` (con los 5 diagramas en pestañas separadas listos para abrir y editar en [draw.io / diagrams.net](https://app.diagrams.net/)).

## 1. Diagrama de Contexto e Integración entre Módulos

El Módulo 9 actúa como el servicio encargado de administrar las reservas programadas para fechas y horarios futuros. Para cumplir con la separación de responsabilidades (**RNF-02**) y la propiedad exclusiva de los datos (**RNF-05**), nuestro módulo guarda únicamente la información de las reservas y su historial, colaborando con otros seis módulos de la plataforma a través de dos mecanismos bien diferenciados.

Por un lado, utiliza *comunicación síncrona mediante API REST* cuando necesita un dato indispensable para continuar con una operación. Esto ocurre:
- Al validar quién realiza la petición con *M1 (Identidad y Acceso)*
- Al verificar que el cliente esté habilitado y sin bloqueos en *M2 (Clientes)*
- Al comprobar que el origen y el destino estén dentro de la zona de cobertura y obtener la distancia y tiempo estimado con *M4 (Ubicación y Disponibilidad)*
- Al pedir el monto de la tarifa estimada a *M7 (Tarifas, Pagos y Liquidaciones)* 
- Al ordenar la creación de la solicitud de viaje en *M5 (Solicitud y Despacho)* cuando llega la hora de activar la reserva.

Por otro lado, emplea *comunicación asíncrona mediante eventos* cuando necesita informar un suceso sin quedarse esperar una respuesta inmediata. De esta manera, M9 emite avisos hacia *M8 (Notificaciones, Documentos y Soporte)* cada vez que una reserva cambia de estado, y recibe desde *M5* el aviso en caso de que la solicitud activada haya expirado por falta de conductores disponibles (`SIN_CONDUCTOR`).

## 2. Diagrama de Capas del Servicio (Backend M9)

Hacia el interior del servicio, el código del backend (`backend/src/`) sigue la arquitectura en capas vista en clase para separar las responsabilidades y facilitar el mantenimiento.

En el nivel superior se encuentran las *Rutas y Middlewares* (`src/routes/` y `src/middlewares/`), que reciben las peticiones HTTP desde el frontend en React con Leaflet, desde Swagger UI (`/docs`) o desde otros módulos, asignan el identificador de correlación `X-Request-Id` (**RNF-14**) y capturan cualquier excepción para devolver siempre un formato de error uniforme (`{ codigo, mensaje, detalle }`). A continuación, los *Controladores* (`src/controllers/`) extraen los datos de la petición (`crearConsultar.controller.ts`, `modificarCancelar.controller.ts` y `activar.controller.ts`) y delegan el procesamiento a la capa correspondiente sin mezclar lógica de negocio ni consultas SQL.

En el centro de la arquitectura se ubica la *Capa de Servicios* (`src/services/`), donde residen todas las reglas de negocio del Módulo 9 organizadas por caso de uso: la creación e idempotencia (`crearReserva.service.ts`), el paso de pendiente a confirmada (`confirmarReserva.service.ts`), la reprogramación, cancelación y consulta de historial (`modificarCancelar.service.ts`), la activación única hacia despacho (`activarReserva.service.ts`) y los servicios de apoyo para validar la ventana de anticipación y reglas de dominio (`reserva.validaciones.ts`), geocodificar direcciones (`geocodificacion.service.ts`) y calcular distancias (`calculoDistancia.service.ts`). Esta capa se apoya en los clientes o *stubs* inter-módulos (`src/stubs/`) para interactuar con **M2, M4, M5 y M7**. Finalmente, la **Capa de Repositorios** (`src/repositories/`) concentra todas las consultas SQL y el manejo de transacciones mediante el paquete `pg` (`reserva.repository.ts` e `historial.repository.ts`), comunicándose con la base de datos *PostgreSQL alojada en Supabase* (o con el contenedor `db-test` al ejecutar las pruebas automatizadas).

## 3. Diagramas de Secuencia de los Flujos Principales

### 3.1. Crear y Confirmar una Reserva (`POST /reservas`)

Cuando un cliente solicita programar un viaje futuro (**RF-9.1**), envía los datos del traslado junto con una `claveIdempotencia` en formato UUID. El servicio `crearReserva.service.ts` verifica primero en la base de datos si esa clave ya fue procesada previamente: si existe con los mismos datos devuelve la reserva ya creada (`200 OK`), y si fue usada con datos distintos rechaza el pedido (`409 Conflict`).

Si es una solicitud nueva, el servicio comprueba mediante `reserva.validaciones.ts` que la fecha solicitada sea futura y se encuentre dentro de la ventana de anticipación configurada en el archivo `.env` (entre 60 minutos y 30 días, según **RF-9.2**). Superado ese control, valida con *M2* que el cliente esté habilitado (**RF-9.3**), resuelve las coordenadas si el origen o el destino fueron enviados como texto (`geocodificacion.service.ts`), consulta a *M4* que ambos puntos sean distintos y estén dentro de la zona de cobertura (obteniendo la distancia en kilómetros y la duración estimada), y le pide a *M7* el cálculo de la tarifa estimada (**RF-9.4**).

Con toda la información validada, ejecuta una primera transacción SQL donde inserta la reserva en estado `PENDIENTE` y registra el evento de creación (`'C'`) en `historial_reserva`. A continuación, invoca a `confirmarReserva.service.ts`, que en una segunda transacción bloquea la fila (`SELECT ... FOR UPDATE`), actualiza el estado a `CONFIRMADA` (**RF-9.5**) e inserta el registro de confirmación (`'Y'`) en `historial_reserva` (**RF-9.12**). Si la confirmación falla por algún inconveniente transitorio, la reserva igualmente se conserva en estado `PENDIENTE`. Finalmente, emite el aviso asíncrono hacia *M8* y devuelve el código `201 Created` junto con las condiciones de confirmación, modificación y cancelación.

### 3.2. Cancelar una Reserva (`POST /reservas/{id}/cancelar`)

Para cancelar una reserva (**RF-9.7**), el cliente o un operador autorizado envía la solicitud indicando un `motivo` obligatorio de al menos 3 caracteres. El servicio `modificarCancelar.service.ts` valida primero dicho motivo y abre una transacción en PostgreSQL bloqueando la fila de la reserva (`SELECT ... FOR UPDATE`) para asegurarse de que ningún otro proceso la esté modificando o activando al mismo tiempo.

Si la reserva ya se encuentra en estado `ACTIVADA`, `CANCELADA` o `VENCIDA`, el servicio deshace la transacción (`ROLLBACK`) y devuelve un error `409 Conflict`, cumpliendo con la regla de negocio que impide cancelar un viaje que ya pasó a despacho o que ya finalizó su ciclo. En cambio, si la reserva está `PENDIENTE` o `CONFIRMADA`, el repositorio actualiza su estado a `CANCELADA` (`'X'`), guarda el motivo en la columna `motivo_cancelacion` e inserta en la misma transacción un registro inmutable en `historial_reserva` (**RF-9.12**) dejando constancia del estado anterior, el estado nuevo, el actor y el motivo. Al finalizar la transacción, se emite el evento `ReservaCancelada` hacia *M8* y se devuelve `200 OK`.

### 3.3. Activar una Reserva y Protección ante Concurrencia (`POST /reservas/{id}/activar`)

Al llegar el momento programado para el viaje, el Módulo 9 debe activar la reserva y pedirle a *M5 (Solicitud y Despacho)* que busque un conductor (**RF-9.9**). Aquí surge el riesgo de que dos procesos o un reintento automático disparen la activación de la misma reserva al mismo tiempo, lo que podría enviar dos vehículos al mismo cliente.

Para garantizar que una reserva origine como máximo una solicitud de despacho (**RF-9.10** y **RNF-08**), `activarReserva.service.ts` ejecuta dentro de una transacción la operación atómica `tomarReservaParaActivar`: `UPDATE reserva SET estado = 'A' WHERE id = $1 AND estado = 'C' RETURNING *`. Cuando llegan dos peticiones simultáneas (`Proceso 1` y `Proceso 2`), el motor de base de datos serializa el acceso a la fila: el **Proceso 1** encuentra la reserva en estado `'C'` (`CONFIRMADA`), la cambia a `'A'` (`ACTIVADA`) en ese mismo instante y continúa para llamar una sola vez a *M5* (`crearSolicitudDespacho`). Inmediatamente después, cuando PostgreSQL evalúa el `UPDATE` del *Proceso 2*, la condición `WHERE estado = 'C'` ya no se cumple porque la reserva está en `'A'`. De esta manera, el segundo proceso recibe cero filas afectadas (`null`), no realiza ninguna llamada hacia M5 y responde `409 Conflict`. Finalmente, el **Proceso 1** guarda el `solicitud_despacho_id` (protegido además por una restricción `UNIQUE` en la tabla `reserva`), registra el cambio `'A'` (`ACTIVACION`) en `historial_reserva` (**RF-9.12**), confirma la transacción (`COMMIT`), emite el evento `ReservaActivada` hacia *M8* y responde `200 OK`.