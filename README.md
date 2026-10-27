# CrisCodev – Dropi Product Analyzer

**Proyecto Autónomo e Independiente de Investigación Comercial, Auditoría de Catálogo y Persistencia de Dropi Chile.**

Desarrollado para auditar, importar, persistir y evaluar productos del catálogo de Dropi Chile de forma 100% independiente de las plataformas de producción (Shopify y Pancocos).

---

## 📁 Estructura del Proyecto

```
criscodev-dropi-product-analyzer/
├── README.md                         # Documentación técnica completa
├── package.json                      # Configuración de dependencias y scripts de ejecución
├── tsconfig.json                     # Configuración de TypeScript ES2022
├── requirements.txt                  # Requerimientos para el importador Python
├── .env.example                      # Plantilla de variables de entorno (BD, puertos, tokens)
├── .env                              # Archivo de entorno activo
├── importer/                         # Módulo del Importador Python
│   ├── __init__.py
│   └── dropi_importer.py             # Script CLI de extracción controlada y validación
├── migrations/                       # Esquemas y migraciones relacionales SQL
│   └── 001_create_dropi_analyzer_tables.sql
├── src/                              # Código fuente TypeScript
│   ├── index.ts                      # Entrada y exportaciones públicas
│   ├── server.ts                     # Servidor HTTP autónomo con Dashboard Web
│   ├── lib/
│   │   └── db.ts                     # Conector y pool seguro PostgreSQL
│   ├── services/
│   │   ├── dropiDb.ts                # Persistencia relacional con fallback local
│   │   └── dropiExcel.ts             # Generador de hojas de cálculo Excel (4 hojas)
│   └── data/                         # Almacenamiento local estructurado
│       ├── dropi_catalog.json        # Catálogo importado (50 productos de prueba)
│       ├── dropi_jobs.json           # Registro de auditoría de ejecuciones (Jobs)
│       ├── dropi_history.json        # Historial de cambios y observaciones
│       └── dropi_connection.json     # Estado de sesión y token enmascarado
├── scripts/                          # Scripts de automatización y prueba
│   ├── run_migrations.ts             # Aplicador de migraciones PostgreSQL
│   ├── seed_and_test_excel.ts        # Generador de lote controlado y exportador Excel
│   └── verify_services.ts            # Suite de comprobación de integración
└── exports/                          # Archivos analíticos exportados (.xlsx)
    └── criscodev_dropi_catalogo_test.xlsx
```

---

## 🚀 Inicio Rápido (Servidor Autónomo)

Para iniciar el servidor y dashboard web independiente:

```bash
# 1. Instalar dependencias
npm install

# 2. Iniciar el servidor
npm start
```

El servidor se iniciará en **http://localhost:3005** con:
- 📊 **Dashboard Web Interactivo:** `http://localhost:3005`
- 📦 **API de Catálogo Filtrable:** `http://localhost:3005/api/products`
- 📥 **Descarga Directa de Excel (4 hojas):** `http://localhost:3005/api/export`
- 🔐 **Gestor de Conexión Dropi:** `http://localhost:3005/api/auth`

---

## 🛠️ Scripts Disponibles (npm)

| Comando | Acción |
|---|---|
| `npm start` | Inicia el servidor web autónomo en el puerto 3005. |
| `npm run dev` | Inicia el servidor en modo desarrollo con recarga automática. |
| `npm test` | Ejecuta la suite de comprobación de filtros, consultas y persistencia. |
| `npm run seed` | Genera el lote de prueba de 50 productos y exporta el archivo Excel. |
| `npm run migrate` | Aplica las migraciones SQL a PostgreSQL (si está activo). |
| `npm run importer` | Ejecuta el importador Python por línea de comandos. |

---

## 🐍 Uso del Importador Python

El importador `importer/dropi_importer.py` opera de forma autónoma:

```bash
# 1. Comprobar conexión y token
python importer/dropi_importer.py --test-connection --json

# 2. Extracción controlada de hasta 50 productos de Tecnología
python importer/dropi_importer.py --category "Tecnología" --min-price 0 --max-price 50000 --limit 50 --json
```

---

## 📊 Reporte Analítico en Excel (.xlsx)

El generador `src/services/dropiExcel.ts` crea un archivo con **4 hojas formateadas profesionalmente**:
1. **Catálogo**: IDs, producto, categoría, proveedor (Premium/Verificado), costos, precio sugerido, stock, margen bruto estimado y enlaces.
2. **Alertas**: Anomalías comerciales detectadas (precios < $2.000 CLP, margen negativo, costos en cero).
3. **Resumen**: Estadísticas ejecutivas de proveedores, margen ≥ 30% y calidad.
4. **Control de Calidad**: Checklist técnico de duplicados, variantes y coherencia.

---

## 🔒 Reglas de Seguridad y Aislamiento

- **No se almacenan contraseñas.** El acceso se realiza mediante tokens protegidos o claves de integración.
- Los tokens en pantalla se presentan enmascarados (`dropi_live_...a8f4`).
- El proyecto opera de forma 100% aislada de Shopify y Pancocos.
