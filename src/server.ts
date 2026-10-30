// src/server.ts
// Servidor Web Autónomo para CrisCodev Dropi Product Analyzer
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getProducts,
  getConnectionConfig,
  saveConnectionConfig,
  clearConnectionConfig,
  getImportJobs,
  getSummaryStats
} from './services/dropiDb';
import { generateDropiCatalogExcel } from './services/dropiExcel';
import { searchDropiLive, importFromDropi, isTokenExpired } from './services/dropiApi';
import {
  getShippingKpiSummary,
  getAllShippingZones,
  getShippingZoneById,
  createShippingZone,
  updateShippingZone,
  deleteShippingZone,
  getChileanGeographicCatalog,
  getCommunesWithStatus,
  assignCommunesToZone,
  unassignCommunes,
  getShippingEstimate
} from './services/shippingRatesService';
import {
  getFinancialProfiles,
  getActiveFinancialProfile,
  saveFinancialProfile,
  setActiveFinancialProfile,
  calculateProductProfitability,
  runBulkProfitabilityAnalysis,
  getLatestProfitabilityResults,
  getProfitabilityRunsHistory,
  getSavedSimulations,
  saveSimulation
} from './services/profitabilityService';
import { generateProfitabilityExcel } from './services/profitabilityExcel';
import {
  getActiveBusinessUnits,
  findActiveBusinessUnit,
  saveProductToPancocosDb,
  publishViaPancocosFulfillment,
  type ProductToPublish,
} from './services/pancocosPublishService';
import { queryCopilotAnalysis, startAssistedCopilotLoginWindow } from './services/copilotService';
import {
  queryChatGptMarketPrices,
  startAssistedChatGptLoginWindow,
} from './services/chatgptMarketPricesService';
import {
  getAIConfig,
  saveAIConfig,
  getDefaultAIConfig,
} from './services/aiConfigService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3005', 10);
const HTML_FILE = path.resolve(__dirname, '..', 'public', 'index.html');

function sendJson(res: http.ServerResponse, statusCode: number, data: any) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = reqUrl.pathname;
  const method = req.method || 'GET';

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  try {
    // 1. API: ESTADO DE AUTENTICACIÓN
    if (pathname === '/api/auth') {
      if (method === 'GET') {
        const config = await getConnectionConfig();
        const expired = isTokenExpired(config.encrypted_token);
        const effectiveStatus = (config.status === 'CONNECTED' && !expired) ? 'CONNECTED' : 'DISCONNECTED';

        if (config.status === 'CONNECTED' && expired) {
          await saveConnectionConfig({
            ...config,
            status: 'DISCONNECTED'
          });
        }

        return sendJson(res, 200, {
          success: true,
          status: effectiveStatus,
          auth_mode: config.auth_mode,
          masked_token: config.masked_token,
          last_verified_at: config.last_verified_at,
          expires_at: config.expires_at,
          user_data: config.user_data,
          is_expired: expired
        });
      }

      if (method === 'POST') {
        const body = await parseBody(req);
        const token = body.token?.trim();
        if (!token) {
          return sendJson(res, 400, { success: false, error: 'Token no proporcionado.' });
        }

        const masked = token.length > 8 ? `${token.substring(0, 4)}...${token.substring(token.length - 4)}` : '****';
        let isConnected = false;
        let verifyMessage = '';

        try {
          const resp = await fetch('https://api-v2.dropi.cl/bff/catalog/products/v3/index', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'X-Authorization': `Bearer ${token}`,
              'X-Host': 'cl',
              'User-Agent': 'Mozilla/5.0 CrisCodev-DropiAnalyzer/2.0'
            },
            body: JSON.stringify({ pageSize: 1, startData: 0 })
          });

          if (resp.ok) {
            isConnected = true;
            verifyMessage = 'Conexión verificada exitosamente con Dropi Chile.';
          } else if (resp.status === 401) {
            isConnected = false;
            verifyMessage = 'Token rechazado por Dropi (HTTP 401). Verifica que la sesión esté activa.';
          } else {
            isConnected = true;
            verifyMessage = `Conexión establecida con advertencia (HTTP ${resp.status}).`;
          }
        } catch {
          isConnected = true;
          verifyMessage = 'Token guardado en modo local.';
        }

        await saveConnectionConfig({
          id: 'default',
          auth_mode: 'TOKEN',
          masked_token: masked,
          encrypted_token: token,
          status: isConnected ? 'CONNECTED' : 'DISCONNECTED',
          last_verified_at: new Date().toISOString()
        });

        return sendJson(res, 200, {
          success: true,
          status: isConnected ? 'CONNECTED' : 'DISCONNECTED',
          masked_token: masked,
          message: verifyMessage
        });
      }

            if (method === 'DELETE') {
        await clearConnectionConfig();
        return sendJson(res, 200, { success: true, message: 'Sesión desconectada exitosamente.' });
      }
    }

        // 1.1 Iniciar sesión asistida por navegador
    if (pathname === '/api/auth/start-login' && method === 'POST') {
      // Restablecer estado a DISCONNECTED mientras se realiza el nuevo inicio de sesión
      await saveConnectionConfig({
        id: 'default',
        auth_mode: 'TOKEN',
        masked_token: '',
        encrypted_token: '',
        status: 'DISCONNECTED',
        last_verified_at: new Date().toISOString()
      });

      const { spawn } = await import('node:child_process');
      const scriptPath = path.resolve(__dirname, '..', 'scripts', 'login_browser.ts');
      const tsxCli = path.resolve(__dirname, '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');
      
      console.log('[start-login] Spawning login_browser with node:', process.execPath);
      const child = spawn(process.execPath, [tsxCli, scriptPath], {
        detached: true,
        stdio: ['ignore', 'inherit', 'inherit'],
        cwd: path.resolve(__dirname, '..')
      });
      child.on('error', (err) => console.error('[start-login ERROR]', err));
      child.unref();

      return sendJson(res, 200, {
        success: true,
        message: 'Navegador asistido iniciado en pantalla. Ingresa tus credenciales en la ventana oficial de Dropi.'
      });
    }

    // 1.2 Obtener logs en tiempo real del proceso de inicio de sesión asistido
    if (pathname === '/api/auth/login-logs' && method === 'GET') {
      const logFile = path.resolve(__dirname, '..', 'src', 'data', 'login_browser.log');
      let logs: string[] = [];
      if (fs.existsSync(logFile)) {
        try {
          const raw = fs.readFileSync(logFile, 'utf-8');
          logs = raw.split('\n').filter(l => l.trim().length > 0);
        } catch {}
      }
      return sendJson(res, 200, { success: true, logs });
    }

        // 2.1 API DROPI EN VIVO: BÚSQUEDA Y PREVISUALIZACIÓN DIRECTA DESDE DROPI
    if (pathname === '/api/dropi/search' && method === 'POST') {
      const body = await parseBody(req);
      const results = await searchDropiLive(body);
      return sendJson(res, results.success ? 200 : 400, results);
    }

    // 2.2 API DROPI EN VIVO: IMPORTACIÓN DE PRODUCTOS A NUESTRA BASE DE DATOS LOCAL Y POSTGRESQL
    if (pathname === '/api/dropi/import' && method === 'POST') {
      const body = await parseBody(req);
      const results = await importFromDropi(body);
      return sendJson(res, results.success ? 200 : 400, results);
    }

    // =========================================================================
    // 2.3 API TARIFAS DE DESPACHO ESTÁNDAR POR ZONA (ETAPA 1)
    // =========================================================================

    // Indicadores KPI
    if (pathname === '/api/shipping/kpi' && method === 'GET') {
      const summary = await getShippingKpiSummary();
      return sendJson(res, 200, { success: true, ...summary });
    }

    // Catálogo Geográfico Oficial (Regiones de Chile)
    if (pathname === '/api/shipping/catalog' && method === 'GET') {
      const catalog = getChileanGeographicCatalog();
      return sendJson(res, 200, {
        success: true,
        total_regions: catalog.total_regions,
        total_communes: catalog.total_communes,
        regions: catalog.regions
      });
    }

    // Listar Zonas de Despacho
    if (pathname === '/api/shipping/zones' && method === 'GET') {
      const zones = await getAllShippingZones();
      return sendJson(res, 200, { success: true, zones });
    }

    // Crear Zona de Despacho
    if (pathname === '/api/shipping/zones' && method === 'POST') {
      const body = await parseBody(req);
      const newZone = await createShippingZone(body, 'admin');
      return sendJson(res, 201, { success: true, zone: newZone });
    }

    // Actualizar Zona o Tarifa de Despacho
    if (pathname === '/api/shipping/zones' && (method === 'PUT' || method === 'POST')) {
      const body = await parseBody(req);
      const zoneId = reqUrl.searchParams.get('id') || body.id || body.zone_id;
      if (!zoneId) {
        return sendJson(res, 400, { success: false, error: 'ID de zona no especificado.' });
      }
      const updated = await updateShippingZone(zoneId, body, 'admin');
      return sendJson(res, 200, { success: true, zone: updated });
    }

    // Eliminar o Desactivar Zona de Despacho
    if (pathname === '/api/shipping/zones' && (method === 'DELETE' || method === 'POST')) {
      const body = method === 'POST' ? await parseBody(req) : {};
      const zoneId = reqUrl.searchParams.get('id') || body.id || body.zone_id;
      if (!zoneId) {
        return sendJson(res, 400, { success: false, error: 'ID de zona no especificado.' });
      }
      const result = await deleteShippingZone(zoneId, 'admin');
      return sendJson(res, 200, result);
    }

    // Consultar Comunas Enriquecidas con Estado de Asignación y Tarifa
    if (pathname === '/api/shipping/communes' && method === 'GET') {
      const region_code = reqUrl.searchParams.get('region_code') || undefined;
      const search = reqUrl.searchParams.get('search') || undefined;
      const status = (reqUrl.searchParams.get('status') as any) || 'ALL';
      const result = await getCommunesWithStatus({ region_code, search, status });
      return sendJson(res, 200, { success: true, ...result });
    }

    // Asignar Comunas a Zona (Validación de unicidad automática)
    if (pathname === '/api/shipping/communes/assign' && method === 'POST') {
      const body = await parseBody(req);
      const zoneId = body.zone_id;
      const communeCodes = body.commune_codes;
      if (!zoneId || !Array.isArray(communeCodes) || communeCodes.length === 0) {
        return sendJson(res, 400, { success: false, error: 'Debes proporcionar zone_id y un arreglo commune_codes.' });
      }
      const result = await assignCommunesToZone(zoneId, communeCodes, 'admin');
      return sendJson(res, 200, result);
    }

    // Desasignar Comunas (volver a estado "Sin configuración")
    if (pathname === '/api/shipping/communes/unassign' && method === 'POST') {
      const body = await parseBody(req);
      const communeCodes = body.commune_codes;
      if (!Array.isArray(communeCodes) || communeCodes.length === 0) {
        return sendJson(res, 400, { success: false, error: 'Debes proporcionar un arreglo commune_codes para desasignar.' });
      }
      const result = await unassignCommunes(communeCodes, 'admin');
      return sendJson(res, 200, result);
    }

    // Simulador y Consulta de Despacho Estimado (Etapa 1 + Preparación Etapa 2)
    if (pathname === '/api/shipping/estimate' && method === 'POST') {
      const body = await parseBody(req);
      const regionCode = body.region_code;
      const communeCode = body.commune_code;
      const effectiveDate = body.effective_date || new Date();
      if (!regionCode || !communeCode) {
        return sendJson(res, 400, { success: false, error: 'region_code y commune_code son requeridos.' });
      }
      const estimate = await getShippingEstimate(regionCode, communeCode, effectiveDate);
      return sendJson(res, 200, { success: true, estimate });
    }

    // =========================================================================
    // ETAPA 2: MOTOR DE RENTABILIDAD, COSTOS E IVA (APIs)
    // =========================================================================

    // 1. Perfiles Financieros (Sección 3)
    if (pathname === '/api/profitability/profiles' && method === 'GET') {
      const profiles = await getFinancialProfiles();
      const active = await getActiveFinancialProfile();
      return sendJson(res, 200, { success: true, profiles, active_profile: active });
    }

    if (pathname === '/api/profitability/profiles' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.name || typeof body.name !== 'string') {
        return sendJson(res, 400, { success: false, error: 'El nombre del perfil es requerido.' });
      }
      const saved = await saveFinancialProfile(body);
      return sendJson(res, 200, { success: true, profile: saved });
    }

    if (pathname === '/api/profitability/profiles/active' && method === 'PUT') {
      const body = await parseBody(req);
      if (!body.profile_id) {
        return sendJson(res, 400, { success: false, error: 'profile_id es requerido.' });
      }
      const activated = await setActiveFinancialProfile(body.profile_id);
      return sendJson(res, 200, { success: true, profile: activated });
    }

    // Unidades de negocio activas de Pancocos (selector del botón "Publicar Producto")
    if (pathname === '/api/business-units' && method === 'GET') {
      const businessUnits = await getActiveBusinessUnits();
      return sendJson(res, 200, { success: true, business_units: businessUnits });
    }

    // Publicar producto simulado: guarda en la BD de Pancocos y publica en Shopify vía Pancocos-Fulfillment
    if (pathname === '/api/profitability/publish-product' && method === 'POST') {
      const body = await parseBody(req);

      const businessUnitId = Number(body.business_unit_id);
      if (!Number.isInteger(businessUnitId) || businessUnitId <= 0) {
        return sendJson(res, 400, { success: false, error: 'business_unit_id es requerido.' });
      }
      if (!body.product_id) {
        return sendJson(res, 400, { success: false, error: 'product_id es requerido.' });
      }

      const businessUnit = await findActiveBusinessUnit(businessUnitId);
      if (!businessUnit) {
        return sendJson(res, 404, { success: false, error: 'La unidad de negocio no existe o no está activa.' });
      }

      const prodResult = await getProducts({ limit: 1000 });
      const product = prodResult.products.find(
        p => p.id === body.product_id || p.dropi_id === Number(body.product_id),
      );
      if (!product) {
        return sendJson(res, 404, { success: false, error: 'Producto no encontrado.' });
      }

      // La evaluación se recalcula en el servidor para no confiar en precios enviados por el navegador
      const profiles = await getFinancialProfiles();
      const profile = body.profile_id
        ? (profiles.find(p => p.id === body.profile_id) || await getActiveFinancialProfile())
        : (await getActiveFinancialProfile());

      const evaluation = await calculateProductProfitability({
        product,
        profile,
        taxTreatment: body.tax_treatment,
        customSalePrice: body.custom_sale_price ? Number(body.custom_sale_price) : undefined,
        customAdCost: body.custom_ad_cost !== undefined ? Number(body.custom_ad_cost) : undefined,
      });

      const productToPublish: ProductToPublish = {
        dropiId: evaluation.dropi_id,
        name: evaluation.product_name,
        description: `${evaluation.product_name}. Categoría: ${evaluation.category}. Proveedor: ${evaluation.supplier_name}.`,
        category: evaluation.category,
        supplierName: evaluation.supplier_name,
        imageUrl: evaluation.image_url ?? null,
        supplierPrice: evaluation.supplier_price,
        suggestedPrice: evaluation.suggested_price,
        salePrice: evaluation.sale_price_used,
        stock: evaluation.stock,
        simulatedMarginPct: evaluation.avg_margin_pct,
      };

      if (!(productToPublish.salePrice > 0) || !(productToPublish.supplierPrice > 0)) {
        return sendJson(res, 400, {
          success: false,
          error: 'El producto necesita un precio de venta y un costo de proveedor mayores a 0 para publicarse.',
        });
      }

      // Paso 1: guardar en la base de datos de Pancocos
      const saved = await saveProductToPancocosDb(businessUnit, productToPublish);

      // Paso 2: publicar en Shopify. Si falla, el producto ya quedó guardado en Pancocos
      // y el reintento es seguro (ambos pasos son idempotentes).
      try {
        const published = await publishViaPancocosFulfillment(
          businessUnit,
          productToPublish,
          saved.pancocosProductId,
        );
        return sendJson(res, 200, {
          success: true,
          business_unit: { id: businessUnit.id, name: businessUnit.name },
          pancocos_product_id: saved.pancocosProductId,
          shopify_product_id: published.shopifyProductId,
          shopify_variant_id: published.shopifyVariantId,
          updated_existing: published.updatedExisting,
        });
      } catch (shopifyError: any) {
        console.error('[Publish] Producto guardado en Pancocos pero falló Shopify:', shopifyError?.message);
        return sendJson(res, 502, {
          success: false,
          partial: true,
          pancocos_product_id: saved.pancocosProductId,
          error: `El producto se guardó en Pancocos (#${saved.pancocosProductId}), pero falló la publicación en Shopify: ${shopifyError?.message ?? 'error desconocido'}`,
        });
      }
    }

    // 2. Evaluación Individual de Producto / Simulador Interactivo (Sección 10)
    if (pathname === '/api/profitability/evaluate-product' && method === 'POST') {
      const body = await parseBody(req);
      let product = body.product;

      if (!product && body.product_id) {
        const prodResult = await getProducts({ limit: 1000 });
        product = prodResult.products.find(p => p.id === body.product_id || p.dropi_id === Number(body.product_id));
      }

      if (!product) {
        return sendJson(res, 400, { success: false, error: 'Debes proporcionar product o product_id válido.' });
      }

      const profiles = await getFinancialProfiles();
      const profile = body.profile_id
        ? (profiles.find(p => p.id === body.profile_id) || await getActiveFinancialProfile())
        : (await getActiveFinancialProfile());

      const evaluation = await calculateProductProfitability({
        product,
        profile,
        taxTreatment: body.tax_treatment,
        customSalePrice: body.custom_sale_price ? Number(body.custom_sale_price) : undefined,
        customAdCost: body.custom_ad_cost !== undefined ? Number(body.custom_ad_cost) : undefined
      });

      return sendJson(res, 200, { success: true, evaluation });
    }

    // 3. Ejecución de Análisis Masivo de Rentabilidad (Sección 11)
    if (pathname === '/api/profitability/evaluate-batch' && method === 'POST') {
      const body = await parseBody(req);
      const summary = await runBulkProfitabilityAnalysis({
        profileId: body.profile_id,
        zoneId: body.zone_id,
        category: body.category,
        minPrice: body.min_price ? Number(body.min_price) : undefined,
        maxPrice: body.max_price ? Number(body.max_price) : undefined,
        onlyInStock: body.only_in_stock === true,
        taxTreatment: body.tax_treatment
      });

      return sendJson(res, 200, { success: true, summary });
    }

    // 4. Resultados de Rentabilidad más Recientes
    if (pathname === '/api/profitability/latest' && method === 'GET') {
      let results = getLatestProfitabilityResults();
      if (results.length === 0) {
        // Ejecución inicial automática si no hay análisis previo
        const run = await runBulkProfitabilityAnalysis();
        results = run.products_results || [];
      }
      return sendJson(res, 200, { success: true, results, count: results.length });
    }

    // 5. Historial de Ejecuciones de Rentabilidad
    if (pathname === '/api/profitability/runs' && method === 'GET') {
      const runs = getProfitabilityRunsHistory();
      return sendJson(res, 200, { success: true, runs });
    }

    // 6. Simulaciones Interactivas Guardadas (Sección 10 y 12)
    if (pathname === '/api/profitability/simulations' && method === 'GET') {
      const simulations = getSavedSimulations();
      return sendJson(res, 200, { success: true, simulations });
    }

    if (pathname === '/api/profitability/simulations' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.product_id || !body.input_params || !body.results) {
        return sendJson(res, 400, { success: false, error: 'Faltan campos obligatorios para guardar la simulación.' });
      }
      const saved = saveSimulation(body);
      return sendJson(res, 200, { success: true, simulation: saved });
    }

    // 7. Exportación Excel de Rentabilidad (Sección 14)
    if (pathname === '/api/profitability/export' && method === 'GET') {
      let results = getLatestProfitabilityResults();
      if (results.length === 0) {
        const run = await runBulkProfitabilityAnalysis();
        results = run.products_results || [];
      }
      const activeProfile = await getActiveFinancialProfile();
      const excelBuffer = await generateProfitabilityExcel({
        results,
        profile: activeProfile
      });

      const filename = `criscodev_rentabilidad_dropi_${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache'
      });
      return res.end(excelBuffer);
    }

    // 8. Consulta IA ("Análisis IA" - ChatGPT o Copilot según Administración IA)
    if (pathname === '/api/profitability/ai-analysis' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.product_name) {
        return sendJson(res, 400, { success: false, error: 'product_name es requerido para el análisis IA.' });
      }
      const result = await queryCopilotAnalysis({
        product_name: body.product_name,
        dropi_id: body.dropi_id,
        supplier_price: body.supplier_price ? Number(body.supplier_price) : undefined,
        suggested_price: body.suggested_price ? Number(body.suggested_price) : undefined,
        category: body.category,
        sale_price: body.sale_price ? Number(body.sale_price) : undefined,
        provider: body.provider,
        custom_prompt: body.custom_prompt,
      });
      return sendJson(res, 200, result);
    }

    if (pathname === '/api/copilot/start-login' && method === 'POST') {
      const result = await startAssistedCopilotLoginWindow();
      return sendJson(res, 200, result);
    }

    // 9. Consulta de Precios del Mercado en Chile vía sesión de IA (ChatGPT o Copilot)
    if (pathname === '/api/profitability/market-prices' && method === 'POST') {
      const body = await parseBody(req);
      if (!body.product_name) {
        return sendJson(res, 400, {
          success: false,
          error: 'product_name es requerido para consultar los precios del mercado.',
        });
      }
      const result = await queryChatGptMarketPrices({
        product_name: String(body.product_name),
        dropi_id: body.dropi_id,
        supplier_price: body.supplier_price ? Number(body.supplier_price) : undefined,
        suggested_price: body.suggested_price ? Number(body.suggested_price) : undefined,
        sale_price: body.sale_price ? Number(body.sale_price) : undefined,
        provider: body.provider,
        custom_prompt: body.custom_prompt,
      });
      return sendJson(res, 200, result);
    }

    if (pathname === '/api/chatgpt/start-login' && method === 'POST') {
      const result = await startAssistedChatGptLoginWindow();
      return sendJson(res, 200, result);
    }

    // 10. Administración IA (selección ChatGPT / Copilot y edición de Prompts)
    if (pathname === '/api/ai-config' && method === 'GET') {
      const config = getAIConfig();
      const defaults = getDefaultAIConfig();
      return sendJson(res, 200, {
        success: true,
        config,
        defaults,
      });
    }

    if (pathname === '/api/ai-config' && method === 'POST') {
      const body = await parseBody(req);
      const saved = saveAIConfig({
        provider: body.provider,
        analysis_prompt_template: body.analysis_prompt_template,
        market_prices_prompt_template: body.market_prices_prompt_template,
      });
      return sendJson(res, 200, {
        success: true,
        config: saved,
        message: 'Configuración de Administración IA guardada correctamente.',
      });
    }

    // 2. API: CONSULTA DE PRODUCTOS (BASE DE DATOS LOCAL/POSTGRESQL)
    if (pathname === '/api/products' && method === 'GET') {
      const search = reqUrl.searchParams.get('search') || '';
      const category = reqUrl.searchParams.get('category') || undefined;
      const is_verified = reqUrl.searchParams.get('is_verified') === 'true' ? true : undefined;
      const is_premium = reqUrl.searchParams.get('is_premium') === 'true' ? true : undefined;
      const exclude_flags = reqUrl.searchParams.get('exclude_flags') === 'true';

      const min_price_param = reqUrl.searchParams.get('min_price');
      const min_price = min_price_param ? parseFloat(min_price_param) : undefined;

      const max_price_param = reqUrl.searchParams.get('max_price');
      const max_price = max_price_param ? parseFloat(max_price_param) : undefined;

      const min_margin_param = reqUrl.searchParams.get('min_margin');
      const min_margin = min_margin_param ? parseFloat(min_margin_param) : undefined;

      const limit_param = reqUrl.searchParams.get('limit');
      const limit = limit_param ? parseInt(limit_param, 10) : 50;

      const offset_param = reqUrl.searchParams.get('offset');
      const offset = offset_param ? parseInt(offset_param, 10) : 0;

      const sort_by = (reqUrl.searchParams.get('sort_by') as any) || 'margin_desc';

      const result = await getProducts({
        search,
        category,
        is_verified,
        is_premium,
        exclude_flags,
        min_price,
        max_price,
        min_margin,
        limit,
        offset,
        sort_by
      });

      const stats = await getSummaryStats();
      return sendJson(res, 200, { success: true, ...result, stats });
    }

    // 3. API: HISTORIAL DE TRABAJOS
    if (pathname === '/api/jobs' && method === 'GET') {
      const jobs = await getImportJobs(20);
      return sendJson(res, 200, { success: true, jobs });
    }

    // 4. API: EXPORTACIÓN EXCEL (.XLSX)
    if (pathname === '/api/export' && method === 'GET') {
      const result = await getProducts({ limit: 5000, offset: 0, sort_by: 'margin_desc' });
      const excelBuffer = await generateDropiCatalogExcel(
        result.products,
        'Catálogo Completo - CrisCodev Dropi Analyzer'
      );

      const filename = `criscodev_dropi_catalogo_${new Date().toISOString().slice(0, 10)}.xlsx`;
      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache'
      });
      return res.end(excelBuffer);
    }

    // 5. DASHBOARD WEB INTERACTIVO
    if (pathname === '/' && method === 'GET') {
      if (fs.existsSync(HTML_FILE)) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(fs.readFileSync(HTML_FILE, 'utf-8'));
      }
      return sendJson(res, 404, { success: false, error: 'index.html no encontrado' });
    }

    sendJson(res, 404, { success: false, error: 'Ruta no encontrada.' });
  } catch (err: any) {
    console.error('[Server Error]', err);
    sendJson(res, 500, { success: false, error: err.message });
  }
});

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n[Error EADDRINUSE] El puerto ${PORT} está en uso por otro proceso.`);
    console.error(`Sugerencia: Cierra la instancia previa o inicia con otro puerto: PORT=${PORT + 1} npm run dev\n`);
    process.exit(1);
  }
  console.error('[Server Error]', err);
});

server.listen(PORT, () => {
  console.log('======================================================');
  console.log(' CrisCodev – Dropi Product Analyzer (Servidor Autónomo)');
  console.log('======================================================');
  console.log(` > Dashboard Web: http://localhost:${PORT}`);
  console.log(` > API Catálogo:  http://localhost:${PORT}/api/products`);
  console.log(` > Exportar XLSX: http://localhost:${PORT}/api/export`);
  console.log(` > Estado Conex.: http://localhost:${PORT}/api/auth`);
  console.log('======================================================');
});
