# Aprobación de Control Horario

> Panel semanal para revisar, aprobar y rechazar partes diarios de recursos en Dynamics 365 / Dataverse.

![Power Apps PCF](https://img.shields.io/badge/Power%20Apps-PCF-742774?logo=powerapps&logoColor=white)
![React](https://img.shields.io/badge/React-16.14-61DAFB?logo=react&logoColor=20232A)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)
![Versión](https://img.shields.io/badge/versión-1.0.37-107C10)

## 🎯 Objetivo funcional

El control concentra en una pantalla la revisión semanal del tiempo registrado por cada recurso. El supervisor puede buscar un recurso, consultar sus siete días, comparar las horas trabajadas con el horario objetivo y resolver los partes que estén pendientes de aprobación.

~~~mermaid
flowchart LR
    R[👤 Supervisor] --> S[🔎 Seleccionar recurso]
    S --> W[📅 Consultar semana]
    W --> V[🕒 Revisar horas y actividades]
    V --> D{📄 ¿Parte Enviado?}
    D -->|Sí| A[✅ Aprobar]
    D -->|Sí| X[❌ Rechazar con motivo]
    D -->|No| O[🔗 Consultar o abrir]
    A --> H[📝 Añadir auditoría]
    X --> H
    H --> U[🔄 Recargar datos]
~~~

## 🖥️ Vista del usuario

La pantalla tiene una barra lateral de recursos y un calendario de lunes a domingo. Cada columna representa una jornada de 00:00 a 24:00.

~~~text
┌────────────────────────┬──────────────────────────────────────────────────────────┐
│ 👥 MIS RECURSOS         │ APROBACIONES   [✅ Aprobar semana] [🔄 Actualizar]       │
│ 🔎 Buscar recurso...    │ [‹] Semana 10 nov — 16 nov [›]   Zoom [−] 100% [+]      │
│                         ├────────┬────────┬────────┬────────┬────────┬──────┬─────┤
│ ● Ana García            │ LUNES  │ MARTES │ MIÉR.  │ JUEVES │ VIERN. │ SÁB. │ DOM.│
│   Luis Pérez            │ Enviado│Aprobado│Enviado │Borrador│Enviado │  —   │  —  │
│   Marta López           │ [❌]   │        │ [❌]   │        │ [✅]   │      │     │
│                         │ 08:00  │ 09:00  │ 08:30   │ 08:00  │ 08:15  │      │     │
│                         │ ███    │   ██   │ ████    │ ██     │ ███    │      │     │
│                         │ 17:00  │ 18:00  │ 17:30   │ 16:00  │ 17:15  │      │     │
└────────────────────────┴────────┴────────┴────────┴────────┴────────┴──────┴─────┘
~~~

~~~mermaid
flowchart TB
    D[📆 Columna del día] --> S[🏷️ Estado del parte]
    D --> P[📊 Progreso de horas]
    D --> M[📍 Inicio y fin objetivo]
    D --> E[🧱 Entradas de tiempo]
    S --> C{¿Está Enviado?}
    C -->|Sí| B[✅ Aprobar / ❌ rechazar]
    C -->|No| N[👁️ Consultar / abrir]
    E --> T[Tooltip con tipo, horario y cliente]
~~~

## ✨ Funcionalidades

| Funcionalidad | Comportamiento |
|---|---|
| 👥 Recursos | Carga recursos activos, los ordena por nombre y selecciona inicialmente el primero. |
| 🔎 Búsqueda | Filtra por nombre ignorando mayúsculas y acentos. |
| 📅 Navegación | Cambia entre semanas completas de lunes a domingo. |
| 🕒 Línea temporal | Sitúa cada entrada según su hora real de inicio y fin. |
| 📊 Progreso | Compara el tiempo registrado con el objetivo del parte diario. |
| ✅ Aprobar día | Actualiza un parte Enviado a Aprobado. |
| ❌ Rechazar día | Requiere un motivo de hasta 500 caracteres y cambia el estado a Rechazado. |
| 🚀 Aprobar semana | Aprueba todos los partes Enviados de la semana seleccionada. |
| 🔗 Abrir detalle | Abre el formulario estándar del parte diario en una ventana nueva. |
| 👤 Usuario actual | Muestra nombre, GUID y correo del usuario que ejecuta el panel. |
| 🔄 Actualizar | Vuelve a consultar recursos, entradas, partes y clientes. |
| 🌍 Idiomas | Usa español, portugués o inglés según el idioma del usuario. |
| 🔍 Zoom | Ajusta la altura visual de la línea temporal entre 60% y 300%. |

## 🧭 Flujo de datos y acciones

~~~mermaid
sequenceDiagram
    actor Supervisor
    participant PCF as Panel React/PCF
    participant API as Dataverse Web API

    Supervisor->>PCF: Abre el control
    PCF->>API: Lee bookableresource activos
    API-->>PCF: Recursos ordenados
    PCF-->>Supervisor: Muestra el primer recurso

    Supervisor->>PCF: Elige recurso y semana
    PCF->>API: Lee msdyn_timeentry
    PCF->>API: Lee sec_partediario
    PCF->>API: Lee msdyn_workorder
    PCF->>API: Lee systemuser por GUID para obtener nombre y correo
    API-->>PCF: Entradas, estados, horarios y clientes
    PCF-->>Supervisor: Dibuja el calendario

    alt Aprobar o rechazar
        Supervisor->>PCF: Ejecuta una acción
        PCF->>API: Lee comentarios existentes
        PCF->>API: Actualiza statuscode y sec_comentarios
    else Aprobar semana
        Supervisor->>PCF: Pulsa Aprobar semana
        PCF->>API: Actualiza cada parte Enviado
    end

    PCF->>API: Recarga la semana
    API-->>PCF: Devuelve los estados actualizados
~~~

## ⏱️ Cálculo del progreso diario

~~~text
Objetivo diario  = hora fin del parte − hora inicio del parte
Tiempo trabajado = suma de (fin de cada entrada − inicio de cada entrada)
Diferencia       = objetivo diario − tiempo trabajado
~~~

La interfaz muestra:

- ⏳ **Quedan X horas** si falta tiempo para alcanzar el objetivo.
- ⚡ **Exceso de X horas** si se ha superado el objetivo.
- 🎯 **Objetivo cumplido** si la diferencia es cero.
- — **Objetivo no disponible** si faltan horas válidas en el parte.

## 🎨 Código visual de las entradas

El tipo y la descripción determinan el color y el icono del bloque:

| Dato detectado | Visual |
|---|---|
| Trabajo con orden de trabajo | Azul · 🛠️ |
| Trabajo manual sin orden | Azul claro · 🛠️ |
| Festivo | Morado · 🎉 |
| Sin asignación | Marrón · ⏳ |
| Viaje | Verde · 🚗 |
| Descanso, almuerzo o comida | Naranja · ☕ |
| Vacación o ausencia | Granate · 🌴 |

El cliente se obtiene desde la cuenta de servicio de la orden de trabajo. Si no existe relación, se muestra cliente no disponible.

## ✅ Estados y auditoría

~~~mermaid
stateDiagram-v2
    [*] --> Borrador
    [*] --> Inactivo
    Borrador --> Enviado: El usuario envía el parte
    Enviado --> Aprobado: Supervisor aprueba
    Enviado --> Rechazado: Supervisor rechaza
    Aprobado --> [*]
    Inactivo --> [*]
~~~

| Estado | Código | Se puede resolver aquí |
|---|---:|:---:|
| Borrador | <code>1</code> | No |
| Inactivo | <code>2</code> | No |
| Enviado | <code>909540001</code> | Sí |
| Aprobado | <code>909540002</code> | No |
| Rechazado | <code>909540003</code> | No |

Al aprobar o rechazar, se conservan los comentarios existentes y se añade una línea en <code>sec_comentarios</code>. El texto utiliza el idioma actual de la interfaz:

~~~text
Estado: Aprobado - Usuario aprobador: Juan Pérez - Fecha: 13/11/2026, 10:30:00 - Comentario: Aprobación del parte
Estado: Rechazado - Usuario aprobador: Juan Pérez - Fecha: 13/11/2026, 10:35:00 - Comentario: Falta justificar el desplazamiento
~~~

En portugués se utilizan etiquetas como <code>Utilizador aprovador</code>, <code>Data</code> y <code>Comentário</code>. En inglés se utilizan <code>Approving user</code>, <code>Date</code> y <code>Comment</code>.

El rechazo no se puede confirmar sin motivo y el texto está limitado a 500 caracteres. En la aprobación semanal, las actualizaciones se ejecutan en paralelo y se informa de los fallos parciales.

## 🧩 Arquitectura de Dataverse

~~~mermaid
flowchart TB
    subgraph UI[Interfaz React + Fluent UI]
        R[Lista y búsqueda de recursos]
        C[Calendario semanal]
        D[Diálogo de rechazo]
    end

    subgraph API[Dataverse Web API]
        BR[bookableresource]
        TE[msdyn_timeentry]
        WO[msdyn_workorder]
        PR[sec_partediario]
    end

    R --> BR
    C --> TE
    C --> PR
    TE -->|Orden de trabajo| WO
    WO -->|Cuenta de servicio| C
    PR --> C
    D --> PR
~~~

| Tabla | Se consulta para | Se actualiza |
|---|---|---|
| <code>bookableresource</code> | Recursos activos y nombres | No |
| <code>msdyn_timeentry</code> | Inicio, fin, tipo, descripción y orden | No |
| <code>msdyn_workorder</code> | Obtener el cliente de cada orden | No |
| <code>sec_partediario</code> | Fecha, estado, horario objetivo y comentarios | Estado y comentarios |
| <code>systemuser</code> | Nombre completo y correo del usuario actual | No |

## 🌍 Idioma y parámetro regional

El idioma se determina por <code>context.userSettings.languageId</code>:

| Caso | Locale |
|---|---|
| Portugués | <code>pt-PT</code> |
| Inglés | <code>en-US</code> |
| Cualquier otro idioma | <code>es-ES</code> |

El manifiesto también define <code>sec_region</code>:

~~~mermaid
flowchart LR
    P[sec_region] --> ES[1 · España]
    P --> PT[2 · Portugal]
    P --> LA[3 · Latam]
~~~

> ⚠️ En la versión actual, <code>sec_region</code> se recibe y se pasa al componente, pero no modifica consultas, filtros, estados, textos ni horarios. España, Portugal y Latam se comportan funcionalmente igual. El idioma depende del usuario, no de este parámetro.

## 🔐 Requisitos y permisos

El control requiere:

1. Campo enlazado obligatorio: <code>boundField</code>.
2. Parámetro de entrada: <code>sec_region</code>.
3. Característica **WebAPI** habilitada.
4. Permisos de lectura sobre <code>bookableresource</code>, <code>msdyn_timeentry</code>, <code>msdyn_workorder</code>, <code>sec_partediario</code> y <code>systemuser</code>.
5. Permiso de actualización sobre <code>sec_partediario</code>.
6. Permiso para abrir el formulario de <code>sec_partediario</code>.

~~~mermaid
flowchart TD
    U[Usuario de Dynamics 365] --> P{Permisos suficientes}
    P -->|Sí| OK[✅ Cargar y resolver partes]
    P -->|No| E[⚠️ Error de lectura o actualización]
    OK --> L[Leer datos]
    OK --> W[Actualizar estado y comentarios]
~~~

Actualmente se cargan todos los recursos activos devueltos por la consulta; no hay filtro por supervisor, usuario conectado o región.

## 🛠️ Desarrollo local

Requisitos: Node.js y npm.

~~~bash
npm install
npm run build
npm run lint
~~~

Scripts disponibles:

| Comando | Uso |
|---|---|
| <code>npm run build</code> | Compilar el PCF. |
| <code>npm run start</code> | Iniciar el entorno de pruebas. |
| <code>npm run start:watch</code> | Probar con vigilancia de cambios. |
| <code>npm run lint</code> | Validar estilo. |
| <code>npm run lint:fix</code> | Corregir estilo automáticamente cuando sea posible. |
| <code>npm run clean</code> | Limpiar artefactos. |
| <code>npm run rebuild</code> | Limpiar y recompilar. |
| <code>npm run refreshTypes</code> | Regenerar tipos del manifiesto. |

## 📁 Estructura

~~~text
.
├── AprobacionControlHorario/
│   ├── AprobacionControlHorarioApp.tsx   # UI y lógica funcional
│   ├── ControlManifest.Input.xml         # Parámetros, recursos y versión
│   ├── index.ts                          # Entrada del control PCF
│   ├── css/                              # Estilos
│   └── strings/                           # Traducciones
├── package.json
└── AprobacionControlHorarioPCF.pcfproj
~~~

## 🔁 Versionado

La versión actual es **1.0.37**. Cuando se modifique la lógica o la interfaz del PCF, hay que incrementar el tercer número y sincronizar:

- <code>AprobacionControlHorario/ControlManifest.Input.xml</code>
- <code>AprobacionControlHorario/AprobacionControlHorarioApp.tsx</code>

## 📌 Limitaciones conocidas

- <code>sec_region</code> todavía no tiene lógica regional.
- Se muestran todos los recursos activos, sin filtro por supervisor.
- La aprobación semanal solo procesa partes Enviados.
- Las entradas se agrupan según la fecha/hora del navegador.
- Sin parte diario no se dibujan entradas para ese día.
- El nombre y GUID del usuario se obtienen del contexto de Power Apps; el correo se consulta en <code>systemuser</code> mediante el GUID. La consulta tiene reintentos para cubrir la inicialización tardía del contexto.

## 📚 Archivos principales

- [AprobacionControlHorarioApp.tsx](./AprobacionControlHorario/AprobacionControlHorarioApp.tsx): componente React, consultas y acciones.
- [index.ts](./AprobacionControlHorario/index.ts): ciclo de vida PCF y conexión con React.
- [ControlManifest.Input.xml](./AprobacionControlHorario/ControlManifest.Input.xml): manifiesto, parámetros y versión.
- [AprobacionControlHorario.css](./AprobacionControlHorario/css/AprobacionControlHorario.css): estilos.
- [strings/](./AprobacionControlHorario/strings/): traducciones.
