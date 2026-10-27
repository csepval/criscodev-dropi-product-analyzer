// src/services/profitabilityService.ts
// Motor Financiero de Rentabilidad, Costos e IVA por Producto y Zona de Despacho (Etapa 2)
// CrisCodev Dropi Product Analyzer

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, isDatabaseAvailable } from '../lib/db';
import { getAllShippingZones, ShippingZone } from './shippingRatesService';
import { getProducts, DropiProductRecord } from './dropiDb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------------------------------------------------------------------
// Interfaces y Modelos de Datos Financieros
// -----------------------------------------------------------------------------

export type TaxTreatmentType =
  | 'TAX_CREDIT_APPLICABLE'  // Factura afecta con crédito fiscal aprovechable
  | 'NO_TAX_CREDIT'          // Compra sin crédito fiscal (boleta / exento / no aprovechable)
  | 'PRICE_NET_WITHOUT_VAT'  // Precio proveedor informado neto sin IVA
  | 'UNKNOWN_CONSERVATIVE';  // Tratamiento desconocido (asume sin crédito + advertencia)

export type ProfitabilityStatus =
  | 'ATTRACTIVE'   // >= 25%
  | 'MODERATE'     // 15% - 24.9%
  | 'LOW'          // 0% - 14.9%
  | 'LOSS'         // < 0%
  | 'INCOMPLETE';  // Requiere cotización o faltan datos esenciales

export interface FinancialProfile {
  id: string;
  name: string;
  description: string;
  vat_sales_rate: number;          // ej. 0.19 (19%)
  target_margin_pct: number;       // ej. 25.0 (25%)
  min_acceptable_margin_pct: number; // ej. 15.0 (15%)
  estimated_ad_cost_per_order: number; // CLP (ej. 3000)
  payment_fee_pct: number;         // ej. 0.03 (3%)
  payment_fee_fixed: number;       // CLP (ej. 0)
  return_reserve_pct: number;      // ej. 0.02 (2%)
  other_variable_costs: number;    // CLP (ej. 0)
  currency: string;               // 'CLP'
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface ZoneProfitabilityDetail {
  zone_id: string;
  zone_name: string;
  is_evaluable: boolean;
  requires_quote: boolean;
  // Precios brutos (con IVA)
  sale_price: number;
  shipping_charged: number | null;
  shipping_dropi_cost: number | null;
  total_customer_pays: number | null;
  // Desglose Neto e IVA
  net_product_revenue: number;
  net_shipping_revenue: number;
  net_revenue: number;
  vat_debit_product: number;
  vat_debit_shipping: number;
  total_vat_debit: number;
  potential_tax_credit: number;
  tax_difference: number; // IVA débito total - crédito fiscal
  // Costos Efectivos
  effective_provider_cost: number;
  effective_shipping_cost: number | null;
  payment_fee: number;
  ad_cost: number;
  return_reserve: number;
  other_variable_costs: number;
  total_effective_costs: number | null;
  // Resultado Final
  estimated_profit: number | null;
  contribution_margin_pct: number | null;
  logistics_margin: number | null; // shipping_charged - shipping_dropi_cost
  status: ProfitabilityStatus;
  status_label: string;
  min_profitable_price: number | null; // Precio para alcanzar margen mínimo (15%)
  recommended_price: number | null;    // Precio para alcanzar margen objetivo (25%)
  flags: string[];
}

export interface ProductVariantProfitability {
  variant_id: string;
  sku: string | null;
  name: string;
  supplier_price: number;
  suggested_price: number | null;
  stock: number;
  margin_pct: number | null;
  profit: number | null;
  status: ProfitabilityStatus;
  has_loss: boolean;
}

export interface ProductProfitabilityResult {
  product_id: string;
  dropi_id: number;
  product_name: string;
  supplier_name: string;
  category: string;
  supplier_price: number;
  suggested_price: number | null;
  sale_price_used: number;
  stock: number;
  has_variants: boolean;
  variants_count: number;
  variants_evaluations?: ProductVariantProfitability[];
  profile_used: FinancialProfile;
  tax_treatment_used: TaxTreatmentType;
  // Resumen por Zonas
  zones_evaluations: ZoneProfitabilityDetail[];
  best_margin_pct: number | null;
  worst_margin_pct: number | null;
  avg_margin_pct: number | null;
  best_zone_name: string | null;
  worst_zone_name: string | null;
  profitable_zones_count: number;
  insufficient_zones_count: number;
  loss_zones_count: number;
  unevaluable_zones_count: number;
  total_zones_count: number;
  evaluable_coverage_pct: number;
  // Consolidado
  overall_classification: ProfitabilityStatus;
  overall_status_label: string;
  overall_min_profitable_price: number | null;
  overall_recommended_price: number | null;
  flags: string[];
  calculated_at: string;
}

export interface ProfitabilityRunSummary {
  id: string;
  profile_id: string;
  profile_name: string;
  zone_id: string | null; // null = Todas las zonas
  total_evaluated: number;
  attractive_count: number;
  moderate_count: number;
  low_count: number;
  loss_count: number;
  incomplete_count: number;
  duration_ms: number;
  status: 'COMPLETED' | 'FAILED';
  started_at: string;
  finished_at: string;
  products_results?: ProductProfitabilityResult[];
}

// Rutas de almacenamiento local resiliente
const DATA_DIR = path.resolve(__dirname, '..', 'data');
const PROFILES_FILE = path.join(DATA_DIR, 'dropi_financial_profiles.json');
const RUNS_FILE = path.join(DATA_DIR, 'dropi_profitability_runs.json');
const SIMULATIONS_FILE = path.join(DATA_DIR, 'dropi_profitability_simulations.json');

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.warn(`[ProfitabilityService] Error leyendo archivo ${filePath}:`, err);
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
    console.error(`[ProfitabilityService] Error escribiendo archivo ${filePath}:`, err);
  }
}

// -----------------------------------------------------------------------------
// Perfiles Financieros Predefinidos (Sección 3)
// -----------------------------------------------------------------------------

export async function getFinancialProfiles(): Promise<FinancialProfile[]> {
  const profiles = readJsonFile<FinancialProfile[]>(PROFILES_FILE, []);
  if (profiles.length > 0) {
    return profiles;
  }

  const now = new Date().toISOString();
  const initialProfiles: FinancialProfile[] = [
    {
      id: 'profile_standard',
      name: 'Estándar',
      description: 'Escenario base de operaciones e-commerce en Dropi Chile (Valores de referencia)',
      vat_sales_rate: 0.19,
      target_margin_pct: 25.0,
      min_acceptable_margin_pct: 15.0,
      estimated_ad_cost_per_order: 3000,
      payment_fee_pct: 0.03,
      payment_fee_fixed: 0,
      return_reserve_pct: 0.02,
      other_variable_costs: 0,
      currency: 'CLP',
      is_active: true,
      is_default: true,
      created_at: now,
      updated_at: now
    },
    {
      id: 'profile_conservative',
      name: 'Conservador',
      description: 'Escenario de alta exigencia: mayor inversión publicitaria ($4.500) y 4% reserva para devoluciones',
      vat_sales_rate: 0.19,
      target_margin_pct: 30.0,
      min_acceptable_margin_pct: 18.0,
      estimated_ad_cost_per_order: 4500,
      payment_fee_pct: 0.035,
      payment_fee_fixed: 100,
      return_reserve_pct: 0.04,
      other_variable_costs: 500,
      currency: 'CLP',
      is_active: false,
      is_default: false,
      created_at: now,
      updated_at: now
    },
    {
      id: 'profile_optimistic',
      name: 'Optimista',
      description: 'Escenario de alta conversión publicitaria ($1.800) y baja tasa de devoluciones (1%)',
      vat_sales_rate: 0.19,
      target_margin_pct: 20.0,
      min_acceptable_margin_pct: 12.0,
      estimated_ad_cost_per_order: 1800,
      payment_fee_pct: 0.025,
      payment_fee_fixed: 0,
      return_reserve_pct: 0.01,
      other_variable_costs: 0,
      currency: 'CLP',
      is_active: false,
      is_default: false,
      created_at: now,
      updated_at: now
    },
    {
      id: 'profile_custom',
      name: 'Personalizado',
      description: 'Perfil editable por el analista para simulación de escenarios especiales',
      vat_sales_rate: 0.19,
      target_margin_pct: 25.0,
      min_acceptable_margin_pct: 15.0,
      estimated_ad_cost_per_order: 3000,
      payment_fee_pct: 0.03,
      payment_fee_fixed: 0,
      return_reserve_pct: 0.02,
      other_variable_costs: 0,
      currency: 'CLP',
      is_active: false,
      is_default: false,
      created_at: now,
      updated_at: now
    }
  ];

  writeJsonFile(PROFILES_FILE, initialProfiles);

  try {
    if (await isDatabaseAvailable()) {
      for (const p of initialProfiles) {
        await query(
          `INSERT INTO dropi_financial_profiles (id, name, description, is_active, is_default, vat_sales_rate, target_margin_pct, min_acceptable_margin_pct, estimated_ad_cost, payment_fee_pct, payment_fee_fixed, return_reserve_pct, other_variable_costs, currency, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, is_active = EXCLUDED.is_active`,
          [p.id, p.name, p.description, p.is_active, p.is_default, p.vat_sales_rate, p.target_margin_pct, p.min_acceptable_margin_pct, p.estimated_ad_cost_per_order, p.payment_fee_pct, p.payment_fee_fixed, p.return_reserve_pct, p.other_variable_costs, p.currency, p.created_at, p.updated_at]
        );
      }
    }
  } catch (e) {
    console.warn('[ProfitabilityService] Advertencia sembrando perfiles en PostgreSQL:', e);
  }

  return initialProfiles;
}

export async function getActiveFinancialProfile(): Promise<FinancialProfile> {
  const profiles = await getFinancialProfiles();
  const active = profiles.find(p => p.is_active);
  if (active) return active;
  return profiles.find(p => p.is_default) || profiles[0];
}

export async function saveFinancialProfile(profile: Partial<FinancialProfile> & { id?: string; name: string }): Promise<FinancialProfile> {
  const profiles = await getFinancialProfiles();
  const now = new Date().toISOString();

  let targetId = profile.id;
  if (!targetId) {
    const slug = profile.name.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '_');
    targetId = `profile_${slug}_${Date.now().toString().slice(-4)}`;
  }

  const existingIdx = profiles.findIndex(p => p.id === targetId);
  const updatedProfile: FinancialProfile = {
    id: targetId,
    name: profile.name.trim(),
    description: profile.description?.trim() || 'Perfil de rentabilidad configurado',
    vat_sales_rate: profile.vat_sales_rate ?? 0.19,
    target_margin_pct: profile.target_margin_pct ?? 25.0,
    min_acceptable_margin_pct: profile.min_acceptable_margin_pct ?? 15.0,
    estimated_ad_cost_per_order: profile.estimated_ad_cost_per_order ?? 3000,
    payment_fee_pct: profile.payment_fee_pct ?? 0.03,
    payment_fee_fixed: profile.payment_fee_fixed ?? 0,
    return_reserve_pct: profile.return_reserve_pct ?? 0.02,
    other_variable_costs: profile.other_variable_costs ?? 0,
    currency: profile.currency || 'CLP',
    is_active: profile.is_active ?? false,
    is_default: profile.is_default ?? false,
    created_at: existingIdx >= 0 ? profiles[existingIdx].created_at : now,
    updated_at: now
  };

  if (existingIdx >= 0) {
    profiles[existingIdx] = updatedProfile;
  } else {
    profiles.push(updatedProfile);
  }

  // Si se marcó como activo, desactivar los demás
  if (updatedProfile.is_active) {
    profiles.forEach(p => {
      if (p.id !== updatedProfile.id) p.is_active = false;
    });
  }

  writeJsonFile(PROFILES_FILE, profiles);

  try {
    if (await isDatabaseAvailable()) {
      await query(
        `INSERT INTO dropi_financial_profiles (id, name, description, is_active, is_default, vat_sales_rate, target_margin_pct, min_acceptable_margin_pct, estimated_ad_cost, payment_fee_pct, payment_fee_fixed, return_reserve_pct, other_variable_costs, currency, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         ON CONFLICT (id) DO UPDATE SET 
            name = EXCLUDED.name, description = EXCLUDED.description, is_active = EXCLUDED.is_active,
            vat_sales_rate = EXCLUDED.vat_sales_rate, target_margin_pct = EXCLUDED.target_margin_pct,
            min_acceptable_margin_pct = EXCLUDED.min_acceptable_margin_pct, estimated_ad_cost = EXCLUDED.estimated_ad_cost,
            payment_fee_pct = EXCLUDED.payment_fee_pct, payment_fee_fixed = EXCLUDED.payment_fee_fixed,
            return_reserve_pct = EXCLUDED.return_reserve_pct, other_variable_costs = EXCLUDED.other_variable_costs,
            updated_at = EXCLUDED.updated_at`,
        [updatedProfile.id, updatedProfile.name, updatedProfile.description, updatedProfile.is_active, updatedProfile.is_default, updatedProfile.vat_sales_rate, updatedProfile.target_margin_pct, updatedProfile.min_acceptable_margin_pct, updatedProfile.estimated_ad_cost_per_order, updatedProfile.payment_fee_pct, updatedProfile.payment_fee_fixed, updatedProfile.return_reserve_pct, updatedProfile.other_variable_costs, updatedProfile.currency, updatedProfile.created_at, updatedProfile.updated_at]
      );
    }
  } catch (e) {
    console.warn('[ProfitabilityService] Advertencia guardando perfil en PostgreSQL:', e);
  }

  return updatedProfile;
}

export async function setActiveFinancialProfile(profileId: string): Promise<FinancialProfile> {
  const profiles = await getFinancialProfiles();
  const target = profiles.find(p => p.id === profileId);
  if (!target) {
    throw new Error(`Perfil financiero "${profileId}" no encontrado.`);
  }

  profiles.forEach(p => {
    p.is_active = (p.id === profileId);
    p.updated_at = new Date().toISOString();
  });

  writeJsonFile(PROFILES_FILE, profiles);

  try {
    if (await isDatabaseAvailable()) {
      await query(`UPDATE dropi_financial_profiles SET is_active = false`);
      await query(`UPDATE dropi_financial_profiles SET is_active = true WHERE id = $1`, [profileId]);
    }
  } catch (e) {
    console.warn('[ProfitabilityService] Advertencia activando perfil en PostgreSQL:', e);
  }

  return target;
}

// -----------------------------------------------------------------------------
// Fórmulas Matemáticas de Rentabilidad y Precio Mínimo Rentable (Sección 7)
// -----------------------------------------------------------------------------

/**
 * Resuelve algebraicamente el precio bruto final de venta P (IVA incluido)
 * necesario para alcanzar exactamente un margen objetivo M (en fracción, ej. 0.25).
 * 
 * Ecuación de equilibrio:
 * IngresoNeto * (1 - M) = TotalCostosEfectivos
 * 
 * Donde:
 * IngresoNeto = (P + S_cust) / (1 + vat_sales)
 * Costos = ProvCost + ShipCost + Ads + Other + fee_fixed + (P + S_cust)*fee_pct + P*return_reserve_pct
 * 
 * P * [ (1 - M)/(1 + vat_sales) - fee_pct - return_reserve_pct ] =
 *      ProvCost + ShipCost + Ads + Other + fee_fixed + S_cust * [ fee_pct - (1 - M)/(1 + vat_sales) ]
 */
export function calculateTargetSellingPrice(params: {
  targetMarginFraction: number; // ej. 0.25 para 25%
  vatSalesRate: number;         // ej. 0.19
  effectiveProviderCost: number;// CLP
  effectiveShippingCost: number;// CLP
  customerShippingPrice: number;// CLP
  adCost: number;               // CLP
  paymentFeePct: number;        // ej. 0.03
  paymentFeeFixed: number;      // CLP
  returnReservePct: number;     // ej. 0.02
  otherVariableCosts: number;   // CLP
}): { price: number | null; isFeasible: boolean; reason?: string } {
  const {
    targetMarginFraction: M,
    vatSalesRate: V_rate,
    effectiveProviderCost: C_prov,
    effectiveShippingCost: C_ship,
    customerShippingPrice: S_cust,
    adCost: Ads,
    paymentFeePct: F_pct,
    paymentFeeFixed: F_fixed,
    returnReservePct: R_pct,
    otherVariableCosts: Other
  } = params;

  const V = 1 + V_rate; // 1.19
  const netFactor = (1 - M) / V;
  const denominator = netFactor - (F_pct + R_pct);

  // Si el denominador es <= 0, los impuestos, comisiones y reservas consumen más de lo permitido
  // por el margen objetivo, haciéndolo matemáticamente inviable para cualquier precio.
  if (denominator <= 0.0001) {
    return {
      price: null,
      isFeasible: false,
      reason: `El margen objetivo (${(M * 100).toFixed(1)}%) es matemáticamente inviable dados el IVA (${(V_rate * 100).toFixed(0)}%), comisiones (${(F_pct * 100).toFixed(1)}%) y reserva de devoluciones (${(R_pct * 100).toFixed(1)}%).`
    };
  }

  const fixedCosts = C_prov + C_ship + Ads + Other + F_fixed;
  const shippingAdjustment = S_cust * (F_pct - netFactor);
  const numerator = fixedCosts + shippingAdjustment;

  const rawPrice = numerator / denominator;
  const roundedPrice = Math.max(Math.ceil(rawPrice), Math.ceil(C_prov));

  return {
    price: roundedPrice,
    isFeasible: true
  };
}

// -----------------------------------------------------------------------------
// Motor Centralizado de Evaluación por Producto y Zonas (Sección 7 y 8)
// -----------------------------------------------------------------------------

export function evaluateZoneProfitability(params: {
  zone: ShippingZone;
  productPriceGross: number; // CLP (IVA incluido)
  supplierPrice: number;     // CLP
  taxTreatment: TaxTreatmentType;
  profile: FinancialProfile;
  customShippingCharged?: number;
  customDropiShippingCost?: number;
}): ZoneProfitabilityDetail {
  const { zone, productPriceGross, supplierPrice, taxTreatment, profile } = params;
  const flags: string[] = [];

  const isQuote = Boolean(zone.requires_quote);
  const rate = zone.rate;

  const shippingCharged = params.customShippingCharged !== undefined
    ? params.customShippingCharged
    : (rate?.customer_shipping_price ?? null);

  const shippingDropiCost = params.customDropiShippingCost !== undefined
    ? params.customDropiShippingCost
    : (rate?.estimated_dropi_cost ?? null);

  // Comprobar si la zona es evaluable financieramente
  const isEvaluable = !isQuote && shippingCharged !== null && shippingDropiCost !== null && zone.status === 'ACTIVE';

  if (isQuote) {
    flags.push('ZONA_REQUIERE_COTIZACION');
  }
  if (!isEvaluable && !isQuote) {
    flags.push('COSTO_LOGISTICO_NO_DISPONIBLE');
  }

  // 1. Tratamiento Tributario de la Compra (Sección 4)
  const vatRate = profile.vat_sales_rate; // 0.19
  let effectiveProviderCost = supplierPrice;
  let potentialTaxCredit = 0;

  switch (taxTreatment) {
    case 'TAX_CREDIT_APPLICABLE': {
      // Precio proveedor incluye IVA y tenemos factura con derecho a crédito
      effectiveProviderCost = Math.round(supplierPrice / (1 + vatRate));
      potentialTaxCredit = supplierPrice - effectiveProviderCost;
      break;
    }
    case 'NO_TAX_CREDIT': {
      // Sin derecho a crédito fiscal: el costo efectivo es el monto total pagado
      effectiveProviderCost = supplierPrice;
      potentialTaxCredit = 0;
      break;
    }
    case 'PRICE_NET_WITHOUT_VAT': {
      // Precio informado neto: sumamos IVA de compra
      const grossPurchase = Math.round(supplierPrice * (1 + vatRate));
      potentialTaxCredit = grossPurchase - supplierPrice;
      effectiveProviderCost = supplierPrice;
      break;
    }
    case 'UNKNOWN_CONSERVATIVE':
    default: {
      // Escenario conservador sin crédito
      effectiveProviderCost = supplierPrice;
      potentialTaxCredit = 0;
      flags.push('TRATAMIENTO_TRIBUTARIO_DESCONOCIDO');
      break;
    }
  }

  // 2. Ingresos e IVA de la Venta (Sección 5)
  const netProductRevenue = Math.round(productPriceGross / (1 + vatRate));
  const vatDebitProduct = productPriceGross - netProductRevenue;

  let netShippingRevenue = 0;
  let vatDebitShipping = 0;

  if (shippingCharged !== null) {
    // El despacho cobrado al cliente incluye IVA
    netShippingRevenue = Math.round(shippingCharged / (1 + vatRate));
    vatDebitShipping = shippingCharged - netShippingRevenue;
  }

  const netRevenue = netProductRevenue + netShippingRevenue;
  const totalVatDebit = vatDebitProduct + vatDebitShipping;
  const taxDifference = totalVatDebit - potentialTaxCredit;

  // 3. Costos Logísticos Efectivos (Sección 6)
  let effectiveShippingCost: number | null = null;
  if (shippingDropiCost !== null) {
    // El costo pagado a Dropi: si la empresa recupera IVA de factura de logística
    // calculamos el costo neto, de lo contrario valor bruto
    if (taxTreatment === 'TAX_CREDIT_APPLICABLE') {
      effectiveShippingCost = Math.round(shippingDropiCost / (1 + vatRate));
      potentialTaxCredit += (shippingDropiCost - effectiveShippingCost);
    } else {
      effectiveShippingCost = shippingDropiCost;
    }
  }

  // 4. Comisiones, Publicidad y Reservas (Sección 7)
  const totalCustomerPays = shippingCharged !== null ? (productPriceGross + shippingCharged) : null;
  const paymentBaseAmount = totalCustomerPays ?? productPriceGross;
  const paymentFee = Math.round((paymentBaseAmount * profile.payment_fee_pct) + profile.payment_fee_fixed);
  const adCost = profile.estimated_ad_cost_per_order;
  const returnReserve = Math.round(productPriceGross * profile.return_reserve_pct);
  const otherCosts = profile.other_variable_costs;

  // 5. Utilidad y Margen
  let totalEffectiveCosts: number | null = null;
  let estimatedProfit: number | null = null;
  let contributionMarginPct: number | null = null;
  let logisticsMargin: number | null = null;

  if (isEvaluable && effectiveShippingCost !== null && shippingCharged !== null) {
    totalEffectiveCosts = effectiveProviderCost + effectiveShippingCost + paymentFee + adCost + returnReserve + otherCosts;
    estimatedProfit = netRevenue - totalEffectiveCosts;
    contributionMarginPct = netRevenue > 0 ? Number(((estimatedProfit / netRevenue) * 100).toFixed(2)) : 0;
    logisticsMargin = shippingCharged - shippingDropiCost!;
  }

  // 6. Semáforo de Rentabilidad (Sección 9)
  let status: ProfitabilityStatus = 'INCOMPLETE';
  let statusLabel = 'Evaluación incompleta';

  if (isEvaluable && contributionMarginPct !== null) {
    if (contributionMarginPct >= profile.target_margin_pct) {
      status = 'ATTRACTIVE';
      statusLabel = 'Rentabilidad atractiva';
    } else if (contributionMarginPct >= profile.min_acceptable_margin_pct) {
      status = 'MODERATE';
      statusLabel = 'Rentabilidad moderada';
    } else if (contributionMarginPct >= 0) {
      status = 'LOW';
      statusLabel = 'Rentabilidad baja';
      flags.push('MARGEN_INSUFICIENTE');
    } else {
      status = 'LOSS';
      statusLabel = 'Pérdida estimada';
      flags.push('MARGEN_NEGATIVO_EN_ZONA');
    }
  } else {
    status = 'INCOMPLETE';
    statusLabel = isQuote ? 'Requiere cotización directa' : 'Evaluación incompleta';
  }

  // Alerta si la publicidad consume más del 50% del margen bruto de producto
  const grossProductSpread = netProductRevenue - effectiveProviderCost;
  if (grossProductSpread > 0 && adCost > (grossProductSpread * 0.5)) {
    flags.push('PUBLICIDAD_CONSUME_MARGEN');
  }

  // 7. Cálculo del Precio Mínimo Rentable y Recomendado (Sección 7.5)
  let minProfitablePrice: number | null = null;
  let recommendedPrice: number | null = null;

  if (isEvaluable && effectiveShippingCost !== null && shippingCharged !== null) {
    const minCalc = calculateTargetSellingPrice({
      targetMarginFraction: profile.min_acceptable_margin_pct / 100,
      vatSalesRate: vatRate,
      effectiveProviderCost,
      effectiveShippingCost,
      customerShippingPrice: shippingCharged,
      adCost,
      paymentFeePct: profile.payment_fee_pct,
      paymentFeeFixed: profile.payment_fee_fixed,
      returnReservePct: profile.return_reserve_pct,
      otherVariableCosts: otherCosts
    });
    minProfitablePrice = minCalc.isFeasible ? minCalc.price : null;

    const recCalc = calculateTargetSellingPrice({
      targetMarginFraction: profile.target_margin_pct / 100,
      vatSalesRate: vatRate,
      effectiveProviderCost,
      effectiveShippingCost,
      customerShippingPrice: shippingCharged,
      adCost,
      paymentFeePct: profile.payment_fee_pct,
      paymentFeeFixed: profile.payment_fee_fixed,
      returnReservePct: profile.return_reserve_pct,
      otherVariableCosts: otherCosts
    });
    recommendedPrice = recCalc.isFeasible ? recCalc.price : null;

    if (minProfitablePrice !== null && productPriceGross < minProfitablePrice) {
      flags.push('PRECIO_INFERIOR_AL_MINIMO_RENTABLE');
    }
  }

  return {
    zone_id: zone.id,
    zone_name: zone.name,
    is_evaluable: isEvaluable,
    requires_quote: isQuote,
    sale_price: productPriceGross,
    shipping_charged: shippingCharged,
    shipping_dropi_cost: shippingDropiCost,
    total_customer_pays: totalCustomerPays,
    net_product_revenue: netProductRevenue,
    net_shipping_revenue: netShippingRevenue,
    net_revenue: netRevenue,
    vat_debit_product: vatDebitProduct,
    vat_debit_shipping: vatDebitShipping,
    total_vat_debit: totalVatDebit,
    potential_tax_credit: potentialTaxCredit,
    tax_difference: taxDifference,
    effective_provider_cost: effectiveProviderCost,
    effective_shipping_cost: effectiveShippingCost,
    payment_fee: paymentFee,
    ad_cost: adCost,
    return_reserve: returnReserve,
    other_variable_costs: otherCosts,
    total_effective_costs: totalEffectiveCosts,
    estimated_profit: estimatedProfit,
    contribution_margin_pct: contributionMarginPct,
    logistics_margin: logisticsMargin,
    status,
    status_label: statusLabel,
    min_profitable_price: minProfitablePrice,
    recommended_price: recommendedPrice,
    flags
  };
}

/**
 * Calcula la rentabilidad integral de un producto evaluando todas las zonas de despacho
 */
export async function calculateProductProfitability(params: {
  product: DropiProductRecord;
  profile?: FinancialProfile;
  taxTreatment?: TaxTreatmentType;
  customSalePrice?: number;
  customAdCost?: number;
}): Promise<ProductProfitabilityResult> {
  const { product } = params;
  const profile = params.profile || (await getActiveFinancialProfile());
  const taxTreatment: TaxTreatmentType = params.taxTreatment || 'TAX_CREDIT_APPLICABLE';

  // Copia de perfil con sobreescritura de publicidad si se indicó
  const activeProfile: FinancialProfile = {
    ...profile,
    estimated_ad_cost_per_order: params.customAdCost ?? profile.estimated_ad_cost_per_order
  };

  const zones = await getAllShippingZones();
  const globalFlags = new Set<string>();

  // Determinación del precio de venta a utilizar (Sección 7.1)
  const supplierPrice = product.supplier_price_min || product.supplier_price_max || 0;
  let salePrice = params.customSalePrice;

  if (salePrice === undefined || salePrice <= 0) {
    if (product.suggested_price && product.suggested_price > supplierPrice) {
      salePrice = product.suggested_price;
    } else {
      // Si el precio sugerido es inválido o menor al costo, usamos precio preliminar razonable
      salePrice = Math.round(supplierPrice * 1.8);
      globalFlags.add('PRECIO_SUGERIDO_ANOMALO');
    }
  }

  if (supplierPrice <= 0) {
    globalFlags.add('PRECIO_PROVEEDOR_INVALIDO');
  }

  // Evaluación zona por zona
  const zonesEvaluations: ZoneProfitabilityDetail[] = zones.map(zone => {
    return evaluateZoneProfitability({
      zone,
      productPriceGross: salePrice!,
      supplierPrice,
      taxTreatment,
      profile: activeProfile
    });
  });

  // Métricas Consolidadas (Sección 8.1)
  const evaluableZones = zonesEvaluations.filter(z => z.is_evaluable && z.contribution_margin_pct !== null);
  const totalZones = zones.length;
  const evaluableCount = evaluableZones.length;
  const coveragePct = totalZones > 0 ? Number(((evaluableCount / totalZones) * 100).toFixed(1)) : 0;

  let bestMargin: number | null = null;
  let worstMargin: number | null = null;
  let avgMargin: number | null = null;
  let bestZoneName: string | null = null;
  let worstZoneName: string | null = null;

  let profitableCount = 0;
  let insufficientCount = 0;
  let lossCount = 0;
  const unevaluableCount = zonesEvaluations.filter(z => !z.is_evaluable).length;

  if (evaluableCount > 0) {
    const sorted = [...evaluableZones].sort((a, b) => b.contribution_margin_pct! - a.contribution_margin_pct!);
    bestMargin = sorted[0].contribution_margin_pct;
    bestZoneName = sorted[0].zone_name;

    worstMargin = sorted[sorted.length - 1].contribution_margin_pct;
    worstZoneName = sorted[sorted.length - 1].zone_name;

    const sumMargins = evaluableZones.reduce((acc, z) => acc + z.contribution_margin_pct!, 0);
    avgMargin = Number((sumMargins / evaluableCount).toFixed(2));

    profitableCount = evaluableZones.filter(z => z.status === 'ATTRACTIVE' || z.status === 'MODERATE').length;
    insufficientCount = evaluableZones.filter(z => z.status === 'LOW').length;
    lossCount = evaluableZones.filter(z => z.status === 'LOSS').length;

    if (lossCount > 0) {
      globalFlags.add('MARGEN_NEGATIVO_EN_ALGUNA_ZONA');
    }
  }

  // Clasificación Global del Producto (Semáforo de Sección 9)
  let overallClassification: ProfitabilityStatus = 'INCOMPLETE';
  let overallLabel = 'Evaluación incompleta';

  if (evaluableCount === 0 || coveragePct < 40) {
    overallClassification = 'INCOMPLETE';
    overallLabel = 'Sin datos suficientes de despacho';
    globalFlags.add('COBERTURA_INSUFICIENTE');
  } else if (avgMargin !== null) {
    if (avgMargin >= activeProfile.target_margin_pct && lossCount === 0) {
      overallClassification = 'ATTRACTIVE';
      overallLabel = 'Rentabilidad atractiva';
    } else if (avgMargin >= activeProfile.min_acceptable_margin_pct && lossCount === 0) {
      overallClassification = 'MODERATE';
      overallLabel = 'Rentabilidad moderada';
    } else if (avgMargin >= 0) {
      overallClassification = 'LOW';
      overallLabel = 'Rentabilidad baja';
    } else {
      overallClassification = 'LOSS';
      overallLabel = 'Pérdida estimada';
    }
  }

  // Precios recomendados consolidados (peor caso evaluable para garantizar viabilidad)
  let overallMinPrice: number | null = null;
  let overallRecPrice: number | null = null;

  if (evaluableCount > 0) {
    const minPrices = evaluableZones.map(z => z.min_profitable_price).filter((p): p is number => p !== null);
    const recPrices = evaluableZones.map(z => z.recommended_price).filter((p): p is number => p !== null);
    if (minPrices.length > 0) overallMinPrice = Math.max(...minPrices);
    if (recPrices.length > 0) overallRecPrice = Math.max(...recPrices);
  }

  // Evaluación de Variantes (Sección 13)
  let variantsEvaluations: ProductVariantProfitability[] | undefined = undefined;
  if (product.has_variants && Array.isArray(product.variants) && product.variants.length > 0) {
    const santiagoZone = zones.find(z => z.id === 'zone_santiago_urbano') || zones[0];
    variantsEvaluations = product.variants.map(v => {
      const vSupplierPrice = v.supplier_price || supplierPrice;
      const vSuggestedPrice = v.suggested_price || Math.round(vSupplierPrice * 1.8);
      const evalDetail = evaluateZoneProfitability({
        zone: santiagoZone,
        productPriceGross: vSuggestedPrice,
        supplierPrice: vSupplierPrice,
        taxTreatment,
        profile: activeProfile
      });

      const isLoss = evalDetail.status === 'LOSS';
      if (isLoss) {
        globalFlags.add('VARIANTE_CON_MARGEN_NEGATIVO');
      }

      return {
        variant_id: String(v.id || v.dropi_variant_id),
        sku: v.sku || null,
        name: v.variation_name || (v as any).name || 'Variante',
        supplier_price: vSupplierPrice,
        suggested_price: vSuggestedPrice,
        stock: v.stock || 0,
        margin_pct: evalDetail.contribution_margin_pct,
        profit: evalDetail.estimated_profit,
        status: evalDetail.status,
        has_loss: isLoss
      };
    });
  }

  return {
    product_id: product.id,
    dropi_id: product.dropi_id,
    product_name: product.name,
    supplier_name: product.supplier_name,
    category: product.category,
    supplier_price: supplierPrice,
    suggested_price: product.suggested_price ?? null,
    sale_price_used: salePrice!,
    stock: product.stock,
    has_variants: Boolean(product.has_variants),
    variants_count: product.variants?.length || 0,
    variants_evaluations: variantsEvaluations,
    profile_used: activeProfile,
    tax_treatment_used: taxTreatment,
    zones_evaluations: zonesEvaluations,
    best_margin_pct: bestMargin,
    worst_margin_pct: worstMargin,
    avg_margin_pct: avgMargin,
    best_zone_name: bestZoneName,
    worst_zone_name: worstZoneName,
    profitable_zones_count: profitableCount,
    insufficient_zones_count: insufficientCount,
    loss_zones_count: lossCount,
    unevaluable_zones_count: unevaluableCount,
    total_zones_count: totalZones,
    evaluable_coverage_pct: coveragePct,
    overall_classification: overallClassification,
    overall_status_label: overallLabel,
    overall_min_profitable_price: overallMinPrice,
    overall_recommended_price: overallRecPrice,
    flags: Array.from(globalFlags),
    calculated_at: new Date().toISOString()
  };
}

// -----------------------------------------------------------------------------
// Análisis Masivo y Ejecuciones (Sección 11 y 12)
// -----------------------------------------------------------------------------

export async function runBulkProfitabilityAnalysis(filters?: {
  profileId?: string;
  zoneId?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  onlyInStock?: boolean;
  taxTreatment?: TaxTreatmentType;
}): Promise<ProfitabilityRunSummary> {
  const startTime = Date.now();
  const runId = `run_${Date.now()}`;

  const profiles = await getFinancialProfiles();
  const activeProfile = filters?.profileId
    ? (profiles.find(p => p.id === filters.profileId) || profiles[0])
    : (profiles.find(p => p.is_active) || profiles[0]);

  // Consultar catálogo local o PostgreSQL
  const dbResult = await getProducts({
    category: filters?.category,
    min_price: filters?.minPrice,
    max_price: filters?.maxPrice,
    limit: 1000
  });

  let productList = dbResult.products;
  if (filters?.onlyInStock) {
    productList = productList.filter(p => p.stock > 0);
  }

  let attractive = 0;
  let moderate = 0;
  let low = 0;
  let loss = 0;
  let incomplete = 0;

  const results: ProductProfitabilityResult[] = [];

  for (const product of productList) {
    const evaluated = await calculateProductProfitability({
      product,
      profile: activeProfile,
      taxTreatment: filters?.taxTreatment || 'TAX_CREDIT_APPLICABLE'
    });

    switch (evaluated.overall_classification) {
      case 'ATTRACTIVE': attractive++; break;
      case 'MODERATE': moderate++; break;
      case 'LOW': low++; break;
      case 'LOSS': loss++; break;
      case 'INCOMPLETE': default: incomplete++; break;
    }

    results.push(evaluated);
  }

  const durationMs = Date.now() - startTime;
  const finishedAt = new Date().toISOString();

  const summary: ProfitabilityRunSummary = {
    id: runId,
    profile_id: activeProfile.id,
    profile_name: activeProfile.name,
    zone_id: filters?.zoneId || null,
    total_evaluated: results.length,
    attractive_count: attractive,
    moderate_count: moderate,
    low_count: low,
    loss_count: loss,
    incomplete_count: incomplete,
    duration_ms: durationMs,
    status: 'COMPLETED',
    started_at: new Date(startTime).toISOString(),
    finished_at: finishedAt,
    products_results: results
  };

  // Guardar en bitácora local resiliente
  const runs = readJsonFile<ProfitabilityRunSummary[]>(RUNS_FILE, []);
  runs.unshift({ ...summary, products_results: undefined }); // Sin resultados pesados en el historial de runs
  if (runs.length > 30) runs.pop();
  writeJsonFile(RUNS_FILE, runs);

  // Guardar snapshot de resultados en dropi_profitability.json
  writeJsonFile(path.join(DATA_DIR, 'dropi_profitability_latest.json'), results);

  // PostgreSQL sync
  try {
    if (await isDatabaseAvailable()) {
      await query(
        `INSERT INTO dropi_profitability_runs (id, profile_id, zone_id, total_evaluated, attractive_count, moderate_count, low_count, loss_count, incomplete_count, duration_ms, status, started_at, finished_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [summary.id, summary.profile_id, summary.zone_id, summary.total_evaluated, summary.attractive_count, summary.moderate_count, summary.low_count, summary.loss_count, summary.incomplete_count, summary.duration_ms, summary.status, summary.started_at, summary.finished_at]
      );
    }
  } catch (e) {
    console.warn('[ProfitabilityService] Advertencia guardando run en PostgreSQL:', e);
  }

  return summary;
}

export function getLatestProfitabilityResults(): ProductProfitabilityResult[] {
  return readJsonFile<ProductProfitabilityResult[]>(path.join(DATA_DIR, 'dropi_profitability_latest.json'), []);
}

export function getProfitabilityRunsHistory(): ProfitabilityRunSummary[] {
  return readJsonFile<ProfitabilityRunSummary[]>(RUNS_FILE, []);
}

// -----------------------------------------------------------------------------
// Simulaciones Interactivas Guardadas (Sección 10 y 12)
// -----------------------------------------------------------------------------

export interface SavedSimulation {
  id: string;
  product_id: string;
  product_name: string;
  simulation_name: string;
  input_params: {
    sale_price: number;
    zone_id: string;
    profile_id: string;
    tax_treatment: TaxTreatmentType;
    ad_cost: number;
  };
  results: {
    profit: number;
    margin_pct: number;
    status: ProfitabilityStatus;
    min_price: number | null;
    rec_price: number | null;
  };
  created_by: string;
  created_at: string;
}

export function getSavedSimulations(): SavedSimulation[] {
  return readJsonFile<SavedSimulation[]>(SIMULATIONS_FILE, []);
}

export function saveSimulation(simulation: {
  product_id: string;
  product_name: string;
  simulation_name: string;
  input_params: SavedSimulation['input_params'];
  results: SavedSimulation['results'];
  created_by?: string;
}): SavedSimulation {
  const sims = getSavedSimulations();
  const newSim: SavedSimulation = {
    id: `sim_${Date.now()}`,
    product_id: simulation.product_id,
    product_name: simulation.product_name,
    simulation_name: simulation.simulation_name || `Simulación ${new Date().toLocaleDateString('es-CL')}`,
    input_params: simulation.input_params,
    results: simulation.results,
    created_by: simulation.created_by || 'admin',
    created_at: new Date().toISOString()
  };

  sims.unshift(newSim);
  if (sims.length > 50) sims.pop();
  writeJsonFile(SIMULATIONS_FILE, sims);

  return newSim;
}
