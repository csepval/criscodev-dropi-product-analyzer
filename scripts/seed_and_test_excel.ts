// scripts/seed_and_test_excel.ts
// Genera el lote de prueba controlado de 50 productos de Tecnología
// y genera el archivo Excel de 4 hojas para validar la Entrega 2.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateDropiCatalogExcel } from '../src/services/dropiExcel';
import { upsertProduct, createImportJob, updateImportJob } from '../src/services/dropiDb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '..', 'src', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// 50 productos controlados: Tecnología, Proveedores Verificados/Premium, Precios $0 a $50.000 CLP
// Incluye productos limpios, con variantes, y los casos anómalos auditados ($1, $30, margen negativo)
const sampleProducts: any[] = [
  // 1. Audífonos Bluetooth Pro (Caso Normal Alto Margen)
  {
    dropi_id: 10101,
    name: 'Audífonos Inalámbricos Bluetooth Pro TWS Cancelación Ruido',
    category: 'Tecnología',
    supplier_id: 201,
    supplier_name: 'TechStore Santiago SpA',
    is_premium: true,
    is_verified: true,
    supplier_price_min: 12990,
    supplier_price_max: 14990,
    suggested_price: 29990,
    stock: 142,
    city: 'Santiago',
    has_variants: true,
    image_url: 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=500',
    product_url: 'https://app.dropi.cl/dashboard/search?product=10101',
    variants: [
      { id: 'v-10101-1', dropi_variant_id: 'V1', sku: 'TWS-BLK', name: 'Color Negro', supplier_price: 12990, suggested_price: 29990, stock: 80 },
      { id: 'v-10101-2', dropi_variant_id: 'V2', sku: 'TWS-WHT', name: 'Color Blanco', supplier_price: 14990, suggested_price: 32990, stock: 62 },
    ],
  },
  // 2. Soporte Celular Magnético Auto
  {
    dropi_id: 10102,
    name: 'Soporte Celular Magnético para Auto Rotación 360 Grados',
    category: 'Tecnología',
    supplier_id: 201,
    supplier_name: 'TechStore Santiago SpA',
    is_premium: true,
    is_verified: true,
    supplier_price_min: 3990,
    supplier_price_max: 3990,
    suggested_price: 11990,
    stock: 450,
    city: 'Santiago',
    has_variants: false,
    image_url: 'https://images.unsplash.com/photo-1584438784894-089d6a62b8fa?w=500',
    product_url: 'https://app.dropi.cl/dashboard/search?product=10102',
  },
  // 3. Smartwatch Deportivo Impermeable
  {
    dropi_id: 10103,
    name: 'Smartwatch Deportivo Inteligente Notificaciones Monitor Ritmo',
    category: 'Tecnología',
    supplier_id: 202,
    supplier_name: 'ElectroChile Distribuciones',
    is_premium: true,
    is_verified: true,
    supplier_price_min: 18990,
    supplier_price_max: 21990,
    suggested_price: 39990,
    stock: 88,
    city: 'Viña del Mar',
    has_variants: true,
    image_url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500',
    product_url: 'https://app.dropi.cl/dashboard/search?product=10103',
    variants: [
      { id: 'v-10103-1', dropi_variant_id: 'SW-B', sku: 'SW-SILVER', name: 'Correa Silicona', supplier_price: 18990, suggested_price: 39990, stock: 45 },
      { id: 'v-10103-2', dropi_variant_id: 'SW-M', sku: 'SW-METAL', name: 'Correa Metálica', supplier_price: 21990, suggested_price: 44990, stock: 43 },
    ],
  },
  // 4. Teclado Mecánico RGB Switch Blue
  {
    dropi_id: 10104,
    name: 'Teclado Mecánico Gamer RGB Compacto 60% Switches Blue',
    category: 'Tecnología',
    supplier_id: 203,
    supplier_name: 'Gaming Pro Valparaíso',
    is_premium: false,
    is_verified: true,
    supplier_price_min: 24990,
    supplier_price_max: 24990,
    suggested_price: 49990,
    stock: 35,
    city: 'Valparaíso',
    has_variants: false,
    image_url: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500',
    product_url: 'https://app.dropi.cl/dashboard/search?product=10104',
  },
  // 5. CASO ANÓMALO AUDITORÍA 1: Precio sugerido $1 CLP
  {
    dropi_id: 10105,
    name: 'Cable USB-C Carga Rápida 2 Metros Nylon Reforzado',
    category: 'Tecnología',
    supplier_id: 204,
    supplier_name: 'Importadora MegaTech',
    is_premium: false,
    is_verified: false,
    supplier_price_min: 1990,
    supplier_price_max: 1990,
    suggested_price: 1, // ANOMALÍA DETECTADA EN AUDITORÍA
    stock: 1200,
    city: 'Santiago',
    has_variants: false,
    image_url: 'https://images.unsplash.com/photo-1588508065123-287b28e013da?w=500',
    product_url: 'https://app.dropi.cl/dashboard/search?product=10105',
  },
  // 6. CASO ANÓMALO AUDITORÍA 2: Precio sugerido menor al costo ($3.000 vs costo $5.990)
  {
    dropi_id: 10106,
    name: 'Hub USB 4 Puertos USB 3.0 con Luz LED',
    category: 'Tecnología',
    supplier_id: 201,
    supplier_name: 'TechStore Santiago SpA',
    is_premium: true,
    is_verified: true,
    supplier_price_min: 5990,
    supplier_price_max: 5990,
    suggested_price: 3000, // ANOMALÍA: menor al costo
    stock: 90,
    city: 'Santiago',
    has_variants: false,
    image_url: 'https://images.unsplash.com/photo-1544717305-2782549b5136?w=500',
    product_url: 'https://app.dropi.cl/dashboard/search?product=10106',
  },
  // 7. CASO ANÓMALO AUDITORÍA 3: Precio sugerido $30 CLP
  {
    dropi_id: 10107,
    name: 'Adaptador OTG Tipo C a USB Hembra Metálico',
    category: 'Tecnología',
    supplier_id: 204,
    supplier_name: 'Importadora MegaTech',
    is_premium: false,
    is_verified: false,
    supplier_price_min: 990,
    supplier_price_max: 990,
    suggested_price: 30, // ANOMALÍA: valor insignificante
    stock: 600,
    city: 'Concepción',
    has_variants: false,
    image_url: 'https://images.unsplash.com/photo-1588508065123-287b28e013da?w=500',
    product_url: 'https://app.dropi.cl/dashboard/search?product=10107',
  },
  // 8. Mouse Gamer Ergonómico
  {
    dropi_id: 10108,
    name: 'Mouse Óptico Gamer 7 Botones 7200 DPI RGB',
    category: 'Tecnología',
    supplier_id: 203,
    supplier_name: 'Gaming Pro Valparaíso',
    is_premium: false,
    is_verified: true,
    supplier_price_min: 7990,
    supplier_price_max: 7990,
    suggested_price: 18990,
    stock: 110,
    city: 'Valparaíso',
    has_variants: false,
    image_url: 'https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=500',
    product_url: 'https://app.dropi.cl/dashboard/search?product=10108',
  },
  // 9. Aro de Luz LED 26cm con Trípode
  {
    dropi_id: 10109,
    name: 'Aro de Luz LED 26cm Ring Light con Trípode 2.1m para Streaming',
    category: 'Tecnología',
    supplier_id: 205,
    supplier_name: 'Luz y Fotografía Chile',
    is_premium: true,
    is_verified: true,
    supplier_price_min: 9990,
    supplier_price_max: 9990,
    suggested_price: 22990,
    stock: 220,
    city: 'Santiago',
    has_variants: false,
    image_url: 'https://images.unsplash.com/photo-1612810806563-4cb8265db55f?w=500',
    product_url: 'https://app.dropi.cl/dashboard/search?product=10109',
  },
  // 10. Mini Cámara de Seguridad WiFi HD
  {
    dropi_id: 10110,
    name: 'Mini Cámara de Seguridad Espía WiFi HD Visión Nocturna Magnética',
    category: 'Tecnología',
    supplier_id: 202,
    supplier_name: 'ElectroChile Distribuciones',
    is_premium: true,
    is_verified: true,
    supplier_price_min: 8990,
    supplier_price_max: 8990,
    suggested_price: 24990,
    stock: 75,
    city: 'Viña del Mar',
    has_variants: false,
    image_url: 'https://images.unsplash.com/photo-1557597774-9d273605dfa9?w=500',
    product_url: 'https://app.dropi.cl/dashboard/search?product=10110',
  },
];

// Generar los 40 productos restantes para completar exactamente los 50 del lote controlado
const techItems = [
  'Parlante Bluetooth Portátil Resistente al Agua',
  'Cargador Inalámbrico Rápido 15W Qi Certificado',
  'Lámpara Escritorio LED con Carga Inalámbrica',
  'Micrófono Condensador USB para Podcast y Streaming',
  'Base Enfriadora para Notebook 5 Ventiladores LED',
  'Repetidor Extensor WiFi 300Mbps Amplificador Señal',
  'Cámara Web 1080p Full HD con Micrófono Estéreo',
  'Lente Telescopio para Celular Zoom 18X Universal',
  'Foco Inteligente Smart Bulb RGB WiFi Compatible Alexa',
  'Balanza Digital Inteligente Bluetooth Bioimpedancia',
];

for (let i = 11; i <= 50; i++) {
  const itemIndex = (i - 11) % techItems.length;
  const baseName = techItems[itemIndex];
  const cost = 4990 + (i * 850) % 35000;
  const marginMul = 1.8 + ((i % 5) * 0.2);
  const suggested = Math.round((cost * marginMul) / 100) * 100;
  const isPremium = i % 2 === 0;
  const isVerified = i % 3 !== 0;

  // Introducir 2 casos anómalos adicionales para probar exhaustividad del informe de calidad
  let finalSuggested = suggested;
  if (i === 25) finalSuggested = 123; // Anómalo: $123 CLP
  if (i === 40) finalSuggested = 0;   // Anómalo: $0 CLP

  sampleProducts.push({
    dropi_id: 10100 + i,
    name: `${baseName} Mod. G${i}`,
    category: 'Tecnología',
    supplier_id: 200 + (i % 6),
    supplier_name: ['TechStore Santiago SpA', 'ElectroChile Distribuciones', 'Gaming Pro Valparaíso', 'Luz y Fotografía Chile', 'Importadora Andes SpA'][i % 5],
    is_premium: isPremium,
    is_verified: isVerified,
    supplier_price_min: cost,
    supplier_price_max: cost + (i % 3 === 0 ? 3000 : 0),
    suggested_price: finalSuggested,
    stock: 20 + (i * 13) % 300,
    city: ['Santiago', 'Viña del Mar', 'Valparaíso', 'Concepción', 'La Serena'][i % 5],
    has_variants: i % 4 === 0,
    image_url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500',
    product_url: `https://app.dropi.cl/dashboard/search?product=${10100 + i}`,
    variants: i % 4 === 0 ? [
      { id: `v-${10100 + i}-1`, dropi_variant_id: `V${i}-A`, sku: `SKU-${i}-A`, name: 'Estándar', supplier_price: cost, suggested_price: finalSuggested, stock: 30 },
      { id: `v-${10100 + i}-2`, dropi_variant_id: `V${i}-B`, sku: `SKU-${i}-B`, name: 'Plus', supplier_price: cost + 3000, suggested_price: finalSuggested + 5000, stock: 25 },
    ] : [],
  });
}

async function main() {
  console.log(`[Seed] Guardando ${sampleProducts.length} productos en la persistencia local/DB...`);

  const jobId = `job_${Date.now()}`;
  await createImportJob({
    id: jobId,
    job_type: 'API_MANUAL',
    filters_used: {
      category: 'Tecnología',
      categoryuser: [2, 1],
      min_price: 0,
      max_price: 50000,
      limit: 50,
    },
    total_fetched: sampleProducts.length,
    total_inserted: 0,
    total_updated: 0,
    total_flagged: 0,
    total_errors: 0,
    duration_ms: 0,
    status: 'RUNNING',
    diagnostic_message: 'Ejecutando lote inicial de 50 productos...',
    started_at: new Date().toISOString(),
  });

  const startTime = Date.now();
  let inserted = 0;
  let updated = 0;
  let flagged = 0;

  for (const prod of sampleProducts) {
    const flags: any[] = [];
    let requiresReview = false;

    // Reglas de calidad y detección de anomalías
    if (!prod.suggested_price || prod.suggested_price <= 0) {
      requiresReview = true;
      flags.push({
        flag_code: 'NULL_OR_ZERO_PRICE',
        description: `Precio sugerido nulo o $0 (${prod.suggested_price}). Imposible calcular margen.`,
        severity: 'CRITICAL',
      });
    } else if (prod.suggested_price < 2000) {
      requiresReview = true;
      flags.push({
        flag_code: 'UNREALISTIC_LOW_PRICE',
        description: `Precio sugerido sospechoso ($${prod.suggested_price.toLocaleString('es-CL')}). Típico placeholder de auditoría.`,
        severity: 'WARNING',
      });
    }

    if (prod.suggested_price && prod.suggested_price <= prod.supplier_price_min) {
      requiresReview = true;
      flags.push({
        flag_code: 'NEGATIVE_OR_ZERO_MARGIN',
        description: `Precio sugerido ($${prod.suggested_price}) menor o igual al costo proveedor ($${prod.supplier_price_min}).`,
        severity: 'CRITICAL',
      });
    }

    const res = await upsertProduct(
      {
        id: `prod_${prod.dropi_id}`,
        dropi_id: prod.dropi_id,
        supplier_id: prod.supplier_id,
        supplier_name: prod.supplier_name,
        name: prod.name,
        category: prod.category,
        supplier_price_min: prod.supplier_price_min,
        supplier_price_max: prod.supplier_price_max,
        suggested_price: prod.suggested_price,
        stock: prod.stock,
        city: prod.city,
        is_verified: prod.is_verified,
        is_premium: prod.is_premium,
        has_variants: prod.has_variants,
        image_url: prod.image_url,
        product_url: prod.product_url,
        status: 'ACTIVO',
        requires_review: requiresReview,
      },
      prod.variants || [],
      flags
    );

    if (res.inserted) inserted++;
    if (res.updated) updated++;
    if (res.flagged) flagged++;
  }

  const durationMs = Date.now() - startTime;
  await updateImportJob(jobId, {
    total_inserted: inserted,
    total_updated: updated,
    total_flagged: flagged,
    total_errors: 0,
    duration_ms: durationMs,
    status: 'COMPLETED',
    diagnostic_message: `Lote de ${sampleProducts.length} productos procesado exitosamente. Insertados: ${inserted}, Alertas: ${flagged}.`,
  });

  console.log(`[Seed] Finalizado en ${durationMs}ms:`);
  console.log(`- Total recibidos: ${sampleProducts.length}`);
  console.log(`- Insertados: ${inserted}`);
  console.log(`- Actualizados: ${updated}`);
  console.log(`- Marcados con alertas: ${flagged}`);

  // Generar Excel de prueba de 4 hojas
  console.log('\n[Excel] Generando archivo Excel de prueba con las 4 hojas requeridas...');
  const catalog = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'dropi_catalog.json'), 'utf-8'));
  const excelBuffer = await generateDropiCatalogExcel(
    catalog,
    'Lote de Prueba Controlado 50 Productos - Categoría: Tecnología'
  );

  const exportDir = path.resolve(__dirname, '..', 'exports');
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
  const outputPath = path.join(exportDir, 'criscodev_dropi_catalogo_test.xlsx');
  fs.writeFileSync(outputPath, excelBuffer);
  console.log(`[Excel] Archivo generado exitosamente en: ${outputPath} (${excelBuffer.length} bytes)`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
