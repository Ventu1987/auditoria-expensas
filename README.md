# Auditoría de expensas

Planilla de Google + app web (GitHub Pages) para controlar cada liquidación de expensas que manda la administración.
Hoy tiene Senderos II y La Huella; Senderos I se suma cuando se cargue su primera liquidación.

## Qué hace

- **Cargar expensa:** subís el PDF de AdminProp. La app lo lee en el navegador, controla que el documento cierre (rubros, flujo, banco, patrimonio, pendientes), muestra las novedades contra el mes anterior y sugiere correcciones. Revisás y confirmás: los datos van a la planilla y el PDF a Drive.
- **Comprobantes:** a cada gasto le subís su factura, extracto o presupuesto. El tipo de respaldo (completo, parcial, no fiscal, solo citado, nada) se calcula solo.
- **Corregir y comentar:** la liquidación correcta (importe que corresponde a cada gasto y por qué), la probabilidad y el estado de cada observación, la cronología y las notas al pie.
- **Pestañas de análisis:** Resumen (de los gastos a la cuota), Matriz de riesgo, Acumulado y proyección, un rubro por pestaña, Flujo de fondos, Respaldo documental, Consolidado entre barrios, Ahorros posibles, Pedido de documentación y Cronología.
- **Excel y PDF:** el botón Excel descarga todas las pestañas en un libro; PDF imprime la pestaña abierta.

## Reglas

- Exactitud: importes en centavos enteros. N/D si falta; REVISAR si es dudoso.
- Privacidad: no se guardan nombres de propietarios, padrón ni deuda por lote. CUIT de personas físicas enmascarados (salvo el del administrador). Los nombres de la propiedad `NOMBRES_PRIVADOS` se reemplazan al guardar.
- Los PDF de liquidación **nunca** se suben al repositorio (tienen el padrón).
- Las observaciones son indicadores, no acusaciones.
- Costo $ 0.

## Estructura

```
apps-script/Code.gs, Esquema.gs   planilla y API (Google Apps Script)
src/data/esquema.ts               hojas y columnas (fuente de Esquema.gs: npm run esquema)
src/parser/                       lector del PDF de AdminProp
src/data/cargar.ts                del PDF a filas de la planilla, correcciones y novedades sugeridas
src/data/migracion.ts             arma los datos iniciales (+ scripts/semilla/semilla.json)
planilla/Planilla_inicial_auditoria.xlsx   la planilla de datos ya cargada, para subir a Google Drive (python3 scripts/planilla_inicial.py)
src/motor/                        análisis: resumen, rubros, flujo, acumulado, respaldo, matriz, ahorros…
src/vistas/tablas.ts              cada pestaña como tablas (las usa la pantalla y el Excel)
src/data/copia.json               copia de respaldo (npm run copia)
tests/                            pruebas al centavo con las cifras reales
```

## Comandos

```
npm install
npm run dev        app en http://localhost:5173
npm test           pruebas (las del PDF corren solo si tenés los PDF en tests/pdf, que no se suben)
npm run build      versión para GitHub Pages
npm run esquema    regenera apps-script/Esquema.gs
npm run copia      regenera la copia de respaldo desde tests/S2.json
```

La instalación paso a paso está en [INSTALACION.md](INSTALACION.md).
