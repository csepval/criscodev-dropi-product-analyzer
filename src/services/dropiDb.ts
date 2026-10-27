// src/services/dropi/dropiDb.ts
// Capa de persistencia para CrisCodev Dropi Product Analyzer
// Soporta PostgreSQL (primario) con fallback resiliente en almacenamiento local JSON

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { query, isDatabaseAvailable } from '../lib/db';

export interface DropiSupplierRecord {
  id: string;
  dropi_user_id: number;
  name: string;
  is_verified: boolean;
  is_premium: boolean;
  city?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DropiProductVariantRecord {
  id: string;
  product_id: string;
  dropi_variant_id: number;
  sku?: string | null;
  variation_name: string;
  supplier_price: number;
  suggested_price?: number | null;
  stock: number;
}

export interface DropiProductFlagRecord {
  id?: number;
  product_id: string;
  flag_code: string;
  description: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  resolved?: boolean;
  created_at?: string;
}

export interface DropiProductRecord {
  id: string;
  dropi_id: number;
  supplier_id?: string | null;
  supplier_name: string;
  name: string;
  category: string;
  supplier_price_min: number;
  supplier_price_max: number;
  suggested_price?: number | null;
  stock: number;
  city?: string | null;
  is_verified: boolean;
  is_premium: boolean;
  has_variants: boolean;
  image_url?: string | null;
  product_url?: string | null;
  status: string;
  requires_review: boolean;
  imported_at?: string;
  last_checked_at?: string;
  updated_at?: string;
  // Campos calculados y relaciones
  variants?: DropiProductVariantRecord[];
  flags?: DropiProductFlagRecord[];
  gross_profit_preliminary?: number | null;
  gross_margin_preliminary?: number | null;
}

export interface DropiImportJobRecord {
  id: string;
  job_type: 'API_MANUAL' | 'API_SCHEDULED' | 'FILE_CSV' | 'FILE_EXCEL';
  filters_used?: any;
  total_fetched: number;
  total_inserted: number;
  total_updated: number;
  total_flagged: number;
  total_errors: number;
  duration_ms: number;
  status: 'RUNNING' | 'COMPLETED' | 'FAILED';
  diagnostic_message?: string | null;
  error_message?: string | null;
  started_at?: string;
  finished_at?: string | null;
}

export interface DropiConnectionConfig {
  id: string;
  auth_mode: 'TOKEN' | 'BEARER_SESSION' | 'PLAYWRIGHT_PROFILE';
  masked_token?: string | null;
  encrypted_token?: string | null;
  status: 'CONNECTED' | 'DISCONNECTED' | 'EXPIRED';
  last_verified_at?: string | null;
  expires_at?: string | null;
  user_data?: any;
}

// Rutas de fallback local
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const FALLBACK_PRODUCTS_FILE = path.join(DATA_DIR, 'dropi_catalog.json');
const FALLBACK_JOBS_FILE = path.join(DATA_DIR, 'dropi_jobs.json');
const FALLBACK_CONFIG_FILE = path.join(DATA_DIR, 'dropi_connection.json');
const FALLBACK_HISTORY_FILE = path.join(DATA_DIR, 'dropi_history.json');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJsonFile<T>(filePath: string, defaultValue: T): T {
  ensureDataDir();
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as T;
    }
  } catch (err) {
    console.warn(`[DropiDb] Error al leer archivo ${filePath}:`, err);
  }
  return defaultValue;
}

function writeJsonFile<T>(filePath: string, data: T): void {
  ensureDataDir();
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[DropiDb] Error al escribir archivo ${filePath}:`, err);
  }
}

// ==============================================================================
// 1. GESTIÓN DE CONEXIÓN Y AUTENTICACIÓN
// ==============================================================================

export async function getConnectionConfig(): Promise<DropiConnectionConfig> {
  const dbOk = await isDatabaseAvailable();
  if (dbOk) {
    try {
      const res = await query<DropiConnectionConfig>(
        'SELECT * FROM dropi_connection_config WHERE id = $1 LIMIT 1',
        ['default']
      );
      if (res.rows.length > 0) {
        return res.rows[0];
      }
    } catch (err: any) {
      console.warn('[DropiDb] Error consultando dropi_connection_config en DB:', err.message);
    }
  }

  // Fallback archivo local
  return readJsonFile<DropiConnectionConfig>(FALLBACK_CONFIG_FILE, {
    id: 'default',
    auth_mode: 'TOKEN',
    status: 'DISCONNECTED',
  });
}

export async function saveConnectionConfig(config: DropiConnectionConfig): Promise<void> {
  const dbOk = await isDatabaseAvailable();
  if (dbOk) {
    try {
      await query(
        `INSERT INTO dropi_connection_config 
         (id, auth_mode, masked_token, encrypted_token, status, last_verified_at, expires_at, user_data, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO UPDATE SET
           auth_mode = EXCLUDED.auth_mode,
           masked_token = EXCLUDED.masked_token,
           encrypted_token = EXCLUDED.encrypted_token,
           status = EXCLUDED.status,
           last_verified_at = EXCLUDED.last_verified_at,
           expires_at = EXCLUDED.expires_at,
           user_data = EXCLUDED.user_data,
           updated_at = CURRENT_TIMESTAMP`,
        [
          config.id || 'default',
          config.auth_mode,
          config.masked_token || null,
          config.encrypted_token || null,
          config.status,
          config.last_verified_at || null,
          config.expires_at || null,
          JSON.stringify(config.user_data || {}),
        ]
      );
    } catch (err: any) {
      console.warn('[DropiDb] Error guardando dropi_connection_config en DB:', err.message);
    }
  }

  // Guardar siempre también en fallback local
  writeJsonFile(FALLBACK_CONFIG_FILE, config);
}

export async function clearConnectionConfig(): Promise<void> {
  const emptyConfig: DropiConnectionConfig = {
    id: 'default',
    auth_mode: 'TOKEN',
    status: 'DISCONNECTED',
    masked_token: null,
    encrypted_token: null,
    last_verified_at: null,
    expires_at: null,
    user_data: null,
  };
  await saveConnectionConfig(emptyConfig);
}

// ==============================================================================
// 2. GESTIÓN DE TRABAJOS DE IMPORTACIÓN (JOBS)
// ==============================================================================

export async function createImportJob(job: DropiImportJobRecord): Promise<void> {
  const dbOk = await isDatabaseAvailable();
  if (dbOk) {
    try {
      await query(
        `INSERT INTO dropi_import_jobs
         (id, job_type, filters_used, total_fetched, total_inserted, total_updated, total_flagged, total_errors, duration_ms, status, diagnostic_message, error_message, started_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)`,
        [
          job.id,
          job.job_type,
          JSON.stringify(job.filters_used || {}),
          job.total_fetched,
          job.total_inserted,
          job.total_updated,
          job.total_flagged,
          job.total_errors,
          job.duration_ms,
          job.status,
          job.diagnostic_message || null,
          job.error_message || null,
        ]
      );
    } catch (err: any) {
      console.warn('[DropiDb] Error insertando dropi_import_jobs en DB:', err.message);
    }
  }

  // Fallback JSON
  const jobs = readJsonFile<DropiImportJobRecord[]>(FALLBACK_JOBS_FILE, []);
  jobs.unshift(job);
  writeJsonFile(FALLBACK_JOBS_FILE, jobs.slice(0, 100)); // Mantener últimos 100
}

export async function updateImportJob(
  id: string,
  updates: Partial<DropiImportJobRecord>
): Promise<void> {
  const dbOk = await isDatabaseAvailable();
  if (dbOk) {
    try {
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      for (const [key, val] of Object.entries(updates)) {
        if (key === 'id') continue;
        setClauses.push(`${key} = $${paramIndex}`);
        values.push(val);
        paramIndex++;
      }

      if (setClauses.length > 0) {
        values.push(id);
        const sql = `UPDATE dropi_import_jobs SET ${setClauses.join(', ')} WHERE id = $${paramIndex}`;
        await query(sql, values);
      }
    } catch (err: any) {
      console.warn('[DropiDb] Error actualizando dropi_import_jobs en DB:', err.message);
    }
  }

  // Fallback JSON
  const jobs = readJsonFile<DropiImportJobRecord[]>(FALLBACK_JOBS_FILE, []);
  const idx = jobs.findIndex((j) => j.id === id);
  if (idx !== -1) {
    jobs[idx] = { ...jobs[idx], ...updates };
    writeJsonFile(FALLBACK_JOBS_FILE, jobs);
  }
}

export async function getImportJobs(limit = 20): Promise<DropiImportJobRecord[]> {
  const dbOk = await isDatabaseAvailable();
  if (dbOk) {
    try {
      const res = await query<DropiImportJobRecord>(
        'SELECT * FROM dropi_import_jobs ORDER BY started_at DESC LIMIT $1',
        [limit]
      );
      return res.rows;
    } catch (err: any) {
      console.warn('[DropiDb] Error leyendo dropi_import_jobs en DB:', err.message);
    }
  }

  return readJsonFile<DropiImportJobRecord[]>(FALLBACK_JOBS_FILE, []).slice(0, limit);
}

// ==============================================================================
// 3. PERSISTENCIA DE PROVEEDORES Y PRODUCTOS (UPSERT IDEMPOTENTE)
// ==============================================================================

export async function upsertSupplier(supplier: DropiSupplierRecord): Promise<void> {
  const dbOk = await isDatabaseAvailable();
  if (dbOk) {
    try {
      await query(
        `INSERT INTO dropi_suppliers (id, dropi_user_id, name, is_verified, is_premium, city, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
         ON CONFLICT (dropi_user_id) DO UPDATE SET
           name = EXCLUDED.name,
           is_verified = EXCLUDED.is_verified,
           is_premium = EXCLUDED.is_premium,
           city = COALESCE(EXCLUDED.city, dropi_suppliers.city),
           updated_at = CURRENT_TIMESTAMP`,
        [
          supplier.id,
          supplier.dropi_user_id,
          supplier.name,
          supplier.is_verified,
          supplier.is_premium,
          supplier.city || null,
        ]
      );
    } catch (err: any) {
      console.warn('[DropiDb] Error en upsertSupplier DB:', err.message);
    }
  }
}

export interface SaveProductResult {
  inserted: boolean;
  updated: boolean;
  flagged: boolean;
}

export async function upsertProduct(
  product: DropiProductRecord,
  variants: DropiProductVariantRecord[] = [],
  flags: DropiProductFlagRecord[] = []
): Promise<SaveProductResult> {
  let inserted = false;
  let updated = false;
  const flagged = flags.length > 0 || product.requires_review;

  const dbOk = await isDatabaseAvailable();
  if (dbOk) {
    try {
      // 1. Verificar si existe previamente para detectar cambios y registrar historial
      const existingRes = await query(
        'SELECT id, supplier_price_min, supplier_price_max, suggested_price, stock, status FROM dropi_products WHERE dropi_id = $1 LIMIT 1',
        [product.dropi_id]
      );

      const isNew = existingRes.rows.length === 0;
      const old = existingRes.rows[0];

      // 2. Upsert producto principal
      await query(
        `INSERT INTO dropi_products (
           id, dropi_id, supplier_id, supplier_name, name, category,
           supplier_price_min, supplier_price_max, suggested_price, stock,
           city, is_verified, is_premium, has_variants, image_url,
           product_url, status, requires_review, imported_at, last_checked_at, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
           CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         )
         ON CONFLICT (dropi_id) DO UPDATE SET
           supplier_id = EXCLUDED.supplier_id,
           supplier_name = EXCLUDED.supplier_name,
           name = EXCLUDED.name,
           category = EXCLUDED.category,
           supplier_price_min = EXCLUDED.supplier_price_min,
           supplier_price_max = EXCLUDED.supplier_price_max,
           suggested_price = EXCLUDED.suggested_price,
           stock = EXCLUDED.stock,
           city = COALESCE(EXCLUDED.city, dropi_products.city),
           is_verified = EXCLUDED.is_verified,
           is_premium = EXCLUDED.is_premium,
           has_variants = EXCLUDED.has_variants,
           image_url = COALESCE(EXCLUDED.image_url, dropi_products.image_url),
           product_url = COALESCE(EXCLUDED.product_url, dropi_products.product_url),
           status = EXCLUDED.status,
           requires_review = EXCLUDED.requires_review,
           last_checked_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP`,
        [
          product.id,
          product.dropi_id,
          product.supplier_id || null,
          product.supplier_name,
          product.name,
          product.category,
          product.supplier_price_min,
          product.supplier_price_max,
          product.suggested_price,
          product.stock,
          product.city || null,
          product.is_verified,
          product.is_premium,
          product.has_variants,
          product.image_url || null,
          product.product_url || null,
          product.status || 'ACTIVO',
          product.requires_review,
        ]
      );

      if (isNew) {
        inserted = true;
      } else {
        updated = true;
      }

      // 3. Registrar en historial si hubo cambio relevante o si es nuevo
      const hasPriceChange = old && (
        parseFloat(old.supplier_price_min) !== product.supplier_price_min ||
        parseFloat(old.suggested_price || 0) !== (product.suggested_price || 0)
      );
      const hasStockChange = old && old.stock !== product.stock;
      const stockDelta = old ? product.stock - old.stock : 0;

      if (isNew || hasPriceChange || hasStockChange) {
        await query(
          `INSERT INTO dropi_product_history (
             product_id, supplier_price_min, supplier_price_max, suggested_price,
             stock, stock_delta, status, is_change, observed_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
          [
            product.id,
            product.supplier_price_min,
            product.supplier_price_max,
            product.suggested_price,
            product.stock,
            stockDelta,
            product.status,
            true, // is_change
          ]
        );
      } else {
        // Historial de consulta sin cambio (observación de comprobación periódica)
        await query(
          `INSERT INTO dropi_product_history (
             product_id, supplier_price_min, supplier_price_max, suggested_price,
             stock, stock_delta, status, is_change, observed_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
          [
            product.id,
            product.supplier_price_min,
            product.supplier_price_max,
            product.suggested_price,
            product.stock,
            0,
            product.status,
            false, // is_change = false
          ]
        );
      }

      // 4. Upsert de variantes si existen
      for (const v of variants) {
        await query(
          `INSERT INTO dropi_product_variants (
             id, product_id, dropi_variant_id, sku, variation_name,
             supplier_price, suggested_price, stock, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
           ON CONFLICT (product_id, dropi_variant_id) DO UPDATE SET
             sku = EXCLUDED.sku,
             variation_name = EXCLUDED.variation_name,
             supplier_price = EXCLUDED.supplier_price,
             suggested_price = EXCLUDED.suggested_price,
             stock = EXCLUDED.stock,
             updated_at = CURRENT_TIMESTAMP`,
          [
            v.id,
            product.id,
            v.dropi_variant_id,
            v.sku || null,
            v.variation_name,
            v.supplier_price,
            v.suggested_price || null,
            v.stock,
          ]
        );
      }

      // 5. Insertar banderas/alertas de calidad
      for (const f of flags) {
        await query(
          `INSERT INTO dropi_product_flags (product_id, flag_code, description, severity, resolved)
           VALUES ($1, $2, $3, $4, false)`,
          [product.id, f.flag_code, f.description, f.severity || 'WARNING']
        );
      }

    } catch (err: any) {
      console.warn(`[DropiDb] Error guardando producto ${product.dropi_id} en DB:`, err.message);
    }
  }

  // Sincronizar siempre en fallback JSON para asegurar disponibilidad instantánea
  const catalog = readJsonFile<DropiProductRecord[]>(FALLBACK_PRODUCTS_FILE, []);
  const existingIndex = catalog.findIndex((p) => p.dropi_id === product.dropi_id);

  // Calcular márgenes preliminares
  const cost = product.supplier_price_min;
  const suggested = product.suggested_price || 0;
  const grossProfit = suggested > 0 ? suggested - cost : null;
  const grossMargin = suggested > 0 && grossProfit !== null ? (grossProfit / suggested) * 100 : null;

  const productToStore: DropiProductRecord = {
    ...product,
    variants,
    flags,
    gross_profit_preliminary: grossProfit,
    gross_margin_preliminary: grossMargin,
    updated_at: new Date().toISOString(),
  };

  if (existingIndex >= 0) {
    catalog[existingIndex] = {
      ...catalog[existingIndex],
      ...productToStore,
      imported_at: catalog[existingIndex].imported_at || new Date().toISOString(),
    };
    updated = true;
  } else {
    productToStore.imported_at = new Date().toISOString();
    catalog.push(productToStore);
    inserted = true;
  }
  writeJsonFile(FALLBACK_PRODUCTS_FILE, catalog);

  // Guardar registro en historial local
  const history = readJsonFile<any[]>(FALLBACK_HISTORY_FILE, []);
  history.push({
    product_id: product.id,
    dropi_id: product.dropi_id,
    supplier_price_min: product.supplier_price_min,
    supplier_price_max: product.supplier_price_max,
    suggested_price: product.suggested_price,
    stock: product.stock,
    status: product.status || 'ACTIVO',
    observed_at: new Date().toISOString(),
  });
  if (history.length > 1000) history.splice(0, history.length - 1000);
  writeJsonFile(FALLBACK_HISTORY_FILE, history);

  return { inserted, updated, flagged };
}

// ==============================================================================
// 4. CONSULTA Y FILTRADO DEL CATÁLOGO
// ==============================================================================

export interface ProductFilterOptions {
  search?: string;
  category?: string;
  supplier_name?: string;
  is_verified?: boolean;
  is_premium?: boolean;
  min_price?: number;
  max_price?: number;
  min_stock?: number;
  min_margin?: number;
  exclude_flags?: boolean;
  sort_by?: 'margin_desc' | 'price_asc' | 'price_desc' | 'stock_desc' | 'name_asc';
  limit?: number;
  offset?: number;
}

export async function getProducts(options: ProductFilterOptions = {}): Promise<{
  products: DropiProductRecord[];
  total: number;
}> {
  const dbOk = await isDatabaseAvailable();
  if (dbOk) {
    try {
      const whereParts: string[] = [];
      const params: any[] = [];
      let pIdx = 1;

      if (options.search) {
        whereParts.push(`(p.name ILIKE $${pIdx} OR p.supplier_name ILIKE $${pIdx})`);
        params.push(`%${options.search}%`);
        pIdx++;
      }
      if (options.category) {
        whereParts.push(`p.category = $${pIdx}`);
        params.push(options.category);
        pIdx++;
      }
      if (options.supplier_name) {
        whereParts.push(`p.supplier_name ILIKE $${pIdx}`);
        params.push(`%${options.supplier_name}%`);
        pIdx++;
      }
      if (options.is_verified !== undefined && options.is_verified !== false) {
        whereParts.push(`p.is_verified = true`);
      }
      if (options.is_premium !== undefined && options.is_premium !== false) {
        whereParts.push(`p.is_premium = true`);
      }
      if (options.min_price !== undefined) {
        whereParts.push(`p.supplier_price_min >= $${pIdx}`);
        params.push(options.min_price);
        pIdx++;
      }
      if (options.max_price !== undefined) {
        whereParts.push(`p.supplier_price_max <= $${pIdx}`);
        params.push(options.max_price);
        pIdx++;
      }
      if (options.min_stock !== undefined) {
        whereParts.push(`p.stock >= $${pIdx}`);
        params.push(options.min_stock);
        pIdx++;
      }
      if (options.exclude_flags) {
        whereParts.push(`p.requires_review = false`);
      }

      const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

      // Orden
      let orderClause = 'ORDER BY p.updated_at DESC';
      if (options.sort_by === 'price_asc') orderClause = 'ORDER BY p.supplier_price_min ASC';
      else if (options.sort_by === 'price_desc') orderClause = 'ORDER BY p.supplier_price_min DESC';
      else if (options.sort_by === 'stock_desc') orderClause = 'ORDER BY p.stock DESC';
      else if (options.sort_by === 'name_asc') orderClause = 'ORDER BY p.name ASC';
      else if (options.sort_by === 'margin_desc') {
        orderClause = `ORDER BY CASE WHEN p.suggested_price > 0 THEN ((p.suggested_price - p.supplier_price_min) / p.suggested_price) ELSE 0 END DESC`;
      }

      // Count
      const countSql = `SELECT count(*) as total FROM dropi_products p ${whereClause}`;
      const countRes = await query(countSql, params);
      const total = parseInt(countRes.rows[0]?.total || '0', 10);

      // Paginación
      const limit = options.limit || 50;
      const offset = options.offset || 0;
      const queryParams = [...params, limit, offset];
      const dataSql = `
        SELECT p.*,
          CASE 
            WHEN p.suggested_price > 0 THEN (p.suggested_price - p.supplier_price_min)
            ELSE NULL 
          END as gross_profit_preliminary,
          CASE 
            WHEN p.suggested_price > 0 THEN ((p.suggested_price - p.supplier_price_min) / p.suggested_price * 100)
            ELSE NULL 
          END as gross_margin_preliminary
        FROM dropi_products p
        ${whereClause}
        ${orderClause}
        LIMIT $${pIdx} OFFSET $${pIdx + 1}
      `;

      const dataRes = await query(dataSql, queryParams);
      return { products: dataRes.rows, total };
    } catch (err: any) {
      console.warn('[DropiDb] Error consultando dropi_products en DB:', err.message);
    }
  }

  // Fallback catálogo local
  let list = readJsonFile<DropiProductRecord[]>(FALLBACK_PRODUCTS_FILE, []);

  // Filtrado en memoria
  if (options.search) {
    const s = options.search.toLowerCase();
    list = list.filter((p) => p.name.toLowerCase().includes(s) || p.supplier_name.toLowerCase().includes(s));
  }
  if (options.category) {
    list = list.filter((p) => p.category.toLowerCase() === options.category?.toLowerCase());
  }
  if (options.supplier_name) {
    list = list.filter((p) => p.supplier_name.toLowerCase().includes(options.supplier_name!.toLowerCase()));
  }
  if (options.is_verified) {
    list = list.filter((p) => p.is_verified);
  }
  if (options.is_premium) {
    list = list.filter((p) => p.is_premium);
  }
  if (options.min_price !== undefined) {
    list = list.filter((p) => p.supplier_price_min >= options.min_price!);
  }
  if (options.max_price !== undefined) {
    list = list.filter((p) => p.supplier_price_max <= options.max_price!);
  }
  if (options.min_stock !== undefined) {
    list = list.filter((p) => p.stock >= options.min_stock!);
  }
  if (options.exclude_flags) {
    list = list.filter((p) => !p.requires_review);
  }
  if (options.min_margin !== undefined) {
    list = list.filter((p) => (p.gross_margin_preliminary || 0) >= options.min_margin!);
  }

  // Ordenamiento en memoria
  if (options.sort_by === 'price_asc') {
    list.sort((a, b) => a.supplier_price_min - b.supplier_price_min);
  } else if (options.sort_by === 'price_desc') {
    list.sort((a, b) => b.supplier_price_min - a.supplier_price_min);
  } else if (options.sort_by === 'stock_desc') {
    list.sort((a, b) => b.stock - a.stock);
  } else if (options.sort_by === 'name_asc') {
    list.sort((a, b) => a.name.localeCompare(b.name));
  } else if (options.sort_by === 'margin_desc') {
    list.sort((a, b) => (b.gross_margin_preliminary || 0) - (a.gross_margin_preliminary || 0));
  }

  const total = list.length;
  const offset = options.offset || 0;
  const limit = options.limit || 50;
  return { products: list.slice(offset, offset + limit), total };
}

export async function getSummaryStats(): Promise<{
  totalProducts: number;
  totalSuppliers: number;
  premiumCount: number;
  verifiedCount: number;
  validPriceCount: number;
  flaggedCount: number;
  highMarginCount: number;
  lastSyncAt: string | null;
}> {
  const { products, total } = await getProducts({ limit: 10000 });
  const suppliers = new Set(products.map((p) => p.supplier_name));
  const premium = products.filter((p) => p.is_premium).length;
  const verified = products.filter((p) => p.is_verified).length;
  const flagged = products.filter((p) => p.requires_review).length;
  const validPrice = products.filter((p) => !p.requires_review && (p.suggested_price || 0) > p.supplier_price_min).length;
  const highMargin = products.filter((p) => (p.gross_margin_preliminary || 0) >= 30).length;

  const jobs = await getImportJobs(1);
  const lastSyncAt = jobs.length > 0 && jobs[0].finished_at ? jobs[0].finished_at : null;

  return {
    totalProducts: total,
    totalSuppliers: suppliers.size,
    premiumCount: premium,
    verifiedCount: verified,
    validPriceCount: validPrice,
    flaggedCount: flagged,
    highMarginCount: highMargin,
    lastSyncAt,
  };
}
