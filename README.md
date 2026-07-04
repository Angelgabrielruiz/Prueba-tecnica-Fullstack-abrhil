# Jira Lite — Prueba Técnica Fullstack

Gestor de proyectos simplificado (tipo Jira) construido con Django REST Framework, PostgreSQL y React + TypeScript.

---

## Estructura del repositorio

```
.
├── backend/          Django + DRF + PostgreSQL (apps/, config/, manage.py)
├── frontend/          React + TypeScript (Vite)
├── docker-compose.yml Orquesta db + backend + frontend
└── README.md
```

Cada subcarpeta es autocontenida (su propio `Dockerfile`, dependencias y `.env.example`). El
`docker-compose.yml` de la raíz es el único punto de entrada para levantar los tres servicios juntos.

## Cómo ejecutar

### Con Docker (recomendado)

```bash
cp .env.example .env      # ajustar si es necesario
docker compose up --build
```

- Backend: http://localhost:8000/api/
- Frontend: http://localhost:5173/
- PostgreSQL: localhost:5432

El backend corre `migrate` automáticamente al arrancar el contenedor. No hay seed de datos automático
en Docker; para probar con datos de ejemplo, usar `docker compose exec backend python manage.py shell`
y correr `seed_data.py`, o registrarse desde el frontend y crear proyectos/tareas manualmente.

### Sin Docker (desarrollo local)

Backend:
```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp config/.env.example config/.env   # o crear config/.env con las variables de DB
python manage.py migrate
python manage.py runserver
```

Frontend:
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

Requiere PostgreSQL corriendo localmente (o vía `docker compose up db`) con las credenciales de
`config/.env`.

## Modelado de datos

### Entidades

| Entidad | Propósito |
|---|---|
| `User` | Usuario del sistema (extiende `AbstractUser` de Django) |
| `Project` | Proyecto colaborativo |
| `ProjectMember` | Relación explícita usuario↔proyecto, con rol |
| `Task` | Tarea dentro de un proyecto |
| `Comment` | Comentario sobre una tarea |
| `Activity` | Registro de auditoría/historial de acciones |

### Justificación de decisiones de diseño

#### 1. Extensión de usuario: `AbstractUser`, no `Profile` separado

Se optó por extender `AbstractUser` directamente en vez de usar un modelo `Profile` con `OneToOneField`. Esto evita un join adicional para operaciones cotidianas de autenticación y negocio, ya que en este dominio no hay necesidad de separar "datos de autenticación" de "datos de negocio" en dos tablas. El campo `email` fue sobreescrito para forzar unicidad (`unique=True`), ya que Django no lo garantiza por defecto en `AbstractUser`, y el sistema depende de `email` como identificador funcional.

#### 2. `ProjectMember` como entidad explícita, no `ManyToManyField` puro

La colaboración usuario↔proyecto es muchos-a-muchos, pero la relación en sí necesita cargar datos propios: `role` (admin/member) y `joined_at`. Un `ManyToManyField` estándar de Django solo representa la existencia de la relación, no atributos sobre ella. Por eso se modeló como tabla intermedia explícita con dos `ForeignKey`, equivalente a una tabla de unión con columnas propias en SQL puro. Se agregó `unique_together = ("project", "user")` para evitar membresías duplicadas.

#### 3. Comentarios sobre `Task`, no sobre `Project`

Los comentarios se asocian a nivel de tarea, no de proyecto completo, siguiendo el patrón estándar de herramientas de gestión de tareas (Jira, Linear, GitHub Issues). Esto da trazabilidad granular: cada comentario tiene contexto específico sobre qué se está discutiendo.

#### 4. Estrategias de `on_delete` diferenciadas por caso de uso

No se aplicó `CASCADE` de forma uniforme; cada relación se evaluó según su semántica:

| Relación | Estrategia | Razón |
|---|---|---|
| `Task.project` | `CASCADE` | Una tarea no tiene sentido sin su proyecto |
| `Task.assignee` | `SET_NULL` | Si se borra el usuario, la tarea sigue existiendo, solo queda sin asignar |
| `Task.created_by` | `CASCADE` | Simplificación consciente; en producción real se recomendaría `PROTECT` para preservar autoría histórica |
| `Comment.task` | `CASCADE` | Un comentario no existe sin su tarea |
| `Comment.user` | `SET_NULL` | Preserva el historial de conversación aunque el autor sea eliminado (comportamiento estándar en herramientas colaborativas) |
| `Activity.task` / `Activity.user` | `SET_NULL` | Un registro de auditoría debe sobrevivir a los cambios de lo que describe |

#### 5. Campos de fecha separados por propósito

`Task` distingue `created_at` (auto al crear), `updated_at` (auto en cada edición) y `completed_at` (manual, solo se llena cuando el status cambia a "done"). Esta separación es la que permite calcular el tiempo de finalización con precisión (`completed_at - created_at`), sin contaminar el cálculo con ediciones que no representan finalización real.

`completed_at` se calcula automáticamente vía signal (`apps/activity/signals.py`) cuando el `status` de una tarea cambia a `"done"`, y se limpia si vuelve a un status distinto. Esta lógica vive a nivel de modelo (signal `post_save`), no en el endpoint del `ViewSet`, para garantizar que se aplique sin importar el origen del cambio (API, admin de Django, shell, scripts de management, futuras integraciones).

#### 6. `status` y `priority` con `choices`, no cadenas libres

Se usó el mecanismo de `choices` de Django (equivalente a un `enum` a nivel de aplicación) en vez de `varchar` libre, para evitar valores inconsistentes en la base de datos (ej. "Done" vs "done" vs "completed") y facilitar validación automática vía DRF serializers.

#### 7. Registro de actividad desacoplado vía signals

En vez de llamar explícitamente `Activity.objects.create()` dentro de cada vista que modifica una tarea, se usó el sistema de `signals` de Django (`pre_save`/`post_save`). Esto desacopla la app `activity` de `tasks`/`comments`: cualquier punto de entrada que modifique una tarea o agregue un comentario (vista, admin, script, importación futura) genera su registro de actividad automáticamente, sin depender de que cada desarrollador recuerde agregar la llamada manual en cada lugar nuevo.

**Caso especial — detección de cambio de status:** `post_save` no compara automáticamente el valor anterior contra el nuevo. Se resolvió con un signal `pre_save` adicional (`capture_old_status`) que consulta el valor de `status` que todavía está en la base de datos justo antes de que se sobrescriba, y lo guarda temporalmente en un atributo no persistente de la instancia (`instance._old_status`). El signal `post_save` posterior compara ese valor contra el nuevo `instance.status` y solo genera el log — y actualiza `completed_at`— si realmente cambió.

#### 8. Índices agregados desde el modelado

Se agregaron índices compuestos pensando en los patrones de consulta esperados del dashboard:

- `Task`: `(project, status)` — acelera "tareas de este proyecto por estado", y es el índice que sostiene las dos queries SQL manuales del dashboard (ver sección PostgreSQL).
- `Task`: `(assignee, status)` — acelera "tareas de este usuario por estado" (ej. "mis tareas pendientes"), el patrón de filtro típico del frontend de gestión de tareas.
- `Activity`: `(project, -created_at)` — acelera la consulta de historial más reciente por proyecto.

#### 9. Normalización

El modelo está normalizado a 3FN: no hay campos derivados almacenados (ej. no se guarda un "total de tareas completadas" en `Project`, se calcula on-demand vía agregación SQL) y no hay duplicación de datos entre entidades. Esta decisión prioriza consistencia sobre performance de lectura; si el volumen de datos creciera significativamente, sería candidato a desnormalización selectiva (ver sección de mejoras posibles).

#### 10. Patrón de serializers separados por lectura/escritura (read/write split)

Cada entidad principal (`Project`, `Task`, `Comment`) tiene dos serializers: uno de lectura (`*Serializer`, con relaciones anidadas resumidas — ej. `UserSummarySerializer`) y uno de escritura (`*WriteSerializer`, con relaciones como IDs planos vía `PrimaryKeyRelatedField` o campos explícitos). Esto evita dos problemas: sobreexponer campos internos del modelo `User` en las respuestas, y forzar al cliente a mandar objetos anidados completos cuando solo necesita referenciar un ID existente.

Campos como `created_by` (`Project`), `created_by` (`Task`) o `user` (`Comment`) están **excluidos deliberadamente** de los serializers de escritura — se asignan en el `ViewSet` a partir de `request.user`, nunca confiando en lo que el cliente mande en el body, para evitar que un usuario pueda crear recursos "a nombre de" otro.

**Nota de implementación:** los `ViewSet` con este patrón sobrescriben `create()` y `update()` para serializar la respuesta con el serializer de **lectura** sobre la instancia ya guardada — el comportamiento default de DRF usaría el serializer de escritura también para el output, devolviendo una respuesta incompleta (sin `id`, sin relaciones anidadas). `destroy()` no necesita este ajuste: un DELETE exitoso no serializa ningún cuerpo de respuesta (`204 No Content`).

#### 11. Autorización en dos capas: queryset filtrado + permission class

El control de acceso se implementa en dos capas complementarias, no una sola, para cada entidad:

- **`get_queryset()` filtrado**: es la primera línea de defensa y la única forma correcta de cubrir `list` — un endpoint de listado no tiene un objeto individual sobre el cual evaluar permisos, así que la restricción debe vivir en la consulta misma, nunca en un filtrado posterior en memoria.
  - `Project`: `filter(members__user=request.user)`
  - `Task`: `filter(project__members__user=request.user)` — atraviesa la relación indirecta hacia el proyecto
  - `Comment`: `filter(task__project__members__user=request.user)` — dos niveles de indirección

- **Permission classes con `has_object_permission()`**: cubren `retrieve`, `update`, `destroy` — casos donde ya existe un objeto específico cargado. Cada entidad tiene reglas de escritura distintas, adaptadas a su semántica:
  - `IsProjectMember`: cualquier miembro lee, solo `role="admin"` modifica/elimina.
  - `IsTaskProjectParticipant`: cualquier miembro lee y crea; edición permitida al `assignee`, `created_by`, o admin del proyecto (para no bloquear el flujo diario de mover las propias tareas); borrado restringido solo a admin.
  - `IsCommentProjectParticipant`: cualquier miembro lee y crea; edición y borrado restringidos únicamente al autor del comentario (ni siquiera el admin del proyecto puede modificar el comentario de otro usuario).

#### 12. Creación de proyecto como operación transaccional

`ProjectViewSet.create()` envuelve en `transaction.atomic()` la creación del `Project` y de su `ProjectMember` inicial (el creador, con `role="admin"`) en una sola unidad — si cualquiera de las dos falla, ninguna se persiste. Sin esto, sería posible terminar con un proyecto huérfano sin ningún admin asignado.

#### 13. Validación cross-field: assignee debe ser miembro del proyecto

`TaskWriteSerializer.validate()` verifica que el `assignee` de una tarea sea efectivamente miembro del proyecto al que pertenece la tarea, consultando `ProjectMember` dentro del propio serializer. Esta validación vive en el serializer (no en la vista ni en el modelo) porque es una regla de integridad de datos entre dos campos del mismo request (`project` + `assignee`), distinta de una regla de permisos (¿puede este usuario actuar sobre este recurso?) — esa distinción se mantiene deliberadamente en capas separadas.

#### 14. Login por correo, no por username separado

El diseño de UI (ver sección Frontend) solo pide **Nombre + Correo + Contraseña** al registrarse, y **Correo + Contraseña** al iniciar sesión — no existe un campo de "username" visible para el usuario. `AbstractUser` de Django exige un `USERNAME_FIELD` (por defecto `username`) para el mecanismo de auth de `rest_framework_simplejwt`. En vez de introducir un backend de autenticación custom para aceptar `email` como `USERNAME_FIELD` (más superficie de cambio, más riesgo), se optó por una solución mínima: `RegisterSerializer.create()` genera `username = email` automáticamente. El validador de username de Django acepta `@` y `.`, así que esto no requiere migración ni cambios al modelo. El frontend simplemente envía el valor del campo "Correo" como `username` al endpoint `/api/auth/login/` — una decisión de mapeo interno, no un cambio de contrato observable por el usuario final.

El campo `name` expuesto en `UserSummarySerializer` reutiliza `first_name` (ya presente en `AbstractUser`, sin migración nueva) para mostrar nombres legibles en avatares, comentarios y actividad, en vez de mostrar el email crudo en toda la interfaz.

#### 15. Endpoint de actividad de solo lectura

`ActivityViewSet` es un `ReadOnlyModelViewSet`: el historial se genera exclusivamente vía signals (creación de tarea, cambio de estado, comentario), nunca por escritura directa del cliente. Exponerlo como editable violaría la garantía de que el log de auditoría siempre refleja eventos reales del sistema. Filtra por membresía igual que el resto de las entidades (`project__members__user`) y soporta `?project=`, `?action=`, `?user=` vía `django-filter` para las vistas de dashboard y actividad del frontend.

#### 16. Paginación y filtrado activados globalmente

Se agregó `DEFAULT_PAGINATION_CLASS` (paginación por página, 20 por defecto, hasta 200 vía `?page_size=`) y `DEFAULT_FILTER_BACKENDS` con `django-filter` a nivel de proyecto (antes la app estaba instalada pero no conectada a DRF). Cada `ViewSet` declara sus propios `filterset_fields` según su patrón de consulta real. `Task` y `Activity` usan la sintaxis de diccionario de `django-filter` para exponer también rangos de fecha (`due_date__gte`/`due_date__lte` en `Task`, `created_at__gte`/`created_at__lte` en `Activity`), no solo igualdad exacta — el enunciado pide explícitamente poder filtrar "por estado, usuario, fechas, etc.", y la primera versión solo cubría estado/usuario/prioridad. El frontend expone un selector de "vence antes de" en la pestaña de Tareas que usa este filtro.

#### Posibles mejoras / alternativas consideradas

- `Task.created_by` podría usar `PROTECT` en vez de `CASCADE` para nunca perder autoría histórica de tareas.
- Para dashboards de alto tráfico, se podría introducir una tabla de agregados precalculados (ej. contador de tareas completadas por usuario/proyecto), actualizada vía signal o tarea asíncrona, en vez de calcular siempre on-the-fly.
- `Activity.metadata` como `JSONField` da flexibilidad para distintos tipos de evento sin migración, pero sacrifica la capacidad de indexar o validar su contenido a nivel de base de datos — trade-off consciente entre flexibilidad y rigidez de esquema.
- El `user` registrado en `Activity` para `task_status_changed` se infiere como `assignee or created_by`, no necesariamente el usuario real que ejecutó el `PATCH` — limitación conocida; una solución más precisa requeriría pasar explícitamente `request.user` hasta el signal (por ejemplo, vía `instance._changed_by` asignado en la vista antes de guardar).
- El filtrado por membresía en el endpoint de dashboard se hace actualmente en Python, después de traer los resultados agregados de todos los proyectos (ver sección PostgreSQL, punto 3) — simplificación consciente, con ruta de mejora documentada.

#### 17. Invitar/quitar miembros como acciones del `ProjectViewSet`, no un ViewSet aparte

`POST /api/projects/{id}/members/` y `DELETE /api/projects/{id}/members/{user_id}/` se implementaron como `@action` de `ProjectViewSet` (no como un `ProjectMemberViewSet` independiente) porque toda la lógica de permisos ya existe a nivel de objeto `Project`: `get_object()` evalúa `IsProjectMember.has_object_permission`, que para métodos no seguros (`POST`/`DELETE`) ya exige `role == "admin"` — reutilizar esa capa evita duplicar la regla "solo un admin gestiona miembros" en un permission class nuevo.

- **Invitar** busca al usuario por `email` (debe existir una cuenta previa; no hay invitación por correo electrónico real fuera de la app, está fuera de alcance). Devuelve `400` con mensaje claro si el correo no corresponde a ningún usuario o si ya es miembro.
- **Quitar** un miembro con `role="admin"` está bloqueado si es el único admin restante del proyecto, para no repetir el problema de "proyecto huérfano" que ya se previno en la creación (punto 12).
- En el frontend, el modal de miembros solo muestra el formulario de invitar/quitar si el usuario actual es admin del proyecto — la restricción real sigue viviendo en el backend, esto es solo UX.

**Nota de corrección (condición de carrera en registro):** el `UniqueValidator` que DRF genera automáticamente para `email` en `RegisterSerializer` hace una validación de tipo *check-then-insert*, no atómica. Dos registros concurrentes con el mismo correo (ej. doble clic en "Crear cuenta", o dos pestañas registrando la misma cuenta a la vez) pueden pasar ambos la validación y competir en el `INSERT`, y el segundo terminaba en un `IntegrityError` sin capturar (`500`) en vez de un `400` legible — reproducido disparando dos requests verdaderamente concurrentes contra `/api/auth/register/`. Se corrigió envolviendo `User.objects.create_user()` en un `try/except IntegrityError` dentro de `RegisterSerializer.create()`, traduciendo el error a una `ValidationError` de DRF.

**Nota de corrección:** `TaskViewSet.update()` construía la respuesta de lectura a partir de la instancia ya guardada en memoria, pero el signal que fija `completed_at` cuando una tarea pasa a `done` lo hace con una query `.update()` separada (para no volver a disparar `post_save`). Eso dejaba la respuesta del `PATCH` con `completed_at: null` durante un ciclo, aunque el valor ya estuviera correcto en la base de datos (confirmado comparando contra el promedio de `GET /api/dashboard/`). Se corrigió con `task.refresh_from_db()` antes de serializar la respuesta.

---

## PostgreSQL

### 1. Queries SQL manuales

#### A) Top 5 usuarios con más tareas completadas por proyecto

Ubicación: `apps/tasks/queries.py` → `get_top_completers_by_project()`
Expuesta en: `GET /api/dashboard/`

```sql
SELECT project_id, user_id, username, completed_count
FROM (
    SELECT
        t.project_id,
        u.id AS user_id,
        u.username,
        COUNT(*) AS completed_count,
        ROW_NUMBER() OVER (
            PARTITION BY t.project_id
            ORDER BY COUNT(*) DESC
        ) AS rank
    FROM tasks_task t
    JOIN users_user u ON u.id = t.assignee_id
    WHERE t.status = 'done'
    GROUP BY t.project_id, u.id, u.username
) ranked
WHERE rank <= 5
ORDER BY project_id, completed_count DESC;
```

**Por qué no un `GROUP BY` + `LIMIT` simple:** un `LIMIT 5` aplicado directamente sobre `GROUP BY project_id, user_id` limitaría el resultado combinado de *todos* los proyectos, no 5 usuarios *por cada* proyecto. Se usa `ROW_NUMBER() OVER (PARTITION BY project_id ...)` para reiniciar el ranking en cada proyecto, y luego se filtra `rank <= 5` en una subquery externa, porque PostgreSQL no permite filtrar por una window function en el mismo nivel donde se calcula.

**Nota de diseño:** se usa `INNER JOIN` deliberadamente, no `LEFT JOIN`. Una tarea `done` sin `assignee` no representa "trabajo completado por un usuario" para efectos de este ranking, así que se excluye en vez de aparecer con un usuario nulo.

**Verificado con datos reales:** con 4 usuarios y 11 tareas completadas distribuidas de forma desigual (5/3/2/1), la query devuelve el ranking correcto en orden descendente:

```json
[
  {"project_id": 1, "username": "tester1", "completed_count": 5},
  {"project_id": 1, "username": "tester2", "completed_count": 3},
  {"project_id": 1, "username": "tester3", "completed_count": 2},
  {"project_id": 1, "username": "angel",   "completed_count": 1}
]
```

#### B) Promedio de tiempo de finalización de tareas

Ubicación: `apps/tasks/queries.py` → `get_avg_completion_time_by_project()`
Expuesta en: `GET /api/dashboard/`

```sql
SELECT
    project_id,
    COUNT(*) AS completed_tasks,
    AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) AS avg_seconds
FROM tasks_task
WHERE status = 'done'
  AND completed_at IS NOT NULL
GROUP BY project_id
ORDER BY project_id;
```

**Por qué por proyecto y no global:** un promedio global mezclaría proyectos con naturalezas de trabajo distintas (ej. bugs urgentes vs. features grandes), distorsionando el número resultante para cualquiera de los dos. Un promedio por proyecto le da a cada equipo una métrica representativa de su propio ritmo de entrega.

**Por qué `EXTRACT(EPOCH FROM ...)`:** restar dos `timestamp` en PostgreSQL devuelve un tipo `interval`, que no es serializable directamente a JSON. `EXTRACT(EPOCH FROM intervalo)` lo convierte a segundos totales (float), listo para exponer en la API. El resultado de `AVG()` sobre este cálculo llega como `Decimal` vía `psycopg2`; se convierte explícitamente a `float` en Python antes de responder, ya que `Decimal` tampoco es serializable por el encoder JSON estándar.

**Por qué `completed_at IS NOT NULL` además de `status = 'done'`:** salvaguarda explícita contra datos inconsistentes (por ejemplo, tareas marcadas `done` antes de que existiera la lógica automática de `completed_at`). Aunque `AVG()` ignora `NULL` por defecto, el filtro deja la intención explícita en el código en vez de depender de un comportamiento implícito de SQL.

**Verificado con datos reales:** `{"project_id": 1, "completed_tasks": 11, "avg_seconds": 27048.41}` — con tiempos de finalización variados entre tareas, confirmando que el promedio refleja datos reales, no un único caso trivial.

### 2. Indexación

Índices definidos en `Task.Meta.indexes`:

```python
indexes = [
    models.Index(fields=["project", "status"]),
    models.Index(fields=["assignee", "status"]),
]
```

- **`(project, status)`** acelera directamente las Queries A y B: ambas filtran por `status = 'done'` y agrupan por `project_id`, que son exactamente las dos columnas líderes de este índice. PostgreSQL puede usarlo para saltar directo a las filas de un proyecto con status `done`, sin escanear la tabla completa.
- **`(assignee, status)`** no aporta a estas dos queries en particular — `assignee` solo aparece en el `JOIN` de la Query A (para traer el `username`), no en su `WHERE` ni `GROUP BY`. Este índice está pensado para otro patrón de acceso de la API: filtrar tareas asignadas a un usuario específico por status (ej. "mis tareas pendientes"), el filtro típico de la vista de gestión de tareas en el frontend.

Cada índice corresponde a un patrón de consulta distinto de la aplicación — no existe un índice "universal" óptimo para todas las queries del sistema; el diseño de índices debe seguir a los patrones de acceso reales, no aplicarse de forma genérica.

### 3. ¿Cómo optimizarías queries lentas en este sistema?

- **Verificar el plan de ejecución real** con `EXPLAIN ANALYZE` antes de asumir dónde está el cuello de botella, en vez de optimizar a ciegas.
- **Filtrar en SQL, no en Python**, cuando el volumen de datos crezca: el endpoint de dashboard actual filtra por proyectos del usuario en memoria (Python) después de traer todas las filas de todos los proyectos — una simplificación consciente para el alcance de esta prueba, documentada aquí explícitamente. En producción, este filtro se movería al `WHERE` del SQL crudo (`WHERE t.project_id = ANY(%s)`), pasando los IDs de proyectos del usuario como parámetro, para no traer datos que después se descartan.
- **Paginación** en cualquier endpoint de listado que pueda crecer sin límite (tareas, actividad).
- **`select_related` / `prefetch_related`** ya aplicados en los `ViewSet` para evitar N+1 en relaciones `ForeignKey` y de membresía.
- **Índices adicionales** dirigidos por evidencia real de queries lentas en producción, no especulativos — agregar índices sin medir primero puede degradar el rendimiento de escritura sin beneficio real de lectura.
- **Vistas materializadas** para el dashboard si el volumen de tareas creciera mucho: las queries A y B podrían recalcularse periódicamente (ej. cada 5-10 minutos) en vez de en cada request, aceptando datos ligeramente desactualizados a cambio de respuestas instantáneas.

---

## Frontend

React 19 + TypeScript, construido con Vite. El diseño visual (paleta, tipografía, layout de las
cuatro vistas) se importó desde un mockup propio hecho en claude.ai/design ("Diseño Jira naranja
pastel" / `Ambar.dc.html`) y se re-implementó como componentes React reales conectados a la API,
no como una copia estática del HTML del mockup.

### Stack y decisiones técnicas

- **React Router v7** para el ruteo, incluyendo rutas anidadas para las pestañas del proyecto
  (`/projects/:id/dashboard`, `/tasks`, `/activity`) — el tab activo vive en la URL, no en estado
  local, para que sea navegable y compartible.
- **TanStack Query** para todo el estado de servidor (proyectos, tareas, comentarios, actividad,
  dashboard). Se usa `invalidateQueries` con claves por prefijo (ej. `["tasks"]`) tras cada
  mutación para refrescar automáticamente el kanban, el dashboard y la actividad sin lógica manual
  de refetch.
- **Context de autenticación** (`AuthContext`) propio en vez de una librería externa: el estado de
  auth es simple (usuario actual + tokens), no justifica una dependencia adicional.
- **Axios** con un interceptor de request (adjunta el `access token`) y uno de response que
  detecta `401`, refresca el token automáticamente vía `/api/auth/login/refresh/` una sola vez por
  request fallido (con una promesa compartida para no disparar múltiples refresh en paralelo), y
  reintenta la petición original. Si el refresh falla, limpia la sesión y dispara un evento global
  que desloguea al usuario.
- **CSS plano con variables** (sin Tailwind ni librería de componentes): dado que el diseño ya
  venía completamente especificado (colores, espaciados, radios) desde el mockup, una utility-first
  library habría sido una capa de indirección sin beneficio real para esta cantidad de vistas.
- **`useDebounce`** (300ms) aplicado al campo de búsqueda de tareas antes de disparar la query a
  `/api/tasks/?search=`, para no golpear el backend en cada tecla.

### Vistas implementadas

1. **Login / Registro** — pantalla partida con formulario + panel animado, coincidiendo con el
   mockup. El registro pide Nombre/Correo/Contraseña (ver punto 14 de la sección de backend sobre
   por qué el login funciona con correo).
2. **Lista de proyectos** — grid de tarjetas con barra de progreso (tareas completadas/total,
   calculado en el cliente a partir de `/api/tasks/`) y avatares de miembros apilados.
3. **Dashboard del proyecto** — tarjetas de métricas, barra de tareas por estado, actividad
   reciente (con link a la pestaña completa), top colaboradores **y una lista de tareas**
   (título, estado, prioridad, asignado, fecha límite; ordenada por pendientes primero y fecha más
   próxima) — el enunciado pide "métricas del backend" y "lista de tareas" como dos piezas
   separadas del dashboard, no solo agregados.

   **"Top colaboradores"** muestra a *todos* los miembros del proyecto (con 0 si no han completado
   nada), calculado en el cliente a partir de las tareas ya cargadas — así se ve el equipo completo,
   no solo a quien va ganando. Pero el resultado real de la query SQL manual A
   (`get_top_completers_by_project()`, top 5 por proyecto vía `ROW_NUMBER() OVER PARTITION BY`,
   expuesta en `GET /api/dashboard/`) no se descarta: se cruza con la lista de miembros y se
   muestra como una medalla numerada (`#1`, `#2`...) sobre el avatar de quien SÍ aparece en ese top 5
   según el backend. Esto evita el problema de que, al pedir "que se vean todos los colaboradores",
   la query SQL quedara implementada en el backend pero sin ningún reflejo visible en el frontend.
4. **Tareas** — tablero kanban (Por hacer / En progreso / Hecho) con búsqueda debounced, filtros
   compactos (dropdown) por asignado/prioridad y por fecha límite (todo resuelto vía query params
   al backend, no en el cliente). Las tarjetas se pueden arrastrar entre columnas (Drag and Drop
   API nativo del navegador — `draggable`, `onDragOver`/`onDrop` — sin librería adicional) para
   cambiar el estado, igual que en Jira; también se puede cambiar el estado desde el modal de
   detalle sin arrastrar. Modal de creación/edición y modal de detalle con cambio de estado y
   comentarios.
5. **Actividad** — timeline vertical del historial del proyecto con chips de filtro por tipo de
   evento, consumiendo el nuevo endpoint `GET /api/activity/`.
6. **Miembros del proyecto** — accesible desde el avatar-stack en el header del proyecto (visible
   en las tres pestañas). Cualquier miembro puede ver la lista; solo un admin ve el formulario para
   invitar (por correo, a usuarios ya registrados) o quitar colaboradores, consumiendo
   `POST`/`DELETE /api/projects/{id}/members/`.

### Manejo de errores y loading

Cada vista distingue explícitamente entre estado de carga (`LoadingState`), error (`ErrorState`) y
vacío (mensajes específicos como "Todavía no perteneces a ningún proyecto"). Los formularios
muestran errores de validación devueltos por la API (extraídos del cuerpo de la respuesta de DRF)
en vez de mensajes genéricos.

## Docker

`docker-compose.yml` en la raíz levanta los tres servicios:

- `db`: PostgreSQL 16, con healthcheck (`pg_isready`) — `backend` espera a que la base esté lista
  antes de arrancar (`depends_on: condition: service_healthy`).
- `backend`: imagen basada en `python:3.12-slim`, corre `migrate --noinput` y luego `gunicorn` al
  arrancar el contenedor. La configuración (DB, `SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`,
  `CORS_ALLOWED_ORIGINS`) viene 100% de variables de entorno — el mismo `settings.py` sirve para
  desarrollo local y para Docker sin cambios de código.
- `frontend`: build multi-stage — Node compila el bundle de Vite (`VITE_API_URL` se inyecta como
  build arg, ya que Vite resuelve `import.meta.env` en tiempo de build, no en runtime) y Nginx sirve
  los archivos estáticos con fallback a `index.html` para las rutas de React Router.

Variables de entorno documentadas en `.env.example` (raíz). Verificado extremo a extremo: build de
ambas imágenes, arranque de los tres contenedores, headers CORS correctos entre `frontend` (origen
`http://localhost:5173`) y `backend`, y fallback de SPA para rutas profundas (`/projects/1/tasks`
devuelve `200` con `index.html`, no `404`).

**Sin defaults de credenciales en el código versionado:** la primera versión de `docker-compose.yml`
usaba `${DB_PASSWORD:-jira_pass}` (sintaxis de "valor por defecto" de Compose) para variables
sensibles — esto es cómodo para desarrollo local, pero significa que un valor con forma de
credencial real queda escrito en un archivo versionado y visible en el repositorio público de
GitHub, aunque sea un placeholder. Se cambió a `${DB_PASSWORD:?mensaje}` (variable *requerida*): si
falta `.env`, Compose falla de inmediato con un mensaje explicando qué copiar, en vez de arrancar
silenciosamente con un valor implícito. Se aplicó el mismo criterio en `config/settings.py`
(`SECRET_KEY`, credenciales de base de datos) vía un helper `require_env()` que lanza
`ImproperlyConfigured` con instrucciones si la variable no está definida — `DEBUG`, `ALLOWED_HOSTS`
y `DB_PORT` conservan un default razonable porque no son datos sensibles.

## Arquitectura

### 1. ¿Cómo escalarías este sistema?

- **Horizontal antes que vertical**: tanto `backend` como `frontend` son *stateless* (la sesión
  vive en el JWT, no en memoria del servidor), así que escalar es levantar más réplicas del
  contenedor `backend` detrás de un load balancer — no requiere cambios de arquitectura.
- **Separar la base de datos** del contenedor a un servicio administrado (RDS, Cloud SQL) apenas se
  salga de un entorno de prueba, con réplicas de lectura para las queries pesadas del dashboard
  (las dos queries SQL manuales son buenas candidatas para apuntar a un réplica de solo lectura).
- **Mover el registro de actividad a un modelo asíncrono** (cola tipo Celery/Redis o un
  event bus) si el volumen de escritura creciera mucho: hoy cada `Activity.objects.create()` ocurre
  síncronamente dentro del signal, bloqueando la respuesta del request original.

### 2. ¿Dónde implementarías caching?

- **Dashboard (`GET /api/dashboard/`)**: es el candidato más claro, ya que agrega datos de todos
  los proyectos del usuario en cada request. Cachear por usuario con un TTL corto (30-60s) en Redis
  reduciría drásticamente la carga en las dos queries SQL manuales sin afectar mucho la frescura
  percibida (ver también "vistas materializadas" en la sección PostgreSQL).
- **Lista de proyectos y miembros**: cambian con poca frecuencia comparado con tareas/comentarios;
  son buenos candidatos para cache con invalidación explícita en el `ViewSet` (`cache.delete()` en
  `create`/`update`) en vez de solo TTL.
- **En el frontend**, TanStack Query ya actúa como cache de cliente (evita refetch innecesario al
  navegar entre pestañas ya visitadas); el siguiente paso natural sería `staleTime` por tipo de
  recurso (ej. proyectos: unos minutos; actividad: segundos) en vez del default actual (`0`).

### 3. ¿Cómo manejarías concurrencia?

- **Optimistic locking** en `Task` (un campo `version` o comparar `updated_at`) para el caso de dos
  usuarios editando la misma tarea al mismo tiempo — hoy el último `PATCH` gana silenciosamente.
- Las operaciones que ya son transaccionales (creación de proyecto + membership, creación/edición
  de tarea) siguen siendo correctas bajo concurrencia porque usan `transaction.atomic()`, pero no
  previenen *lost updates* en ediciones concurrentes del mismo recurso — eso requeriría locking
  explícito (`select_for_update()`) o los headers condicionales de HTTP (`If-Match` con ETag).
- Para el contador de actividad/dashboard bajo alta escritura concurrente, agregaciones a nivel de
  base de datos (`COUNT`, `AVG` ya usados) son inherentemente consistentes porque PostgreSQL
  garantiza aislamiento de transacciones — el riesgo de concurrencia está en la escritura de
  recursos individuales (tareas, comentarios), no en las lecturas agregadas.

### 4. ¿Qué mejorarías del diseño actual?

- Invitación real por correo electrónico (con token de invitación y registro directo) para
  colaboradores que todavía no tienen cuenta — hoy `POST /api/projects/{id}/members/` solo permite
  agregar usuarios que ya existen en el sistema (ver punto 17 de Modelado de datos).
- Mover el filtrado por membresía del dashboard de Python a SQL (documentado como simplificación
  consciente en la sección PostgreSQL).
- `Task.created_by` con `on_delete=PROTECT` en vez de `CASCADE`, para nunca perder autoría
  histórica de tareas.
- Registrar explícitamente qué usuario ejecutó un cambio de estado en `Activity` (hoy se infiere
  como `assignee or created_by`, no necesariamente quien hizo el `PATCH`).
- Tests automatizados de extremo a extremo (hoy la verificación fue manual + Playwright ad-hoc
  durante el desarrollo, documentada en este README, pero no forma parte del repositorio como suite
  de CI).

---

## Progreso

### ✅ Completado (Día 1 — Modelado + setup)

- Entorno de desarrollo: PostgreSQL vía Docker, entorno virtual, dependencias instaladas
- Proyecto Django creado con estructura `apps/` (package by feature)
- Modelo `User` custom (`AbstractUser` + email único)
- Modelo `Project` + `ProjectMember` (con rol y unicidad de membresía)
- Modelo `Task` (choices, índices, campos de fecha diferenciados)
- Modelo `Comment` (preservación de historial vía `SET_NULL`)
- Modelo `Activity` + primer signal (`task_created`)
- Todas las migraciones aplicadas y verificadas contra PostgreSQL real

### ✅ Completado (Día 2 — CRUD completo + permisos + auth + signals)

- Serializers de lectura/escritura para `Project`, `Task`, `Comment` (patrón read/write split)
- `UserSummarySerializer` compartido para representación anidada de usuario en otras entidades
- Validación cross-field en `TaskWriteSerializer`: el `assignee` debe ser miembro del proyecto — probada con evidencia real (rechaza con `400` a un usuario no miembro)
- Permission classes diferenciadas por entidad: `IsProjectMember`, `IsTaskProjectParticipant`, `IsCommentProjectParticipant`
- `ProjectViewSet`, `TaskViewSet`, `CommentViewSet` — CRUD completo y funcional para las tres entidades, cada uno con queryset filtrado por membresía, `create()`/`update()` corregidos para responder con el serializer de lectura
- Autenticación JWT completa: registro (`/api/auth/register/`), login (`/api/auth/login/`), refresh (`/api/auth/login/refresh/`)
- Passwords hasheados vía `create_user()` + validación estándar de Django (`validate_password`)
- Signal `task_status_changed` resuelto vía `pre_save` + `post_save` (compara status anterior vs nuevo)
- Signal `comment_added` implementado
- Flujo completo probado de punta a punta con evidencia real: registro → login → creación de proyecto (con membership automática) → creación de tarea → validación de assignee inválido rechazada → cambio de status → creación de comentario → los tres signals de `Activity` confirmados directamente contra la base de datos

### ✅ Completado (Día 3 — Queries SQL + dashboard)

- `completed_at` se llena y limpia automáticamente vía signal cuando `status` cambia hacia/desde `"done"` — verificado en shell con evidencia real de timestamp
- Query SQL manual A (top 5 usuarios completadores por proyecto, con `ROW_NUMBER() OVER PARTITION BY`) — implementada y verificada
- Query SQL manual B (promedio de tiempo de finalización por proyecto, con `EXTRACT(EPOCH...)`) — implementada y verificada
- Endpoint `GET /api/dashboard/` — expone ambas queries filtradas por membresía del usuario autenticado, probado end-to-end con Postman (`200 OK`)
- Datos de prueba realistas generados (4 usuarios, 11 tareas completadas con tiempos variados) para validar que el ranking y el promedio reflejan datos reales, no un caso trivial
- Sección PostgreSQL del README documentada (queries, justificación de indexación, estrategia de optimización)

### ✅ Completado (Día 4 — Reorganización, frontend, Docker)

- Repositorio reorganizado en `backend/` y `frontend/` como proyectos independientes
- Endpoint `GET /api/activity/` (faltaba: la app existía con signals pero sin serializer/vista/url) — solo lectura, filtrable por proyecto/acción/usuario
- `django-cors-headers` configurado para que el frontend (otro origen) pueda consumir la API
- Paginación y filtrado (`django-filter`) activados globalmente en DRF; `filterset_fields` por entidad
- `RegisterSerializer` extendido para pedir Nombre en vez de username (login funciona con correo, ver punto 14 de Modelado de datos)
- Corrección: `TaskViewSet.update()` no reflejaba `completed_at` recién calculado por el signal en la respuesta del `PATCH`
- Frontend React + TypeScript completo (Vite, React Router, TanStack Query, Axios): login/registro, lista de proyectos, dashboard, kanban de tareas con filtros y comentarios, actividad — diseño visual importado desde un mockup propio en claude.ai/design
- Dockerización completa: `Dockerfile` para backend (gunicorn) y frontend (build de Vite + Nginx), `docker-compose.yml` orquestando `db` + `backend` + `frontend`, verificado extremo a extremo (build, arranque, CORS, fallback de SPA)
- Sección de arquitectura del README respondida (escalabilidad, caching, concurrencia, mejoras)
- Invitar/quitar miembros de un proyecto (`POST`/`DELETE /api/projects/{id}/members/`, solo admins) + modal de miembros en el frontend — verificado con dos usuarios reales en navegadores separados (invitación, permisos de no-admin rechazados, el invitado ve el proyecto al iniciar sesión)
- Corrección: condición de carrera en `/api/auth/register/` (dos registros concurrentes con el mismo correo producían un `500` sin capturar en vez de un `400`), reproducida con requests verdaderamente concurrentes y corregida