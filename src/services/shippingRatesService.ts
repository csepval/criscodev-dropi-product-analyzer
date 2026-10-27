// src/services/shippingRatesService.ts
// Servicio de Administración de Zonas y Tarifas de Despacho Estándar de Chile
// Para CrisCodev Dropi Product Analyzer (Etapa 1)
// Con persistencia PostgreSQL e integración resiliente en almacenamiento local JSON

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, isDatabaseAvailable } from '../lib/db';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Modelos de datos principales
export interface ShippingZone {
  id: string;
  name: string;
  description?: string | null;
  status: 'ACTIVE' | 'INACTIVE';
  requires_quote: boolean;
  created_at: string;
  updated_at: string;
  rate?: ShippingZoneRate | null;
  communes_count?: number;
}

export interface ShippingZoneRate {
  id: string;
  zone_id: string;
  customer_shipping_price: number | null;
  estimated_dropi_cost: number | null;
  customer_price_includes_vat: boolean;
  estimated_cost_includes_vat: boolean;
  valid_from: string;
  valid_until?: string | null;
  is_active: boolean;
  origin: 'MANUAL' | 'REFERENCIA' | 'HISTORICO';
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShippingZoneCommune {
  id: string;
  zone_id: string;
  region_code: string;
  commune_code: string;
  created_at: string;
}

export interface ShippingRateAuditRecord {
  id: string;
  rate_id?: string | null;
  zone_id: string;
  action: string;
  previous_values?: any;
  new_values?: any;
  changed_by: string;
  changed_at: string;
}

export interface ShippingEstimateResult {
  zone_id: string | null;
  zone_name: string | null;
  region_code: string;
  commune_code: string;
  commune_name: string;
  customer_shipping_price: number | null;
  estimated_dropi_cost: number | null;
  margin_shipping: number | null;
  customer_price_includes_vat: boolean;
  estimated_cost_includes_vat: boolean;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  requires_quote: boolean;
  origin: string | null;
  status: 'CONFIGURED' | 'NOT_CONFIGURED' | 'REQUIRES_QUOTE' | 'EXPIRED';
  diagnostic_message: string;
}

export interface ShippingKpiSummary {
  total_zones: number;
  active_zones: number;
  inactive_zones: number;
  quote_required_zones: number;
  assigned_communes: number;
  unassigned_communes: number;
  total_communes: number;
  last_modified_at: string | null;
}

// Rutas a archivos de almacenamiento local resiliente
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const ZONES_FILE = path.join(DATA_DIR, 'shipping_zones.json');
const RATES_FILE = path.join(DATA_DIR, 'shipping_rates.json');
const COMMUNES_FILE = path.join(DATA_DIR, 'shipping_zone_communes.json');
const AUDIT_FILE = path.join(DATA_DIR, 'shipping_audit.json');
const CATALOG_FILE = path.join(DATA_DIR, 'chile_geographic_catalog.json');

// Carga en caché del catálogo geográfico oficial
interface ChileanCatalog {
  total_regions: number;
  total_communes: number;
  regions: {
    region_code: string;
    region_name: string;
    region_roman: string;
    communes: {
      commune_code: string;
      commune_name: string;
      province_name: string;
    }[];
  }[];
  communes: {
    commune_code: string;
    commune_name: string;
    province_name: string;
    region_code: string;
    region_name: string;
    region_roman: string;
  }[];
}

let cachedCatalog: ChileanCatalog | null = null;

export function getChileanGeographicCatalog(): ChileanCatalog {
  if (cachedCatalog) return cachedCatalog;
  if (!fs.existsSync(CATALOG_FILE)) {
    throw new Error(`Catálogo geográfico de Chile no encontrado en: ${CATALOG_FILE}`);
  }
  cachedCatalog = JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf-8'));
  return cachedCatalog!;
}

// Helpers de lectura y escritura JSON local
function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn(`[ShippingRatesService] Error leyendo archivo ${filePath}:`, err);
  }
  return fallback;
}

function writeJsonFile<T>(filePath: string, data: T): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error(`[ShippingRatesService] Error escribiendo archivo ${filePath}:`, err);
  }
}

// -----------------------------------------------------------------------------
// Inicialización y Sembrado de Zonas Sugeridas Iniciales (Sección 3.1)
// -----------------------------------------------------------------------------
export async function initializeShippingRatesData(): Promise<void> {
  const existingZones = readJsonFile<ShippingZone[]>(ZONES_FILE, []);
  if (existingZones.length > 0) {
    return; // Ya fue inicializado
  }

  const now = new Date().toISOString();
  const catalog = getChileanGeographicCatalog();

  // Zonas iniciales sugeridas
  const initialZones: ShippingZone[] = [
    {
      id: 'zone_santiago_urbano',
      name: 'Santiago urbano',
      description: 'Comunas céntricas y de alta conectividad del Gran Santiago.',
      status: 'ACTIVE',
      requires_quote: false,
      created_at: now,
      updated_at: now
    },
    {
      id: 'zone_rm_periferica',
      name: 'Región Metropolitana periférica',
      description: 'Comunas rurales y semi-urbanas de los valles de la Región Metropolitana.',
      status: 'ACTIVE',
      requires_quote: false,
      created_at: now,
      updated_at: now
    },
    {
      id: 'zone_regiones_centrales',
      name: 'Regiones centrales',
      description: 'Valparaíso, O\'Higgins, Maule y Coquimbo.',
      status: 'ACTIVE',
      requires_quote: false,
      created_at: now,
      updated_at: now
    },
    {
      id: 'zone_regiones_alejadas',
      name: 'Regiones alejadas',
      description: 'Norte y Sur de Chile (Antofagasta, Atacama, Biobío, Araucanía, Los Ríos, Los Lagos).',
      status: 'ACTIVE',
      requires_quote: false,
      created_at: now,
      updated_at: now
    },
    {
      id: 'zone_zonas_extremas',
      name: 'Zonas extremas',
      description: 'Arica, Tarapacá, Aysén, Magallanes y territorios insulares. Requiere cotización previa.',
      status: 'ACTIVE',
      requires_quote: true,
      created_at: now,
      updated_at: now
    }
  ];

  // Tarifas iniciales
  const initialRates: ShippingZoneRate[] = [
    {
      id: 'rate_santiago_urbano_01',
      zone_id: 'zone_santiago_urbano',
      customer_shipping_price: 3990,
      estimated_dropi_cost: 4500,
      customer_price_includes_vat: true,
      estimated_cost_includes_vat: true,
      valid_from: now,
      valid_until: null,
      is_active: true,
      origin: 'REFERENCIA',
      notes: 'Tarifa urbana inicial de referencia. Valor con IVA incluido.',
      created_at: now,
      updated_at: now
    },
    {
      id: 'rate_rm_periferica_01',
      zone_id: 'zone_rm_periferica',
      customer_shipping_price: 4990,
      estimated_dropi_cost: 5200,
      customer_price_includes_vat: true,
      estimated_cost_includes_vat: true,
      valid_from: now,
      valid_until: null,
      is_active: true,
      origin: 'REFERENCIA',
      notes: 'Tarifa RM periférica de referencia.',
      created_at: now,
      updated_at: now
    },
    {
      id: 'rate_regiones_centrales_01',
      zone_id: 'zone_regiones_centrales',
      customer_shipping_price: 5990,
      estimated_dropi_cost: 6200,
      customer_price_includes_vat: true,
      estimated_cost_includes_vat: true,
      valid_from: now,
      valid_until: null,
      is_active: true,
      origin: 'REFERENCIA',
      notes: 'Tarifa regiones centrales (V, VI, VII, IV).',
      created_at: now,
      updated_at: now
    },
    {
      id: 'rate_regiones_alejadas_01',
      zone_id: 'zone_regiones_alejadas',
      customer_shipping_price: 7990,
      estimated_dropi_cost: 8500,
      customer_price_includes_vat: true,
      estimated_cost_includes_vat: true,
      valid_from: now,
      valid_until: null,
      is_active: true,
      origin: 'REFERENCIA',
      notes: 'Tarifa regiones norte y sur alejadas.',
      created_at: now,
      updated_at: now
    },
    {
      id: 'rate_zonas_extremas_01',
      zone_id: 'zone_zonas_extremas',
      customer_shipping_price: null,
      estimated_dropi_cost: null,
      customer_price_includes_vat: true,
      estimated_cost_includes_vat: true,
      valid_from: now,
      valid_until: null,
      is_active: true,
      origin: 'REFERENCIA',
      notes: 'Zonas extremas sin cobertura estándar fija. Requiere cotización directa.',
      created_at: now,
      updated_at: now
    }
  ];

  // Asignación explícita de comunas a las zonas iniciales
  // Santiago Urbano: comunas centrales del Gran Santiago y Cordillera
  const santiagoUrbanoCodes = new Set([
    '13101', '13102', '13103', '13104', '13105', '13106', '13107', '13108',
    '13109', '13110', '13111', '13112', '13113', '13114', '13115', '13116',
    '13117', '13118', '13119', '13120', '13121', '13122', '13123', '13124',
    '13125', '13126', '13127', '13128', '13129', '13130', '13131', '13132',
    '13201', '13401' // Puente Alto, San Bernardo
  ]);

  // RM Periférica: valles de Chacabuco, Maipo, Melipilla, Talagante
  const rmPerifericaCodes = new Set([
    '13202', '13203', '13301', '13302', '13303', '13402', '13403', '13404',
    '13501', '13502', '13503', '13504', '13505', '13601', '13602', '13603',
    '13604', '13605'
  ]);

  // Zonas Extremas: Arica y Parinacota (15), Tarapacá (01), Aysén (11), Magallanes (12), Isla de Pascua y Juan Fernández
  const zonasExtremasRegions = new Set(['15', '01', '11', '12']);
  const zonasExtremasSpecialCodes = new Set(['05104', '05201']); // Juan Fernández, Isla de Pascua

  // Regiones Centrales: Valparaíso (05), O'Higgins (06), Maule (07), Coquimbo (04)
  const regionesCentralesRegions = new Set(['04', '05', '06', '07']);

  // Regiones Alejadas: Antofagasta (02), Atacama (03), Biobío (08), Araucanía (09), Los Ríos (14), Los Lagos (10), Ñuble (16)
  const regionesAlejadasRegions = new Set(['02', '03', '08', '09', '14', '10', '16']);

  const initialCommunes: ShippingZoneCommune[] = [];

  for (const c of catalog.communes) {
    let assignedZoneId: string | null = null;

    if (santiagoUrbanoCodes.has(c.commune_code)) {
      assignedZoneId = 'zone_santiago_urbano';
    } else if (rmPerifericaCodes.has(c.commune_code)) {
      assignedZoneId = 'zone_rm_periferica';
    } else if (zonasExtremasRegions.has(c.region_code) || zonasExtremasSpecialCodes.has(c.commune_code)) {
      assignedZoneId = 'zone_zonas_extremas';
    } else if (regionesCentralesRegions.has(c.region_code)) {
      assignedZoneId = 'zone_regiones_centrales';
    } else if (regionesAlejadasRegions.has(c.region_code)) {
      assignedZoneId = 'zone_regiones_alejadas';
    }

    if (assignedZoneId) {
      initialCommunes.push({
        id: `szc_${c.commune_code}`,
        zone_id: assignedZoneId,
        region_code: c.region_code,
        commune_code: c.commune_code,
        created_at: now
      });
    }
  }

  const initialAudits: ShippingRateAuditRecord[] = [
    {
      id: `audit_init_${Date.now()}`,
      zone_id: 'zone_santiago_urbano',
      action: 'SYSTEM_INITIALIZE',
      previous_values: null,
      new_values: { zones_count: initialZones.length, communes_count: initialCommunes.length },
      changed_by: 'system',
      changed_at: now
    }
  ];

  writeJsonFile(ZONES_FILE, initialZones);
  writeJsonFile(RATES_FILE, initialRates);
  writeJsonFile(COMMUNES_FILE, initialCommunes);
  writeJsonFile(AUDIT_FILE, initialAudits);

  // Intentar sembrado en PostgreSQL si está disponible
  try {
    const dbAvailable = await isDatabaseAvailable();
    if (dbAvailable) {
      for (const z of initialZones) {
        await query(
          `INSERT INTO shipping_zones (id, name, description, status, requires_quote, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, requires_quote = EXCLUDED.requires_quote`,
          [z.id, z.name, z.description, z.status, z.requires_quote, z.created_at, z.updated_at]
        );
      }
      for (const r of initialRates) {
        await query(
          `INSERT INTO shipping_zone_rates (id, zone_id, customer_shipping_price, estimated_dropi_cost, customer_price_includes_vat, estimated_cost_includes_vat, valid_from, valid_until, is_active, origin, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           ON CONFLICT (id) DO UPDATE SET customer_shipping_price = EXCLUDED.customer_shipping_price, estimated_dropi_cost = EXCLUDED.estimated_dropi_cost`,
          [r.id, r.zone_id, r.customer_shipping_price, r.estimated_dropi_cost, r.customer_price_includes_vat, r.estimated_cost_includes_vat, r.valid_from, r.valid_until, r.is_active, r.origin, r.notes, r.created_at, r.updated_at]
        );
      }
      for (const c of initialCommunes) {
        await query(
          `INSERT INTO shipping_zone_communes (zone_id, region_code, commune_code, created_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (commune_code) DO UPDATE SET zone_id = EXCLUDED.zone_id`,
          [c.zone_id, c.region_code, c.commune_code, c.created_at]
        );
      }
    }
  } catch (err) {
    console.warn('[ShippingRatesService] No se pudo sembrar en PostgreSQL:', err);
  }
}

// -----------------------------------------------------------------------------
// Consultas y Operaciones de Zonas y Tarifas
// -----------------------------------------------------------------------------

/**
 * Resumen de indicadores KPI generales para la sección 5.1
 */
export async function getShippingKpiSummary(): Promise<ShippingKpiSummary> {
  await initializeShippingRatesData();
  const catalog = getChileanGeographicCatalog();
  const zones = readJsonFile<ShippingZone[]>(ZONES_FILE, []);
  const rates = readJsonFile<ShippingZoneRate[]>(RATES_FILE, []);
  const communes = readJsonFile<ShippingZoneCommune[]>(COMMUNES_FILE, []);
  const audits = readJsonFile<ShippingRateAuditRecord[]>(AUDIT_FILE, []);

  const totalZones = zones.length;
  const activeZones = zones.filter(z => z.status === 'ACTIVE').length;
  const inactiveZones = zones.filter(z => z.status === 'INACTIVE').length;
  const quoteRequiredZones = zones.filter(z => z.requires_quote).length;

  const assignedCommunes = communes.length;
  const totalCommunes = catalog.total_communes;
  const unassignedCommunes = Math.max(totalCommunes - assignedCommunes, 0);

  let lastModifiedAt: string | null = null;
  if (audits.length > 0) {
    const sorted = [...audits].sort((a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime());
    lastModifiedAt = sorted[0].changed_at;
  } else if (zones.length > 0) {
    const sorted = [...zones].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    lastModifiedAt = sorted[0].updated_at;
  }

  return {
    total_zones: totalZones,
    active_zones: activeZones,
    inactive_zones: inactiveZones,
    quote_required_zones: quoteRequiredZones,
    assigned_communes: assignedCommunes,
    unassigned_communes: unassignedCommunes,
    total_communes: totalCommunes,
    last_modified_at: lastModifiedAt
  };
}

/**
 * Obtener listado de todas las zonas con su tarifa activa y cantidad de comunas
 */
export async function getAllShippingZones(): Promise<ShippingZone[]> {
  await initializeShippingRatesData();
  const zones = readJsonFile<ShippingZone[]>(ZONES_FILE, []);
  const rates = readJsonFile<ShippingZoneRate[]>(RATES_FILE, []);
  const communes = readJsonFile<ShippingZoneCommune[]>(COMMUNES_FILE, []);

  return zones.map(z => {
    const activeRate = rates.find(r => r.zone_id === z.id && r.is_active) || null;
    const count = communes.filter(c => c.zone_id === z.id).length;
    return {
      ...z,
      rate: activeRate,
      communes_count: count
    };
  });
}

/**
 * Obtener zona por ID
 */
export async function getShippingZoneById(id: string): Promise<ShippingZone | null> {
  const zones = await getAllShippingZones();
  return zones.find(z => z.id === id) || null;
}

/**
 * Crear nueva zona de despacho con tarifa inicial opcional
 */
export async function createShippingZone(
  data: {
    name: string;
    description?: string;
    status?: 'ACTIVE' | 'INACTIVE';
    requires_quote?: boolean;
    customer_shipping_price?: number | null;
    estimated_dropi_cost?: number | null;
    customer_price_includes_vat?: boolean;
    estimated_cost_includes_vat?: boolean;
    origin?: 'MANUAL' | 'REFERENCIA' | 'HISTORICO';
    notes?: string;
  },
  changedBy: string = 'admin'
): Promise<ShippingZone> {
  if (!data.name || data.name.trim() === '') {
    throw new Error('El nombre de la zona es obligatorio.');
  }

  const zones = readJsonFile<ShippingZone[]>(ZONES_FILE, []);
  const rates = readJsonFile<ShippingZoneRate[]>(RATES_FILE, []);
  const audits = readJsonFile<ShippingRateAuditRecord[]>(AUDIT_FILE, []);

  const now = new Date().toISOString();
  const slug = data.name.toLowerCase().trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '_');
  const zoneId = `zone_${slug}_${Date.now().toString().slice(-4)}`;

  const newZone: ShippingZone = {
    id: zoneId,
    name: data.name.trim(),
    description: data.description?.trim() || null,
    status: data.status || 'ACTIVE',
    requires_quote: Boolean(data.requires_quote),
    created_at: now,
    updated_at: now
  };

  const newRate: ShippingZoneRate = {
    id: `rate_${zoneId}_${Date.now().toString().slice(-4)}`,
    zone_id: zoneId,
    customer_shipping_price: data.requires_quote ? null : (data.customer_shipping_price ?? 3990),
    estimated_dropi_cost: data.requires_quote ? null : (data.estimated_dropi_cost ?? 3990),
    customer_price_includes_vat: data.customer_price_includes_vat ?? true,
    estimated_cost_includes_vat: data.estimated_cost_includes_vat ?? true,
    valid_from: now,
    valid_until: null,
    is_active: true,
    origin: data.origin || 'MANUAL',
    notes: data.notes?.trim() || null,
    created_at: now,
    updated_at: now
  };

  zones.push(newZone);
  rates.push(newRate);

  const auditEntry: ShippingRateAuditRecord = {
    id: `audit_${Date.now()}`,
    rate_id: newRate.id,
    zone_id: zoneId,
    action: 'CREATE_ZONE',
    previous_values: null,
    new_values: { zone: newZone, rate: newRate },
    changed_by: changedBy,
    changed_at: now
  };
  audits.push(auditEntry);

  writeJsonFile(ZONES_FILE, zones);
  writeJsonFile(RATES_FILE, rates);
  writeJsonFile(AUDIT_FILE, audits);

  // PostgreSQL sync
  try {
    if (await isDatabaseAvailable()) {
      await query(
        `INSERT INTO shipping_zones (id, name, description, status, requires_quote, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [newZone.id, newZone.name, newZone.description, newZone.status, newZone.requires_quote, newZone.created_at, newZone.updated_at]
      );
      await query(
        `INSERT INTO shipping_zone_rates (id, zone_id, customer_shipping_price, estimated_dropi_cost, customer_price_includes_vat, estimated_cost_includes_vat, valid_from, valid_until, is_active, origin, notes, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [newRate.id, newRate.zone_id, newRate.customer_shipping_price, newRate.estimated_dropi_cost, newRate.customer_price_includes_vat, newRate.estimated_cost_includes_vat, newRate.valid_from, newRate.valid_until, newRate.is_active, newRate.origin, newRate.notes, newRate.created_at, newRate.updated_at]
      );
      await query(
        `INSERT INTO shipping_rate_audit (rate_id, zone_id, action, previous_values, new_values, changed_by, changed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [auditEntry.rate_id, auditEntry.zone_id, auditEntry.action, JSON.stringify(auditEntry.previous_values), JSON.stringify(auditEntry.new_values), auditEntry.changed_by, auditEntry.changed_at]
      );
    }
  } catch (err) {
    console.warn('[ShippingRatesService] Advertencia PostgreSQL al crear zona:', err);
  }

  return {
    ...newZone,
    rate: newRate,
    communes_count: 0
  };
}

/**
 * Modificar una zona existente o su tarifa financiera
 */
export async function updateShippingZone(
  zoneId: string,
  data: {
    name?: string;
    description?: string;
    status?: 'ACTIVE' | 'INACTIVE';
    requires_quote?: boolean;
    customer_shipping_price?: number | null;
    estimated_dropi_cost?: number | null;
    customer_price_includes_vat?: boolean;
    estimated_cost_includes_vat?: boolean;
    origin?: 'MANUAL' | 'REFERENCIA' | 'HISTORICO';
    notes?: string;
  },
  changedBy: string = 'admin'
): Promise<ShippingZone> {
  const zones = readJsonFile<ShippingZone[]>(ZONES_FILE, []);
  const rates = readJsonFile<ShippingZoneRate[]>(RATES_FILE, []);
  const audits = readJsonFile<ShippingRateAuditRecord[]>(AUDIT_FILE, []);
  const communes = readJsonFile<ShippingZoneCommune[]>(COMMUNES_FILE, []);

  const zoneIdx = zones.findIndex(z => z.id === zoneId);
  if (zoneIdx === -1) {
    throw new Error(`Zona de despacho con ID ${zoneId} no encontrada.`);
  }

  const now = new Date().toISOString();
  const previousZone = { ...zones[zoneIdx] };
  const previousRate = rates.find(r => r.zone_id === zoneId && r.is_active) || null;

  // Actualizar atributos de la zona
  if (data.name !== undefined && data.name.trim() !== '') {
    zones[zoneIdx].name = data.name.trim();
  }
  if (data.description !== undefined) {
    zones[zoneIdx].description = data.description?.trim() || null;
  }
  if (data.status !== undefined) {
    zones[zoneIdx].status = data.status;
  }
  if (data.requires_quote !== undefined) {
    zones[zoneIdx].requires_quote = Boolean(data.requires_quote);
  }
  zones[zoneIdx].updated_at = now;

  // Actualizar o crear tarifa si hubo cambios financieros
  let currentActiveRate = previousRate;
  const isQuote = zones[zoneIdx].requires_quote;

  const priceChanged = data.customer_shipping_price !== undefined;
  const costChanged = data.estimated_dropi_cost !== undefined;
  const notesChanged = data.notes !== undefined;
  const quoteChanged = data.requires_quote !== undefined && data.requires_quote !== previousZone.requires_quote;

  if (priceChanged || costChanged || notesChanged || quoteChanged || !previousRate) {
    // Cerrar vigencia de la tarifa anterior
    if (previousRate) {
      previousRate.is_active = false;
      previousRate.valid_until = now;
      previousRate.updated_at = now;
    }

    const newRateId = `rate_${zoneId}_${Date.now().toString().slice(-4)}`;
    const newRate: ShippingZoneRate = {
      id: newRateId,
      zone_id: zoneId,
      customer_shipping_price: isQuote ? null : (data.customer_shipping_price ?? previousRate?.customer_shipping_price ?? 3990),
      estimated_dropi_cost: isQuote ? null : (data.estimated_dropi_cost ?? previousRate?.estimated_dropi_cost ?? 3990),
      customer_price_includes_vat: data.customer_price_includes_vat ?? previousRate?.customer_price_includes_vat ?? true,
      estimated_cost_includes_vat: data.estimated_cost_includes_vat ?? previousRate?.estimated_cost_includes_vat ?? true,
      valid_from: now,
      valid_until: null,
      is_active: true,
      origin: data.origin || previousRate?.origin || 'MANUAL',
      notes: data.notes?.trim() ?? previousRate?.notes ?? null,
      created_at: now,
      updated_at: now
    };

    rates.push(newRate);
    currentActiveRate = newRate;
  }

  const auditEntry: ShippingRateAuditRecord = {
    id: `audit_${Date.now()}`,
    rate_id: currentActiveRate?.id || null,
    zone_id: zoneId,
    action: 'UPDATE_ZONE_OR_RATE',
    previous_values: { zone: previousZone, rate: previousRate },
    new_values: { zone: zones[zoneIdx], rate: currentActiveRate },
    changed_by: changedBy,
    changed_at: now
  };
  audits.push(auditEntry);

  writeJsonFile(ZONES_FILE, zones);
  writeJsonFile(RATES_FILE, rates);
  writeJsonFile(AUDIT_FILE, audits);

  // PostgreSQL sync
  try {
    if (await isDatabaseAvailable()) {
      await query(
        `UPDATE shipping_zones SET name = $1, description = $2, status = $3, requires_quote = $4, updated_at = $5 WHERE id = $6`,
        [zones[zoneIdx].name, zones[zoneIdx].description, zones[zoneIdx].status, zones[zoneIdx].requires_quote, zones[zoneIdx].updated_at, zoneId]
      );

      if (previousRate && currentActiveRate && previousRate.id !== currentActiveRate.id) {
        await query(
          `UPDATE shipping_zone_rates SET is_active = false, valid_until = $1, updated_at = $1 WHERE id = $2`,
          [now, previousRate.id]
        );
        await query(
          `INSERT INTO shipping_zone_rates (id, zone_id, customer_shipping_price, estimated_dropi_cost, customer_price_includes_vat, estimated_cost_includes_vat, valid_from, valid_until, is_active, origin, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [currentActiveRate.id, currentActiveRate.zone_id, currentActiveRate.customer_shipping_price, currentActiveRate.estimated_dropi_cost, currentActiveRate.customer_price_includes_vat, currentActiveRate.estimated_cost_includes_vat, currentActiveRate.valid_from, currentActiveRate.valid_until, currentActiveRate.is_active, currentActiveRate.origin, currentActiveRate.notes, currentActiveRate.created_at, currentActiveRate.updated_at]
        );
      }

      await query(
        `INSERT INTO shipping_rate_audit (rate_id, zone_id, action, previous_values, new_values, changed_by, changed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [auditEntry.rate_id, auditEntry.zone_id, auditEntry.action, JSON.stringify(auditEntry.previous_values), JSON.stringify(auditEntry.new_values), auditEntry.changed_by, auditEntry.changed_at]
      );
    }
  } catch (err) {
    console.warn('[ShippingRatesService] Advertencia PostgreSQL al actualizar zona:', err);
  }

  const count = communes.filter(c => c.zone_id === zoneId).length;
  return {
    ...zones[zoneIdx],
    rate: currentActiveRate,
    communes_count: count
  };
}

/**
 * Eliminar una zona si no tiene comunas asignadas, o desactivarla conservando historial
 */
export async function deleteShippingZone(
  zoneId: string,
  changedBy: string = 'admin'
): Promise<{ success: boolean; action_taken: 'DELETED' | 'DEACTIVATED'; message: string }> {
  const zones = readJsonFile<ShippingZone[]>(ZONES_FILE, []);
  const communes = readJsonFile<ShippingZoneCommune[]>(COMMUNES_FILE, []);
  const rates = readJsonFile<ShippingZoneRate[]>(RATES_FILE, []);
  const audits = readJsonFile<ShippingRateAuditRecord[]>(AUDIT_FILE, []);

  const zone = zones.find(z => z.id === zoneId);
  if (!zone) {
    throw new Error(`Zona con ID ${zoneId} no encontrada.`);
  }

  const assignedCount = communes.filter(c => c.zone_id === zoneId).length;
  const now = new Date().toISOString();

  if (assignedCount > 0) {
    // Si tiene comunas asociadas, se desactiva para preservar la integridad referencial y el historial
    zone.status = 'INACTIVE';
    zone.updated_at = now;

    const auditEntry: ShippingRateAuditRecord = {
      id: `audit_${Date.now()}`,
      zone_id: zoneId,
      action: 'DEACTIVATE_ZONE_WITH_REFERENCES',
      previous_values: { status: 'ACTIVE', assigned_communes: assignedCount },
      new_values: { status: 'INACTIVE' },
      changed_by: changedBy,
      changed_at: now
    };
    audits.push(auditEntry);

    writeJsonFile(ZONES_FILE, zones);
    writeJsonFile(AUDIT_FILE, audits);

    try {
      if (await isDatabaseAvailable()) {
        await query(`UPDATE shipping_zones SET status = 'INACTIVE', updated_at = $1 WHERE id = $2`, [now, zoneId]);
        await query(
          `INSERT INTO shipping_rate_audit (zone_id, action, previous_values, new_values, changed_by, changed_at)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [zoneId, auditEntry.action, JSON.stringify(auditEntry.previous_values), JSON.stringify(auditEntry.new_values), auditEntry.changed_by, auditEntry.changed_at]
        );
      }
    } catch (err) {
      console.warn('[ShippingRatesService] Advertencia PostgreSQL al desactivar zona:', err);
    }

    return {
      success: true,
      action_taken: 'DEACTIVATED',
      message: `La zona "${zone.name}" posee ${assignedCount} comunas asociadas. Se desactivó para preservar el historial y la integridad de datos.`
    };
  }

  // Si no tiene referencias, se puede eliminar físicamente
  const updatedZones = zones.filter(z => z.id !== zoneId);
  const updatedRates = rates.filter(r => r.zone_id !== zoneId);

  const auditEntry: ShippingRateAuditRecord = {
    id: `audit_${Date.now()}`,
    zone_id: zoneId,
    action: 'DELETE_ZONE',
    previous_values: { zone },
    new_values: null,
    changed_by: changedBy,
    changed_at: now
  };
  audits.push(auditEntry);

  writeJsonFile(ZONES_FILE, updatedZones);
  writeJsonFile(RATES_FILE, updatedRates);
  writeJsonFile(AUDIT_FILE, audits);

  try {
    if (await isDatabaseAvailable()) {
      await query(`DELETE FROM shipping_zones WHERE id = $1`, [zoneId]);
      await query(
        `INSERT INTO shipping_rate_audit (zone_id, action, previous_values, new_values, changed_by, changed_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [zoneId, auditEntry.action, JSON.stringify(auditEntry.previous_values), JSON.stringify(auditEntry.new_values), auditEntry.changed_by, auditEntry.changed_at]
      );
    }
  } catch (err) {
    console.warn('[ShippingRatesService] Advertencia PostgreSQL al eliminar zona:', err);
  }

  return {
    success: true,
    action_taken: 'DELETED',
    message: `La zona "${zone.name}" fue eliminada exitosamente.`
  };
}

// -----------------------------------------------------------------------------
// Catálogo Geográfico y Asignación de Comunas (Sección 4 y 5.3)
// -----------------------------------------------------------------------------

export interface CommuneWithZoneStatus {
  commune_code: string;
  commune_name: string;
  province_name: string;
  region_code: string;
  region_name: string;
  region_roman: string;
  zone_id: string | null;
  zone_name: string | null;
  customer_shipping_price: number | null;
  estimated_dropi_cost: number | null;
  requires_quote: boolean;
  status: 'ASSIGNED' | 'NOT_CONFIGURED';
}

/**
 * Consulta comunas enriquecidas con su zona y tarifa asociada
 */
export async function getCommunesWithStatus(filters?: {
  region_code?: string;
  search?: string;
  status?: 'ALL' | 'ASSIGNED' | 'NOT_CONFIGURED';
}): Promise<{
  total: number;
  assigned: number;
  unassigned: number;
  communes: CommuneWithZoneStatus[];
}> {
  await initializeShippingRatesData();
  const catalog = getChileanGeographicCatalog();
  const zones = readJsonFile<ShippingZone[]>(ZONES_FILE, []);
  const rates = readJsonFile<ShippingZoneRate[]>(RATES_FILE, []);
  const communes = readJsonFile<ShippingZoneCommune[]>(COMMUNES_FILE, []);

  // Mapear comunas a zona
  const zoneByCode = new Map<string, string>();
  for (const c of communes) {
    zoneByCode.set(c.commune_code, c.zone_id);
  }

  const zoneMap = new Map<string, ShippingZone>();
  for (const z of zones) {
    zoneMap.set(z.id, z);
  }

  const rateMap = new Map<string, ShippingZoneRate>();
  for (const r of rates) {
    if (r.is_active) {
      rateMap.set(r.zone_id, r);
    }
  }

  let list: CommuneWithZoneStatus[] = catalog.communes.map(c => {
    const zoneId = zoneByCode.get(c.commune_code) || null;
    const zone = zoneId ? zoneMap.get(zoneId) : null;
    const rate = zoneId ? rateMap.get(zoneId) : null;

    const isAssigned = Boolean(zone && zone.status === 'ACTIVE');

    return {
      commune_code: c.commune_code,
      commune_name: c.commune_name,
      province_name: c.province_name,
      region_code: c.region_code,
      region_name: c.region_name,
      region_roman: c.region_roman,
      zone_id: zone ? zone.id : null,
      zone_name: zone ? zone.name : null,
      customer_shipping_price: zone?.requires_quote ? null : (rate?.customer_shipping_price ?? null),
      estimated_dropi_cost: zone?.requires_quote ? null : (rate?.estimated_dropi_cost ?? null),
      requires_quote: Boolean(zone?.requires_quote),
      status: isAssigned ? 'ASSIGNED' : 'NOT_CONFIGURED'
    };
  });

  const totalAssigned = list.filter(c => c.status === 'ASSIGNED').length;
  const totalUnassigned = list.length - totalAssigned;

  if (filters?.region_code && filters.region_code.trim() !== '') {
    list = list.filter(c => c.region_code === filters.region_code);
  }

  if (filters?.search && filters.search.trim() !== '') {
    const term = filters.search.toLowerCase().trim();
    list = list.filter(c =>
      c.commune_name.toLowerCase().includes(term) ||
      c.commune_code.includes(term) ||
      (c.zone_name && c.zone_name.toLowerCase().includes(term))
    );
  }

  if (filters?.status === 'ASSIGNED') {
    list = list.filter(c => c.status === 'ASSIGNED');
  } else if (filters?.status === 'NOT_CONFIGURED') {
    list = list.filter(c => c.status === 'NOT_CONFIGURED');
  }

  return {
    total: catalog.total_communes,
    assigned: totalAssigned,
    unassigned: totalUnassigned,
    communes: list
  };
}

/**
 * Asigna una o múltiples comunas a una zona de despacho.
 * Garantiza unicidad: impide asignaciones duplicadas reasignando limpiamente la comuna
 * y registrando la auditoría.
 */
export async function assignCommunesToZone(
  zoneId: string,
  communeCodes: string[],
  changedBy: string = 'admin'
): Promise<{ success: boolean; assigned_count: number; message: string }> {
  if (!communeCodes || communeCodes.length === 0) {
    throw new Error('Debes seleccionar al menos una comuna para asignar.');
  }

  const zones = readJsonFile<ShippingZone[]>(ZONES_FILE, []);
  const zone = zones.find(z => z.id === zoneId);
  if (!zone) {
    throw new Error(`Zona de despacho "${zoneId}" no existe.`);
  }

  const catalog = getChileanGeographicCatalog();
  const catalogMap = new Map<string, string>(); // code -> region_code
  for (const c of catalog.communes) {
    catalogMap.set(c.commune_code, c.region_code);
  }

  let communes = readJsonFile<ShippingZoneCommune[]>(COMMUNES_FILE, []);
  const audits = readJsonFile<ShippingRateAuditRecord[]>(AUDIT_FILE, []);
  const now = new Date().toISOString();

  const codesToAssign = new Set(communeCodes);
  let reassignedCount = 0;
  let newAssignedCount = 0;

  // Filtrar comunas para reemplazar asignaciones existentes (evitar duplicados)
  const remainingCommunes: ShippingZoneCommune[] = [];
  for (const item of communes) {
    if (codesToAssign.has(item.commune_code)) {
      if (item.zone_id !== zoneId) {
        reassignedCount++;
      }
    } else {
      remainingCommunes.push(item);
    }
  }

  for (const code of communeCodes) {
    const regionCode = catalogMap.get(code);
    if (!regionCode) {
      continue; // Ignorar código no válido
    }
    remainingCommunes.push({
      id: `szc_${code}`,
      zone_id: zoneId,
      region_code: regionCode,
      commune_code: code,
      created_at: now
    });
    newAssignedCount++;
  }

  const auditEntry: ShippingRateAuditRecord = {
    id: `audit_${Date.now()}`,
    zone_id: zoneId,
    action: 'ASSIGN_COMMUNES',
    previous_values: { previous_assignments: reassignedCount },
    new_values: { assigned_codes: communeCodes, target_zone: zone.name },
    changed_by: changedBy,
    changed_at: now
  };
  audits.push(auditEntry);

  writeJsonFile(COMMUNES_FILE, remainingCommunes);
  writeJsonFile(AUDIT_FILE, audits);

  // Sincronización en PostgreSQL
  try {
    if (await isDatabaseAvailable()) {
      for (const code of communeCodes) {
        const reg = catalogMap.get(code);
        if (reg) {
          await query(
            `INSERT INTO shipping_zone_communes (zone_id, region_code, commune_code, created_at)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (commune_code) DO UPDATE SET zone_id = EXCLUDED.zone_id, created_at = EXCLUDED.created_at`,
            [zoneId, reg, code, now]
          );
        }
      }
    }
  } catch (err) {
    console.warn('[ShippingRatesService] Advertencia PostgreSQL al asignar comunas:', err);
  }

  return {
    success: true,
    assigned_count: newAssignedCount,
    message: `Se asignaron ${newAssignedCount} comunas exitosamente a la zona "${zone.name}".`
  };
}

/**
 * Desasignar comunas (dejarlas en estado 'Sin configuración')
 */
export async function unassignCommunes(
  communeCodes: string[],
  changedBy: string = 'admin'
): Promise<{ success: boolean; unassigned_count: number; message: string }> {
  if (!communeCodes || communeCodes.length === 0) {
    throw new Error('Debes proporcionar comunas para desasignar.');
  }

  const codesToRemove = new Set(communeCodes);
  let communes = readJsonFile<ShippingZoneCommune[]>(COMMUNES_FILE, []);
  const audits = readJsonFile<ShippingRateAuditRecord[]>(AUDIT_FILE, []);
  const now = new Date().toISOString();

  const originalCount = communes.length;
  communes = communes.filter(c => !codesToRemove.has(c.commune_code));
  const removedCount = originalCount - communes.length;

  const auditEntry: ShippingRateAuditRecord = {
    id: `audit_${Date.now()}`,
    zone_id: 'GLOBAL',
    action: 'UNASSIGN_COMMUNES',
    previous_values: { unassigned_codes: communeCodes },
    new_values: null,
    changed_by: changedBy,
    changed_at: now
  };
  audits.push(auditEntry);

  writeJsonFile(COMMUNES_FILE, communes);
  writeJsonFile(AUDIT_FILE, audits);

  try {
    if (await isDatabaseAvailable()) {
      for (const code of communeCodes) {
        await query(`DELETE FROM shipping_zone_communes WHERE commune_code = $1`, [code]);
      }
    }
  } catch (err) {
    console.warn('[ShippingRatesService] Advertencia PostgreSQL al desasignar comunas:', err);
  }

  return {
    success: true,
    unassigned_count: removedCount,
    message: `Se desasignaron ${removedCount} comunas. Ahora quedan en estado "Sin configuración".`
  };
}

// -----------------------------------------------------------------------------
// Función Core de Estimación para la Etapa 2 (Requisito 10)
// -----------------------------------------------------------------------------

/**
 * Consulta la tarifa estándar y costo logístico de despacho para una comuna y región.
 * 
 * Reglas fundamentales de negocio:
 * - NO retorna cero como sustituto de un costo desconocido.
 * - Si no posee configuración: retorna status = 'NOT_CONFIGURED' y costos null.
 * - Si la zona requiere cotización: retorna status = 'REQUIRES_QUOTE' y costos null.
 * - Si la tarifa no está vigente a la fecha efectiva: retorna status = 'EXPIRED' y costos null.
 * - Si está configurada y vigente: retorna status = 'CONFIGURED' con ambos valores independientes
 *   (tarifa al cliente y costo Dropi estimado) y calcula la diferencia.
 */
export async function getShippingEstimate(
  regionCode: string,
  communeCode: string,
  effectiveDate: Date | string = new Date()
): Promise<ShippingEstimateResult> {
  await initializeShippingRatesData();
  const catalog = getChileanGeographicCatalog();

  // Validar existencia de la comuna en el catálogo
  const communeEntry = catalog.communes.find(c => c.commune_code === String(communeCode));
  const communeName = communeEntry ? communeEntry.commune_name : `Comuna ${communeCode}`;

  const defaultNotConfigured: ShippingEstimateResult = {
    zone_id: null,
    zone_name: null,
    region_code: String(regionCode),
    commune_code: String(communeCode),
    commune_name: communeName,
    customer_shipping_price: null,
    estimated_dropi_cost: null,
    margin_shipping: null,
    customer_price_includes_vat: true,
    estimated_cost_includes_vat: true,
    valid_from: null,
    valid_until: null,
    is_active: false,
    requires_quote: false,
    origin: null,
    status: 'NOT_CONFIGURED',
    diagnostic_message: `La comuna "${communeName}" no tiene una zona de despacho asignada en el sistema. Configura una zona o asígnala en el panel de administración.`
  };

  const communes = readJsonFile<ShippingZoneCommune[]>(COMMUNES_FILE, []);
  const assignment = communes.find(c => c.commune_code === String(communeCode));
  if (!assignment) {
    return defaultNotConfigured;
  }

  const zones = readJsonFile<ShippingZone[]>(ZONES_FILE, []);
  const zone = zones.find(z => z.id === assignment.zone_id);
  if (!zone || zone.status !== 'ACTIVE') {
    return {
      ...defaultNotConfigured,
      zone_id: zone?.id || null,
      zone_name: zone?.name || null,
      diagnostic_message: zone ? `La zona "${zone.name}" está inactiva.` : defaultNotConfigured.diagnostic_message
    };
  }

  // Si requiere cotización
  if (zone.requires_quote) {
    return {
      zone_id: zone.id,
      zone_name: zone.name,
      region_code: String(regionCode),
      commune_code: String(communeCode),
      commune_name: communeName,
      customer_shipping_price: null,
      estimated_dropi_cost: null,
      margin_shipping: null,
      customer_price_includes_vat: true,
      estimated_cost_includes_vat: true,
      valid_from: zone.created_at,
      valid_until: null,
      is_active: true,
      requires_quote: true,
      origin: 'REFERENCIA',
      status: 'REQUIRES_QUOTE',
      diagnostic_message: `La zona "${zone.name}" corresponde a zonas extremas o territorios especiales que requieren cotización directa según peso y transportadora.`
    };
  }

  // Obtener tarifa activa vigente
  const rates = readJsonFile<ShippingZoneRate[]>(RATES_FILE, []);
  const activeRate = rates.find(r => r.zone_id === zone.id && r.is_active);

  if (!activeRate) {
    return {
      ...defaultNotConfigured,
      zone_id: zone.id,
      zone_name: zone.name,
      status: 'NOT_CONFIGURED',
      diagnostic_message: `La zona "${zone.name}" no tiene ninguna tarifa financiera activa configurada.`
    };
  }

  // Comprobar vigencia
  const targetDate = new Date(effectiveDate).getTime();
  const validFrom = new Date(activeRate.valid_from).getTime();
  const validUntil = activeRate.valid_until ? new Date(activeRate.valid_until).getTime() : null;

  if (targetDate < validFrom || (validUntil && targetDate > validUntil)) {
    return {
      zone_id: zone.id,
      zone_name: zone.name,
      region_code: String(regionCode),
      commune_code: String(communeCode),
      commune_name: communeName,
      customer_shipping_price: null,
      estimated_dropi_cost: null,
      margin_shipping: null,
      customer_price_includes_vat: activeRate.customer_price_includes_vat,
      estimated_cost_includes_vat: activeRate.estimated_cost_includes_vat,
      valid_from: activeRate.valid_from,
      valid_until: activeRate.valid_until || null,
      is_active: false,
      requires_quote: false,
      origin: activeRate.origin,
      status: 'EXPIRED',
      diagnostic_message: `La tarifa de la zona "${zone.name}" no está vigente para la fecha consultada (${new Date(effectiveDate).toISOString().split('T')[0]}).`
    };
  }

  const customerPrice = activeRate.customer_shipping_price;
  const dropiCost = activeRate.estimated_dropi_cost;
  const margin = (customerPrice !== null && dropiCost !== null) ? (customerPrice - dropiCost) : null;

  return {
    zone_id: zone.id,
    zone_name: zone.name,
    region_code: String(regionCode),
    commune_code: String(communeCode),
    commune_name: communeName,
    customer_shipping_price: customerPrice,
    estimated_dropi_cost: dropiCost,
    margin_shipping: margin,
    customer_price_includes_vat: activeRate.customer_price_includes_vat,
    estimated_cost_includes_vat: activeRate.estimated_cost_includes_vat,
    valid_from: activeRate.valid_from,
    valid_until: activeRate.valid_until || null,
    is_active: true,
    requires_quote: false,
    origin: activeRate.origin,
    status: 'CONFIGURED',
    diagnostic_message: `Tarifa estándar configurada en zona "${zone.name}".`
  };
}
