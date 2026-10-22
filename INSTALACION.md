# Instalación paso a paso

Todo gratis. Tiempo estimado: 40 minutos. Se hace una sola vez. La guía con más detalle está en el documento "Auditoría de expensas · paso a paso".

## 1. La planilla nueva (Google Sheets + Apps Script)

1. Subí `planilla/Planilla_inicial_auditoria.xlsx` a Google Drive, abrila y hacé **Archivo → Guardar como Hojas de cálculo de Google**. Llamala **"Auditoría de expensas · datos"**. Ya trae todos los datos: no hay que migrar nada.
2. **Extensiones → Apps Script.** Borrá lo que haya en `Código.gs` y pegá el contenido de `apps-script/Code.gs`.
3. Tocá **+ → Secuencia de comandos**, llamala `Esquema` y pegá el contenido de `apps-script/Esquema.gs`. Guardá.
4. Arriba elegí la función **prepararPlanilla** y tocá **Ejecutar**. Aceptá los permisos (planilla y Drive). No borra nada: da formato a los encabezados y crea una carpeta de Drive "Auditoría de expensas · archivos".
5. **Configuración del proyecto (⚙) → Propiedades del script → Agregar propiedad:**

   | Propiedad | Valor |
   |---|---|
   | `CLAVE_ADMIN` | una clave larga para vos (migrar y todo) |
   | `CLAVE_S2` | la clave del auditor de Senderos II |
   | `CLAVE_LH` | la clave del auditor de La Huella |
   | `CLAVE_S1` | la de Senderos I, cuando haya |
   | `NOMBRES_PRIVADOS` | nombres que nunca se publican, separados por coma (por ejemplo la empleada excluida) |

6. **Implementar → Nueva implementación → ⚙ Aplicación web.** Ejecutar como: **yo**. Quién tiene acceso: **cualquier persona**. Copiá la URL que termina en `/exec`.

Cada vez que cambies el código: **Implementar → Administrar implementaciones → ✏ → Versión: nueva → Implementar** (la URL no cambia).

## 2. La app (GitHub Pages)

1. En GitHub creá el repositorio **auditoria-expensas** (público para que Pages sea gratis; no tiene datos sensibles).
2. Subí todos los archivos de esta carpeta (**uploading an existing file**). **No subas PDF de liquidaciones.** La carpeta `.github` suele estar oculta: creá `.github/workflows/deploy.yml` a mano (**Add file → Create new file**) y pegá su contenido.
3. **Settings → Secrets and variables → Actions → Variables → New repository variable:** nombre `VITE_API`, valor la URL del paso 1.6.
4. **Settings → Pages → Source: GitHub Actions.**
5. **Actions →** esperá que termine "Publicar en GitHub Pages". La dirección queda `https://TU-USUARIO.github.io/auditoria-expensas/`.

Si las pruebas fallan, la app no se publica: es a propósito.

## 3. Cada mes, cuando llega la expensa

1. **Clave** del barrio → **Cargar expensa** → elegí el PDF.
2. Mirá los **controles** (en rojo, lo que no cierra en el propio documento), las **novedades** y el **concepto** de cada gasto (si alguno dice "Otro (revisar)", elegí el correcto).
3. Marcá las **correcciones sugeridas** que quieras aplicar ya (las demás quedan para revisar).
4. **Confirmar y guardar.** Si el mes ya estaba, se reemplaza; lo corregido a mano se conserva.
5. **Comprobantes:** subí la factura o el extracto de cada gasto a medida que los consigas.
6. **Corregir y comentar:** ajustá la liquidación correcta, el estado de los reclamos y agregá lo que pasó a la cronología.
7. **Excel** para mandar el libro completo; **PDF** para imprimir una pestaña.

## Problemas comunes

| Pasa | Qué hacer |
|---|---|
| Arriba dice "Copia" | Falta `VITE_API` en GitHub o la planilla no está publicada para "cualquier usuario". |
| "Clave incorrecta" | Revisá la propiedad `CLAVE_<barrio>` (o usá la de administración). |
| "No parece una liquidación de AdminProp" | El PDF tiene otro formato. Pasámelo y ajusto el lector. |
| Un gasto dice "Otro (revisar)" | Elegí el concepto en la revisión. Para que lo reconozca solo, agregá una fila en la hoja `CONCEPTOS` con su `Patron`. |
| El workflow falla en "Pruebas" | Algún cambio movió una cifra verificada. Revisalo antes de publicar. |
