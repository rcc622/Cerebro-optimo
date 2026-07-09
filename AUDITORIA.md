# Auditoría · Cerebro Óptimo

**Fecha:** 2026-07-09 · **Alcance:** `index.html` (2,930 líneas: CSS, HTML y JS completos), `sw.js`, `img/`, estructura del repo.
**Método:** lectura completa del código con verificación línea por línea; solo se incluyen hallazgos confirmados con referencia al código.

> **Estado (2026-07-09): CORREGIDO en esta misma rama.**
> ✅ Resueltos: A1-A8 completos · M1, M3-M9, M10, M11, M12, M16, M17 · M2 y M13 parciales (recordatorios se re-agendan al volver a la app; Escape cierra modales) · B1, B2, B6, B7, B8, B9.
> ⏳ Pendientes (decisiones de diseño, no bugs): M14 (consolidar la cascada de overlays de celebración), M15 (deduplicar logros en Hoy y unificar offsets semanales), B3 (visualViewport con teclado iOS), B4 (render incremental), M13 completo (focus-trap con `<dialog>`).
> Verificación: 23 checks de humo con Playwright/Chromium + prueba offline real (la app abre y opera sin conexión). Las referencias de línea de este documento corresponden al código *antes* de las correcciones.

---

## Resumen ejecutivo

La app está bien construida para ser un solo archivo: el manejo de fechas locales es correcto (sin bugs de zona horaria), el texto del usuario se escapa contra XSS en el flujo normal, y las semanas pasadas están protegidas contra edición accidental. Sin embargo hay **3 problemas críticos que contradicen su propósito de app diaria instalada**: no funciona offline, todo el progreso vive solo en `localStorage` con fallos silenciosos, y varios sistemas de gamificación tienen bugs que hacen recompensas inalcanzables o pierden XP (cofre semanal, racha matinal, medallas que se reinician cada 1 de enero). En UX, el principal costo es accesibilidad (zoom bloqueado, controles que no son botones, textos de 8-9px) y 11 MB de imágenes PNG.

**Totales: 8 hallazgos de severidad ALTA · 17 MEDIA · 10 BAJA.**

---

## Severidad ALTA

### A1 · La app no funciona offline en absoluto
`sw.js:42-44` — El service worker sirve HTML/JS "siempre red, sin caché" y devuelve una `Response` vacía con 503 sin conexión; solo las imágenes son cache-first. Una PWA instalada abierta sin internet muestra pantalla en blanco — rompe el caso de uso principal de un tracker diario.
**Recomendación:** *stale-while-revalidate* para el shell (servir caché al instante, actualizar en segundo plano, avisar con toast "Nueva versión disponible"). El `controllerchange`+`reload` existente (`index.html:2636-2639`) encaja con esa estrategia y elimina el riesgo de "quedarse atrapado en versión vieja" que motivó el diseño actual.

### A2 · Persistencia solo en localStorage, con fallos 100% silenciosos
`index.html:1105,1121` — `load()`/`save()` tragan todas las excepciones con `catch` vacíos. Con localStorage lleno (QuotaExceeded) el usuario sigue marcando hábitos sin que nada persista y sin aviso; con JSON corrupto, `load()` arranca vacío y el primer `save()` sobreescribe el blob — pérdida total silenciosa.
**Recomendación:** avisar al usuario cuando `save()` falla; respaldar el blob corrupto antes de sobreescribir; llamar `navigator.storage.persist()`.

### A3 · Importación de backup sin validación → XSS almacenado y estado corrupto
`index.html:2546-2562` — `importProfile()` solo verifica que existan `data.d` y `data.s`; no valida tipos ni esquema y guarda de inmediato. Un backup manipulado/corrupto puede: (a) inyectar HTML — `s.reminderTime`, fechas de logros y campos de misiones (`type`, `goal`, `xp`) se interpolan en `innerHTML` sin `escH` (`2402-2403`, `1959-1963`, `2010`, `2716`); (b) inflar XP sin límite vía `_missionBonus`/`_nocheLibreBonus` (a diferencia de `chest_*`, que sí se valida en `1270-1273`); (c) persistir estado corrupto. Además no re-ejecuta la migración de `phaseHistory` ni re-agenda notificaciones tras importar (`2555-2557`).
**Recomendación:** validar esquema y tipos al importar, sanear todos los campos interpolados, y re-correr migraciones + `checkAchievements()` + `scheduleR()` tras restaurar.

### A4 · El Cofre Semanal se pierde si el domingo no llega al 100%
`index.html:1381-1394,1435` — El cofre solo se evalúa dentro de `closeDayComplete()` (que requiere día al 100%) y `checkWeekComplete()` solo mira la semana de `monday(todayStr())`. Una semana con 7 días activos y promedio ≥60% pero domingo al 90% jamás recibe cofre; el lunes ya apunta a la semana nueva y el cofre anterior se pierde permanentemente (50-350 XP).
**Recomendación:** evaluar el cofre de la semana anterior en cada arranque/render, no solo al cerrar el modal de día completo.

### A5 · La racha matinal y el logro `morning7` son inalcanzables desde 2026-04-21
`index.html:1311-1321` (con `504-506`, `1524`) — `morningStreakDays()` no filtra por `retiredOn` ni `workdayOnly`: exige `isDone` de `listo7am` (hábito jubilado, sin tarjeta en la UI) y de `p7am` también en fines de semana (donde no se muestra). La racha matinal queda en 0 para siempre.
**Recomendación:** aplicar los mismos filtros de vigencia (`retiredOn`, `workdayOnly`) que usa la vista diaria.

### A6 · Las medallas de retos y maestría se reinician cada 1 de enero
`index.html:1483,2180,2195` — `challengeWeekCount()`, `habitMasteryWeeks()` y `waterMasteryWeeks()` solo iteran los lunes del año en curso. El 1 de enero todo el progreso bronce/plata/oro vuelve a 0 en silencio y la semana que cruza el año nunca cuenta; las misiones re-clasifican retos "DEFENDER" como "DOMINAR" al perder su maestría.
**Recomendación:** iterar desde la primera fecha con datos (o una ventana móvil de 52 semanas), no desde el 1 de enero.

### A7 · Sin manifest real ni iconos: instalabilidad frágil
`index.html:2641` — No existe `manifest.json`; se inyecta en runtime como blob URL. `start_url:'.'` se resuelve contra la URL `blob:` (puede invalidar la instalación en Chrome) y el único icono es un SVG data-URI con emoji (`sizes:'any'`) — no hay PNG 192/512 ni `apple-touch-icon` (en iOS el icono será una captura genérica).
**Recomendación:** crear `manifest.json` estático con iconos PNG 192/512 (+ maskable) y `<link rel="manifest">` + `<link rel="apple-touch-icon">` en el `<head>`.

### A8 · Zoom bloqueado y controles no accesibles
`index.html:5` — `user-scalable=no` bloquea el zoom (WCAG 1.4.4), grave combinado con textos de 8-10px. Además casi todo lo interactivo son `<div>` clicables, no botones: tarjetas de hábito, burbujas de agua, pasos del protocolo y los 4 overlays de pantalla completa (`2107`, `2037`, `2065`, `2096`, `402-449`); solo hay 3 `aria-label` en todo el archivo. Nada es operable por teclado ni se expone a lectores de pantalla.
**Recomendación:** quitar `user-scalable=no`; usar `<button>` (o `role="button"` + `tabindex` + Enter/Espacio) con `aria-pressed` para el estado marcado.

---

## Severidad MEDIA

### Lógica y datos

**M1 · Meta de agua incoherente entre fases** — `2195-2199`: `waterMasteryWeeks()` aplica la meta de la fase *actual* a todas las semanas históricas: al cambiar de fase la medalla de hidratación retrocede. Relacionado: `1904`, `2015-2016`, `2034`, `2130` usan `wg()` (fase actual) mientras `dayRate()` usa `wg(fecha)` (`1210`) — al editar un día de otra fase las píldoras no cuadran con el %, y `calcXP` premia botellas de más (`Math.min(d.agua,7)*3`, `1251`).

**M2 · Recordatorios congelan datos al agendar** — `2574-2607`: `scheduleR()` fija racha y % del día *al momento de agendar* y la vía `TimestampTrigger` es de un solo disparo. Si abres la app en la mañana, la advertencia de racha nunca se agenda (racha calcula 0); si la abres después de la hora, se agenda para mañana con datos de hoy; tras dispararse no se re-agenda salvo que se abra la app.

**M3 · La racha del header muestra 0 cada mañana** — `1294-1297` vs `1441-1445`: `calcStreakDays()` cuenta desde hoy (rompe si aún no marcas nada), mientras `sleepHabitsStreak()` arranca desde ayer explícitamente para evitar ese problema. Criterio inconsistente: el header, el share card y los datos curiosos muestran racha 0 hasta el primer check del día.

**M4 · Bono de día completo no se revierte** — `1419-1420` (con `1268`): `_streakBonus` se escribe al tocar 100% y nunca se revierte; si desmarcas después, el día conserva el bono y además bloquea el +10 de "día ≥80%" para siempre.

**M5 · El candado de semanas pasadas bloquea por estado de vista, no por fecha** — `1766`, `1779`, `1811`, `1829`: con la vista Hoy navegada a una semana pasada, los quick-marks de misiones y del tab Ejercicio — que operan sobre *hoy* — se rechazan con "🔒 Toca ✏️ para editar esta semana".

**M6 · Retos nuevos mal clasificados por dominio** — `1051-1065`: `HABIT_DOM` no incluye los 11 retos añadidos el 2026-04-21; `habDom()` los manda a "Fundamentos", inflando `domainProgress('fundamentos')` y su resumen.

**M7 · "Misiones cualquier día" inconsistente** — `1954` vs `2359`: el quick-mark de misiones no filtra `workdayOnly`/`weekendOnly` (deliberado), pero el mismo botón en el tab Ejercicio sí bloquea por día. Un reto `weekendOnly` marcado un miércoles queda invisible en la vista diaria y sin lugar donde desmarcarlo.

**M8 · Transición de fases de creatina no acredita tiempo real** — `1741-1746`: `checkUnlock()` solo corre en interacciones, avanza una fase por llamada y cada transición reinicia `phaseStart=hoy`. Quien pasa 70 días en fase 2 sin abrir la app pasa a fase 3 con reloj en 0 y espera 56 días extra. Además en el día de una transición, `calcXP` cuenta checks de dos hábitos de creatina a la vez (doble XP + doble auto-link de agua) (`1243-1249`).

**M9 · Se pueden marcar días futuros** — `1929`, `2432`, `1799`: el selector incluye días futuros de la semana actual y `toggle()`/`setWater()` no tienen guarda de fecha futura: XP inmediato e inflación de `weekRate`, misiones y cofre (`challengeWeekThisWeek` cuenta futuros, `1496-1499`).

### UX / accesibilidad / rendimiento

**M10 · 10.9 MB de PNG** — 6 infografías de 1.7-1.9 MB c/u que el SW cachea completas. Convertir a WebP con ancho máx. ~1080px (~150-300 KB c/u, ~90% menos).

**M11 · Objetivos táctiles bajo 44px** — `.wpill` 38px, `.m-quick` 26px, `.mchk` 20px, `.hmcell` 13×13px clicable, `.tipbtn` ~23px (`70`, `133`, `240`, `323`, `63`). Ampliar área táctil a 44×44 con padding o pseudo-elemento.

**M12 · Texto diminuto de baja opacidad sobre navy** — `.hdr-lbl` 8.5px op .6, `.hdr-eyebrow` 9px op .5, "toca para continuar" 11px al 35-40% (`20`, `25`, `35`, `183`, `192`, `206`, `230`): contraste muy por debajo de 4.5:1. Mínimo opacidad .75 y ≥11px.

**M13 · Modales sin gestión de foco** — `402-479`, `2730`, `2890`: sin `role="dialog"`, `aria-modal`, trampa de foco, Escape ni devolución de foco. Usar `<dialog>` nativo (`showModal()` da todo gratis).

**M14 · Cascada de hasta 4 overlays de celebración encadenados** — `1424`, `1469`, `1393-1394`: día completo → noche libre → cofre → level-up, cuatro takeovers consecutivos por `setTimeout`, más el multiplicador aleatorio de "día de la suerte". Consolidar en una sola pantalla resumen; documentar "noche libre" fuera de su propio overlay.

**M15 · UI duplicada** — la vista Hoy incluye una sección completa de logros que duplica la pestaña Logros (`1994-2011`); nivel/XP aparece en 3 lugares; dos sistemas paralelos de navegación semanal con offsets independientes (`EOFF`/`WOFF`).

**M16 · Prompt de backup diario e insistente** — `1805-1807`: modal de pantalla completa 800ms después de marcar "agua" cada día, se re-dispara al desmarcar/remarcar, sin registro de fecha de último backup. Guardar `lastBackupDate` y pedir máx. 1 vez/semana.

**M17 · Banner "Instalar como app" enterrado en Config** — `2389`, `2522`: última pestaña de 6; un usuario nuevo nunca lo ve. Mostrar banner dismissible en Hoy al capturar `beforeinstallprompt`.

---

## Severidad BAJA

**B1** · `2348`: el estado vacío de infografía muestra mensaje de desarrollador ("Súbela como rutina-x.png") al usuario final.
**B2** · Fuentes de 8-9px por toda la CSS (`.mlbl` 8px y ~9 clases más); suelo razonable: 10-11px.
**B3** · `15-17`, `44`: layout `100dvh` correcto para iOS, pero falta manejar `visualViewport.resize` cuando el teclado abre sobre los textareas del modal de bitácora.
**B4** · `1887`: `render()` reconstruye toda la app con `innerHTML` en cada interacción — funciona a esta escala pero destruye foco y estado del DOM.
**B5** · HTML monolítico de 193 KB re-descargado en cada arranque (se resuelve junto con A1).
**B6** · `1245` + `507-514`: comentario de `calcXP` dice "5 XP" pero `p7am` tiene 6 sub-pasos → 6 XP; el tip habla de "5 micro-pasos".
**B7** · `1257-1268`: el +10 XP diario usa agua todo-o-nada mientras `dayRate` da crédito parcial; un día al 82% en UI puede no recibir el +10.
**B8** · `1647`: `comebackFrom` solo se fija una vez; una caída posterior desde 50+ días no lo actualiza y `comeback50` puede quedar inalcanzable.
**B9** · `2554` está bien (confirm antes de importar), pero tras importar no se refresca nada más (ver A3).
**B10** · `-webkit-tap-highlight-color:transparent` global elimina feedback nativo (mitigado por animaciones propias — aceptable, documentado).

---

## Lo que está bien (verificado)

- **Fechas locales correctas:** no hay `toISOString()`; `todayStr`/`fmt`/`shift`/`monday` usan fecha local con ancla `T12:00:00` (`1084-1090`) — sin off-by-one por zona horaria ni DST.
- **XSS en flujo normal cubierto:** notas de bitácora y "mi por qué" pasan por `escH()` en todos los puntos de render (`1853`, `2104`, `2397`).
- La validación de `chest_*` en `calcXP` (`1270-1273`) está bien hecha.
- Navegación inferior y selector de día usan `<button>` reales; quick-mark de misiones tiene `aria-label`.
- Las semanas pasadas piden candado explícito antes de editar (`1766`, `1779`) y el import de backup pide `confirm()`.
- El fallback de rutina en texto del tab Ejercicio existe y es colapsable.

---

## Orden de ataque sugerido

1. **Datos a salvo primero:** A2 (fallos silenciosos de save) + A3 (validar import) + M16 (backup menos molesto, con fecha).
2. **Offline + instalación:** A1 (cachear shell) + A7 (manifest/iconos reales) + M10 (WebP) — juntas convierten la app en una PWA de verdad.
3. **Bugs de recompensas:** A4 (cofre), A5 (racha matinal), A6 (reset anual), M3 (racha 0 en la mañana), M4 (bono no revertido).
4. **Accesibilidad:** A8 + M11 + M12 + M13.
5. **Pulido UX:** M14, M15, M17, bajas.
