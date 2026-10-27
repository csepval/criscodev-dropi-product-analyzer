// src/services/dropiApi.ts
// Servicio de Integración en Vivo con el Catálogo de Dropi Chile
// Permite buscar productos directamente en Dropi y guardarlos en nuestra base de datos.
// Regla: Prioriza código legible sobre código corto.

import {
  DropiProductRecord,
  DropiSupplierRecord,
  DropiProductVariantRecord,
  DropiProductFlagRecord,
  DropiImportJobRecord,
  upsertProduct,
  upsertSupplier,
  createImportJob,
  updateImportJob,
  getProducts,
  getConnectionConfig
} from './dropiDb';

export interface DropiLiveFilterParams {
  keywords?: string;
  category?: string;
  min_price?: number;
  max_price?: number;
  categoryuser?: number[]; // [1] = Premium, [2] = Verificado, [2, 1] = Ambos
  limit?: number;
  offset?: number;
}

export interface LiveDropiItem {
  dropi_id: number;
  name: string;
  category: string;
  supplier_name: string;
  is_verified: boolean;
  is_premium: boolean;
  supplier_price_min: number;
  supplier_price_max: number;
  suggested_price: number | null;
  stock: number;
  image_url: string | null;
  has_variants: boolean;
  gross_profit_preliminary: number | null;
  gross_margin_preliminary: number | null;
  requires_review: boolean;
  flags: DropiProductFlagRecord[];
  is_in_local_db: boolean;
  raw_data?: any;
}

export interface LiveSearchResult {
  success: boolean;
  total_found: number;
  products: LiveDropiItem[];
  next_offset?: number;
  has_more?: boolean;
  error?: string;
  message?: string;
}

export interface LiveImportParams {
  filters?: DropiLiveFilterParams;
  products?: LiveDropiItem[];
}

export interface LiveImportResult {
  success: boolean;
  job_id: string;
  total_fetched: number;
  total_inserted: number;
  total_updated: number;
  total_flagged: number;
  duration_ms: number;
  message: string;
  error?: string;
}

const PRIMARY_API_URL = 'https://api-v2.dropi.cl/bff/catalog/products/v3/index';
const FALLBACK_API_URL = 'https://api-v2.dropi.cl/bff/catalog/products/v4/index';

/**
 * Verifica si un token JWT ha sobrepasado su tiempo de vida (exp).
 */
export function isTokenExpired(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') return true;
  try {
    const parts = token.split('.');
    if (parts.length >= 2) {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payloadStr = Buffer.from(base64, 'base64').toString('utf8');
      const payload = JSON.parse(payloadStr);
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        return true;
      }
    }
  } catch {}
  return false;
}

/**
 * Normaliza un producto crudo proveniente de la API de Dropi
 * y calcula métricas preliminares de margen y alertas comerciales.
 */
function normalizeRawDropiProduct(item: any, localProductIds: Set<number>): LiveDropiItem {
  const dropiId = Number(item.id || item.product_id);
  const name = String(item.name || 'Producto sin nombre').trim();

  // Categoría: Dropi devuelve `categories: [{ name: "Tecnología" }]` o `category: { name: "..." }`
  const categoryName = 
    item.categories?.[0]?.name ||
    item.category?.name ||
    (typeof item.category === 'string' ? item.category : null) ||
    'General';

  // Información del proveedor
  const user = item.user || {};
  const supplierName = user.name || user.store_name || user.full_name || item.supplier_name || 'Proveedor Dropi';
  
  // En Dropi: 1 = Verificado, 2 = Premium, plan 'SUPPLIER PREMIUM'
  const categoryUser = user.category_user || {};
  const categoryUserId = user.category_user_id || categoryUser.id || item.category_user_id;
  const planName = String(user.plan?.name || '').toUpperCase();
  const categoryUserName = String(categoryUser.name || '').toUpperCase();

  const isPremium = categoryUserId === 2 || planName.includes('PREMIUM') || categoryUserName === 'PREMIUM' || item.is_premium === true;
  const isVerified = categoryUserId === 1 || categoryUserId === 2 || categoryUserName === 'VERIFICADO' || isPremium || item.is_verified === true;

  // Precios: Dropi v3 devuelve `sale_price` como el costo mayorista/proveedor
  const supplierPrice = parseFloat(item.sale_price || item.price || item.supplier_price || item.min_price || '0');
  const suggestedPrice = item.suggested_price ? parseFloat(item.suggested_price) : null;

  // Stock: si no viene en `stock`, sumar las existencias de `warehouse_product`
  let stock = parseInt(item.stock || item.quantity || '0', 10);
  if (stock === 0 && Array.isArray(item.warehouse_product)) {
    stock = item.warehouse_product.reduce((acc: number, wp: any) => acc + (parseFloat(wp.stock) || 0), 0);
  }

  // Imagen: si no viene en `image` o `photo`, extraer de `gallery` resolviendo CloudFront para urlS3
  let imageUrl: string | null = item.image || item.photo || null;
  if (!imageUrl && Array.isArray(item.gallery) && item.gallery.length > 0) {
    const mainImg = item.gallery.find((g: any) => g.main) || item.gallery[0];
    if (mainImg?.url) {
      imageUrl = mainImg.url;
    } else if (mainImg?.urlS3) {
      imageUrl = `https://d39ru7awumhhs2.cloudfront.net/${mainImg.urlS3}`;
    }
  }

  const hasVariants = Array.isArray(item.variations) && item.variations.length > 0;

  // Cálculo comercial preliminar de margen
  let grossProfit: number | null = null;
  let grossMargin: number | null = null;
  const flags: DropiProductFlagRecord[] = [];

  if (suggestedPrice !== null && suggestedPrice > 0 && suggestedPrice > supplierPrice) {
    grossProfit = suggestedPrice - supplierPrice;
    grossMargin = Math.round(((grossProfit / suggestedPrice) * 100) * 10) / 10;
  }

  // Reglas comerciales de calidad
  if (suggestedPrice !== null && suggestedPrice <= supplierPrice) {
    flags.push({
      product_id: String(dropiId),
      flag_code: 'NEGATIVE_OR_ZERO_MARGIN',
      description: `El precio sugerido ($${suggestedPrice}) es menor o igual al costo del proveedor ($${supplierPrice}).`,
      severity: 'CRITICAL'
    });
  }

  if (suggestedPrice !== null && suggestedPrice < 2000) {
    flags.push({
      product_id: String(dropiId),
      flag_code: 'SUSPICIOUS_LOW_PRICE',
      description: `El precio sugerido ($${suggestedPrice} CLP) parece anormalmente bajo.`,
      severity: 'WARNING'
    });
  }

  if (stock <= 5) {
    flags.push({
      product_id: String(dropiId),
      flag_code: 'LOW_STOCK',
      description: `Stock crítico disponible: solo ${stock} unidades.`,
      severity: 'INFO'
    });
  }

  const requiresReview = flags.length > 0;
  const isInLocalDb = localProductIds.has(dropiId);

  return {
    dropi_id: dropiId,
    name,
    category: categoryName,
    supplier_name: supplierName,
    is_verified: isVerified,
    is_premium: isPremium,
    supplier_price_min: supplierPrice,
    supplier_price_max: supplierPrice,
    suggested_price: suggestedPrice,
    stock,
    image_url: imageUrl,
    has_variants: hasVariants,
    gross_profit_preliminary: grossProfit,
    gross_margin_preliminary: grossMargin,
    requires_review: requiresReview,
    flags,
    is_in_local_db: isInLocalDb,
    raw_data: item
  };
}

/**
 * Consulta en vivo el catálogo de Dropi Chile sin guardar nada todavía.
 * Soporta paginación continua mediante `offset` (startData) y batching automático
 * respetando el límite de 40 productos por llamada que impone Dropi backend.
 */
export async function searchDropiLive(filters: DropiLiveFilterParams): Promise<LiveSearchResult> {
  const config = await getConnectionConfig();
  const token = config.encrypted_token;

  if (!token || isTokenExpired(token)) {
    return {
      success: false,
      total_found: 0,
      products: [],
      error: 'Tu sesión de Dropi ha expirado o no está activa. Por favor haz clic en "Conectar o Iniciar Sesión" para renovarla.'
    };
  }

  // Obtener IDs de productos ya guardados en nuestra base local para marcar coincidencias
  const localDbResult = await getProducts({ limit: 5000 });
  const localProductIds = new Set<number>(localDbResult.products.map((p: DropiProductRecord) => p.dropi_id));

  const targetCount = Math.min(Math.max(filters.limit || 50, 1), 200);
  const initialOffset = Math.max(filters.offset || 0, 0);
  const DROPI_MAX_PER_REQUEST = 40;

  const basePayload: any = {};

  if (filters.keywords && filters.keywords.trim() !== '') {
    basePayload.keywords = filters.keywords.trim();
  }

  if (filters.min_price !== undefined && filters.min_price !== null && filters.min_price > 0) {
    basePayload.minPrice = filters.min_price;
  }

  if (filters.max_price !== undefined && filters.max_price !== null && filters.max_price > 0) {
    basePayload.maxPrice = filters.max_price;
  }

  if (filters.category && filters.category.trim() !== '') {
    basePayload.category = [filters.category.trim()];
  }

  if (filters.categoryuser && Array.isArray(filters.categoryuser) && filters.categoryuser.length > 0) {
    basePayload.categoryuser = filters.categoryuser;
  }

  const dropiHeaders = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'X-Authorization': `Bearer ${token}`,
    'X-Host': 'cl',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  };

  const accumulatedRawList: any[] = [];
  let currentOffset = initialOffset;
  let hasMore = true;

  try {
    while (accumulatedRawList.length < targetCount) {
      const remainingNeeded = targetCount - accumulatedRawList.length;
      const requestBatchSize = Math.min(remainingNeeded, DROPI_MAX_PER_REQUEST);

      const payload = {
        ...basePayload,
        pageSize: requestBatchSize,
        startData: currentOffset
      };

      let response = await fetch(PRIMARY_API_URL, {
        method: 'POST',
        headers: dropiHeaders,
        body: JSON.stringify(payload)
      });

      // Fallback a v4 si el endpoint primario devolviera error de red/servidor
      if (!response.ok) {
        console.warn(`[DropiApi] Primary endpoint returned status ${response.status}. Intentando fallback...`);
        response = await fetch(FALLBACK_API_URL, {
          method: 'POST',
          headers: dropiHeaders,
          body: JSON.stringify(payload)
        });
      }

      if (!response.ok) {
        const errText = await response.text();
        return {
          success: false,
          total_found: 0,
          products: [],
          error: `Dropi respondió con error HTTP ${response.status}: ${errText.substring(0, 150)}`
        };
      }

      const json = (await response.json()) as any;
      const rawBatch = Array.isArray(json?.data?.objects)
        ? json.data.objects
        : Array.isArray(json?.objects)
        ? json.objects
        : Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json?.data?.products)
        ? json.data.products
        : [];

      if (rawBatch.length === 0) {
        hasMore = false;
        break;
      }

      accumulatedRawList.push(...rawBatch);
      currentOffset += rawBatch.length;

      // Si Dropi devolvió menos de lo solicitado en el lote, se llegó al fin del catálogo
      if (rawBatch.length < requestBatchSize) {
        hasMore = false;
        break;
      }
    }

    const normalizedProducts: LiveDropiItem[] = accumulatedRawList.map((item: any) =>
      normalizeRawDropiProduct(item, localProductIds)
    );

    return {
      success: true,
      total_found: normalizedProducts.length,
      products: normalizedProducts,
      next_offset: currentOffset,
      has_more: hasMore,
      message: `Se encontraron ${normalizedProducts.length} productos en Dropi Chile.`
    };
  } catch (err: any) {
    console.error('[DropiApi] Error consultando Dropi:', err);
    return {
      success: false,
      total_found: 0,
      products: [],
      error: `Error de red al consultar Dropi: ${err.message}`
    };
  }
}

/**
 * Importa los productos obtenidos de Dropi hacia nuestra base de datos local y PostgreSQL.
 * Acepta tanto un listado ya cargado en memoria (`products`) como parámetros de filtro para consultar y guardar.
 */
export async function importFromDropi(
  input: DropiLiveFilterParams | LiveImportParams
): Promise<LiveImportResult> {
  const startTime = Date.now();
  const jobId = `job_live_${Date.now()}`;

  let productsToImport: LiveDropiItem[] = [];
  let filtersUsed: DropiLiveFilterParams = {};

  if ('products' in input && Array.isArray(input.products) && input.products.length > 0) {
    productsToImport = input.products;
    filtersUsed = input.filters || {};
  } else {
    filtersUsed = ('filters' in input && input.filters) ? input.filters : (input as DropiLiveFilterParams);
  }

  // 1. Registrar trabajo de importación en estado RUNNING
  const jobRecord: DropiImportJobRecord = {
    id: jobId,
    job_type: 'API_MANUAL',
    filters_used: filtersUsed,
    total_fetched: productsToImport.length,
    total_inserted: 0,
    total_updated: 0,
    total_flagged: 0,
    total_errors: 0,
    duration_ms: 0,
    status: 'RUNNING',
    diagnostic_message: 'Iniciando importación desde Dropi...'
  };
  await createImportJob(jobRecord);

  // 2. Si no se proveyeron productos directamente, consultarlos en vivo
  if (productsToImport.length === 0) {
    const searchResult = await searchDropiLive(filtersUsed);

    if (!searchResult.success || searchResult.products.length === 0) {
      const duration = Date.now() - startTime;
      await updateImportJob(jobId, {
        status: 'FAILED',
        duration_ms: duration,
        error_message: searchResult.error || 'No se encontraron productos en Dropi con los filtros indicados.',
        finished_at: new Date().toISOString()
      });

      return {
        success: false,
        job_id: jobId,
        total_fetched: 0,
        total_inserted: 0,
        total_updated: 0,
        total_flagged: 0,
        duration_ms: duration,
        message: 'Fallo al importar productos de Dropi.',
        error: searchResult.error || 'No se recibieron productos desde Dropi.'
      };
    }

    productsToImport = searchResult.products;
  }

  let insertedCount = 0;
  let updatedCount = 0;
  let flaggedCount = 0;

  // 3. Procesar y guardar cada producto
  for (const item of productsToImport) {
    try {
      // Guardar o actualizar proveedor
      const supplierRecord: DropiSupplierRecord = {
        id: `supp_${item.dropi_id}`,
        dropi_user_id: item.raw_data?.user?.id || item.dropi_id,
        name: item.supplier_name,
        is_verified: item.is_verified,
        is_premium: item.is_premium,
        city: item.raw_data?.city || null
      };
      await upsertSupplier(supplierRecord);

      // Guardar producto
      const productRecord: DropiProductRecord = {
        id: `prod_${item.dropi_id}`,
        dropi_id: item.dropi_id,
        supplier_id: supplierRecord.id,
        supplier_name: item.supplier_name,
        name: item.name,
        category: item.category,
        supplier_price_min: item.supplier_price_min,
        supplier_price_max: item.supplier_price_max,
        suggested_price: item.suggested_price,
        stock: item.stock,
        is_verified: item.is_verified,
        is_premium: item.is_premium,
        has_variants: item.has_variants,
        image_url: item.image_url,
        status: item.requires_review ? 'FLAGGED' : 'ACTIVE',
        requires_review: item.requires_review,
        gross_profit_preliminary: item.gross_profit_preliminary,
        gross_margin_preliminary: item.gross_margin_preliminary
      };

      const saveResult = await upsertProduct(productRecord, [], item.flags);
      if (saveResult.inserted) insertedCount++;
      if (saveResult.updated) updatedCount++;
      if (item.requires_review) flaggedCount++;
    } catch (err: any) {
      console.error(`[DropiApi] Error al guardar producto ${item.dropi_id}:`, err);
    }
  }

  const durationMs = Date.now() - startTime;
  const summaryMsg = `Importación completada: ${productsToImport.length} productos procesados (${insertedCount} nuevos, ${updatedCount} actualizados, ${flaggedCount} con alertas).`;

  // 4. Actualizar estado del trabajo a COMPLETED
  await updateImportJob(jobId, {
    status: 'COMPLETED',
    total_fetched: productsToImport.length,
    total_inserted: insertedCount,
    total_updated: updatedCount,
    total_flagged: flaggedCount,
    duration_ms: durationMs,
    diagnostic_message: summaryMsg,
    finished_at: new Date().toISOString()
  });

  return {
    success: true,
    job_id: jobId,
    total_fetched: productsToImport.length,
    total_inserted: insertedCount,
    total_updated: updatedCount,
    total_flagged: flaggedCount,
    duration_ms: durationMs,
    message: summaryMsg
  };
}
