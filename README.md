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

#### 6. `status` y `priority` con `choices`, no cadenas libres

Se usó el mecanismo de `choices` de Django (equivalente a un `enum` a nivel de aplicación) en vez de `varchar` libre, para evitar valores inconsistentes en la base de datos (ej. "Done" vs "done" vs "completed") y facilitar validación automática vía DRF serializers.

#### 7. Registro de actividad desacoplado vía signals

En vez de llamar explícitamente `Activity.objects.create()` dentro de cada vista que modifica una tarea, se usó el sistema de `signals` de Django (`post_save`). Esto desacopla la app `activity` de `tasks`: cualquier punto de entrada que modifique una tarea (vista, admin, script, importación futura) genera su registro de actividad automáticamente, sin depender de que cada desarrollador recuerde agregar la llamada manual en cada lugar nuevo.

#### 8. Índices agregados desde el modelado

Se agregaron índices compuestos pensando en los patrones de consulta esperados del dashboard:

- `Task`: `(project, status)` — acelera "tareas de este proyecto por estado"
- `Task`: `(assignee, status)` — acelera "tareas de este usuario por estado", base de la query de "top usuarios con más tareas completadas"
- `Activity`: `(project, -created_at)` — acelera la consulta de historial más reciente por proyecto

*(La justificación completa de indexación, con explicación de por qué cada índice acelera qué query específica, se desarrollará en la sección de PostgreSQL del README, junto con las queries SQL obligatorias.)*

#### 9. Normalización

El modelo está normalizado a 3FN: no hay campos derivados almacenados (ej. no se guarda un "total de tareas completadas" en `Project`, se calcula on-demand vía agregación SQL) y no hay duplicación de datos entre entidades. Esta decisión prioriza consistencia sobre performance de lectura; si el volumen de datos creciera significativamente, sería candidato a desnormalización selectiva (ver sección de mejoras posibles).

#### 10. Patrón de serializers separados por lectura/escritura (read/write split)

Cada entidad principal (`Project`, `Task`, `Comment`) tiene dos serializers: uno de lectura (`*Serializer`, con relaciones anidadas resumidas — ej. `UserSummarySerializer`) y uno de escritura (`*WriteSerializer`, con relaciones como IDs planos vía `PrimaryKeyRelatedField` o campos explícitos). Esto evita dos problemas: sobreexponer campos internos del modelo `User` en las respuestas, y forzar al cliente a mandar objetos anidados completos cuando solo necesita referenciar un ID existente.

Campos como `created_by` (`Project`) o `user` (`Comment`) están **excluidos deliberadamente** de los serializers de escritura — se asignan en el `ViewSet` a partir de `request.user`, nunca confiando en lo que el cliente mande en el body, para evitar que un usuario pueda crear recursos "a nombre de" otro.

**Nota de implementación:** los `ViewSet` con este patrón sobrescriben `create()` (y deben hacerlo también en `update`/`partial_update`) para serializar la respuesta con el serializer de **lectura** sobre la instancia ya guardada — el comportamiento default de DRF usaría el serializer de escritura también para el output, devolviendo una respuesta incompleta (sin `id`, sin relaciones anidadas).

#### 11. Autorización en dos capas: queryset filtrado + permission class

El control de acceso "solo miembros ven proyectos" se implementa en dos capas complementarias, no una sola:

- **`get_queryset()` filtrado** (`Project.objects.filter(members__user=request.user)`): es la primera línea de defensa y la única forma correcta de cubrir `list` — un endpoint de listado no tiene un objeto individual sobre el cual evaluar permisos, así que la restricción debe vivir en la consulta misma, nunca en un filtrado posterior en memoria.
- **`IsProjectMember.has_object_permission()`**: cubre `retrieve`, `update`, `destroy` — casos donde ya existe un objeto específico cargado. Diferencia lectura de escritura: cualquier miembro puede ver, solo miembros con `role="admin"` pueden modificar/eliminar.

#### 12. Creación de proyecto como operación transaccional

`ProjectViewSet.create()` envuelve en `transaction.atomic()` la creación del `Project` **y** de su `ProjectMember` inicial (el creador, con `role="admin"`) en una sola unidad — si cualquiera de las dos falla, ninguna se persiste. Sin esto, sería posible terminar con un proyecto huérfano sin ningún admin asignado.

#### Posibles mejoras / alternativas consideradas

- `Task.created_by` podría usar `PROTECT` en vez de `CASCADE` para nunca perder autoría histórica de tareas.
- Para dashboards de alto tráfico, se podría introducir una tabla de agregados precalculados (ej. contador de tareas completadas por usuario/proyecto), actualizada vía signal o tarea asíncrona, en vez de calcular siempre on-the-fly.
- `Activity.metadata` como `JSONField` da flexibilidad para distintos tipos de evento sin migración, pero sacrifica la capacidad de indexar o validar su contenido a nivel de base de datos — trade-off consciente entre flexibilidad y rigidez de esquema.

---

## Progreso

### ✅ Completado (Día 1 — Modelado + setup)

- Entorno de desarrollo: Postgres vía Docker, entorno virtual, dependencias instaladas
- Proyecto Django creado con estructura `apps/` (package by feature)
- Modelo `User` custom (`AbstractUser` + email único)
- Modelo `Project` + `ProjectMember` (con rol y unicidad de membresía)
- Modelo `Task` (choices, índices, campos de fecha diferenciados)
- Modelo `Comment` (preservación de historial vía `SET_NULL`)
- Modelo `Activity` + sistema de signals para logging automático de creación de tareas
- Todas las migraciones aplicadas y verificadas contra Postgres real

### ✅ Completado (Día 2 — CRUD core + permisos + auth)

- Serializers de lectura/escritura para `Project`, `Task`, `Comment` (patrón read/write split)
- `UserSummarySerializer` compartido para representación anidada de usuario en otras entidades
- Validación cross-field en `TaskWriteSerializer`: el `assignee` debe ser miembro del proyecto de la tarea
- `IsProjectMember`: permission class con lectura para cualquier miembro, escritura solo para admins
- `ProjectViewSet` completo: queryset filtrado por membresía, `create()` transaccional (proyecto + membership admin en una sola operación), respuesta correcta con serializer de lectura
- Autenticación JWT completa: registro (`/api/auth/register/`, devuelve usuario + tokens), login (`/api/auth/login/`), refresh (`/api/auth/login/refresh/`)
- Passwords hasheados vía `create_user()` + validación estándar de Django (`validate_password`)
- Flujo completo probado de punta a punta: registro → login → creación de proyecto autenticada → listado filtrado por membresía

### ⏳ Pendiente

- Resolver signal de `task_status_changed` (comparar status anterior vs nuevo)
- Signal de `comment_added`
- ViewSets de `Task` y `Comment`
- Queries SQL manuales (top 5 usuarios, promedio de tiempo de finalización)
- Endpoint de dashboard agregado
- Frontend React + TypeScript
- Dockerización completa (backend + frontend + Postgres)
- Sección de arquitectura (escalabilidad, caching, concurrencia)