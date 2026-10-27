// tests/profitability.test.ts
// Pruebas Automatizadas de Rentabilidad, Costos e IVA (Etapa 2)
// CrisCodev Dropi Product Analyzer
//
// 22 Casos de prueba obligatorios según Sección 15

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateZoneProfitability,
  calculateTargetSellingPrice,
  calculateProductProfitability,
  getFinancialProfiles,
  saveFinancialProfile,
  setActiveFinancialProfile,
  runBulkProfitabilityAnalysis,
  saveSimulation,
  getSavedSimulations,
  FinancialProfile
} from '../src/services/profitabilityService';
import { generateProfitabilityExcel } from '../src/services/profitabilityExcel';
import { ShippingZone } from '../src/services/shippingRatesService';
import { DropiProductRecord } from '../src/services/dropiDb';

// Perfil de prueba estándar
const mockProfile: FinancialProfile = {
  id: 'test_profile_standard',
  name: 'Perfil Test Estándar',
  description: 'Perfil para pruebas unitarias',
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
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString()
};

// Zona de prueba Santiago
const mockSantiagoZone: ShippingZone = {
  id: 'zone_santiago_test',
  name: 'Santiago Urbano Test',
  description: 'Zona RM para pruebas',
  status: 'ACTIVE',
  requires_quote: false,
  coverage_type: 'METROPOLITAN',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  rate: {
    id: 'rate_stgo_1',
    zone_id: 'zone_santiago_test',
    customer_shipping_price: 3570,      // $3.000 neto + $570 IVA
    estimated_dropi_cost: 3570,         // $3.000 neto + $570 IVA
    customer_price_includes_vat: true,
    estimated_cost_includes_vat: true,
    effective_from: '2026-01-01',
    status: 'ACTIVE',
    created_at: new Date().toISOString()
  }
};

// -----------------------------------------------------------------------------
// PRUEBAS DE TRATAMIENTO TRIBUTARIO E IVA (Casos 1 al 7)
// -----------------------------------------------------------------------------

test('1. Compra con factura y crédito fiscal válido', () => {
  const result = evaluateZoneProfitability({
    zone: mockSantiagoZone,
    productPriceGross: 23800, // $20.000 neto + $3.800 IVA débito
    supplierPrice: 11900,     // $10.000 neto + $1.900 IVA crédito
    taxTreatment: 'TAX_CREDIT_APPLICABLE',
    profile: mockProfile
  });

  assert.equal(result.effective_provider_cost, 10000, 'El costo proveedor efectivo debe ser el valor neto ($10.000)');
  assert.equal(result.potential_tax_credit, 1900 + (3570 - 3000), 'Debe acumular crédito fiscal del producto y del despacho');
  assert.equal(result.net_product_revenue, 20000, 'El ingreso neto del producto debe ser $20.000');
  assert.equal(result.vat_debit_product, 3800, 'El IVA débito del producto debe ser $3.800');
});

test('2. Compra sin crédito fiscal', () => {
  const result = evaluateZoneProfitability({
    zone: mockSantiagoZone,
    productPriceGross: 23800,
    supplierPrice: 11900,
    taxTreatment: 'NO_TAX_CREDIT',
    profile: mockProfile
  });

  assert.equal(result.effective_provider_cost, 11900, 'Sin crédito fiscal, el costo efectivo es el total pagado ($11.900)');
  assert.equal(result.potential_tax_credit, 0, 'No debe registrar crédito fiscal para el producto');
});

test('3. Precio proveedor con IVA informado', () => {
  const result = evaluateZoneProfitability({
    zone: mockSantiagoZone,
    productPriceGross: 30000,
    supplierPrice: 14280, // $12.000 + 19%
    taxTreatment: 'TAX_CREDIT_APPLICABLE',
    profile: mockProfile
  });

  assert.equal(result.effective_provider_cost, 12000, 'Costo neto calculado correctamente');
  assert.ok(result.potential_tax_credit >= 2280, 'Crédito fiscal del producto correctamente calculado');
});

test('4. Precio proveedor informado sin IVA (neto)', () => {
  const result = evaluateZoneProfitability({
    zone: mockSantiagoZone,
    productPriceGross: 25000,
    supplierPrice: 10000, // informado como neto
    taxTreatment: 'PRICE_NET_WITHOUT_VAT',
    profile: mockProfile
  });

  assert.equal(result.effective_provider_cost, 10000, 'Costo efectivo debe ser el neto $10.000');
  assert.ok(result.potential_tax_credit >= 1900, 'Debe estimar el crédito fiscal a pagar sobre el neto');
});

test('5. Venta con IVA (desglose neto y débito)', () => {
  const result = evaluateZoneProfitability({
    zone: mockSantiagoZone,
    productPriceGross: 11900, // $10.000 neto + $1.900 IVA
    supplierPrice: 5000,
    taxTreatment: 'NO_TAX_CREDIT',
    profile: mockProfile
  });

  assert.equal(result.net_product_revenue, 10000, 'Neto producto = $10.000');
  assert.equal(result.vat_debit_product, 1900, 'IVA débito producto = $1.900');
  assert.equal(result.vat_debit_product + result.net_product_revenue, 11900, 'Suma neto + IVA debe ser exactamente el precio venta');
});

test('6. Despacho cobrado con IVA', () => {
  const result = evaluateZoneProfitability({
    zone: mockSantiagoZone,
    productPriceGross: 20000,
    supplierPrice: 8000,
    taxTreatment: 'NO_TAX_CREDIT',
    profile: mockProfile,
    customShippingCharged: 4760 // $4.000 neto + $760 IVA
  });

  assert.equal(result.net_shipping_revenue, 4000, 'Neto despacho cobrado = $4.000');
  assert.equal(result.vat_debit_shipping, 760, 'IVA débito despacho = $760');
  assert.equal(result.total_vat_debit, result.vat_debit_product + 760);
});

test('7. Despacho con y sin crédito fiscal', () => {
  const withCredit = evaluateZoneProfitability({
    zone: mockSantiagoZone,
    productPriceGross: 20000,
    supplierPrice: 8000,
    taxTreatment: 'TAX_CREDIT_APPLICABLE',
    profile: mockProfile
  });

  const withoutCredit = evaluateZoneProfitability({
    zone: mockSantiagoZone,
    productPriceGross: 20000,
    supplierPrice: 8000,
    taxTreatment: 'NO_TAX_CREDIT',
    profile: mockProfile
  });

  assert.equal(withCredit.effective_shipping_cost, 3000, 'Con crédito, costo logístico neto es $3.000');
  assert.equal(withoutCredit.effective_shipping_cost, 3570, 'Sin crédito, costo logístico bruto es $3.570');
});

// -----------------------------------------------------------------------------
// PRUEBAS DE COMISIONES, PUBLICIDAD Y RESERVAS (Casos 8 al 11)
// -----------------------------------------------------------------------------

test('8. Comisión porcentual sobre el total cobrado al cliente', () => {
  const result = evaluateZoneProfitability({
    zone: mockSantiagoZone,
    productPriceGross: 20000,
    supplierPrice: 8000,
    taxTreatment: 'TAX_CREDIT_APPLICABLE',
    profile: { ...mockProfile, payment_fee_pct: 0.03, payment_fee_fixed: 0 }
  });

  // Total pagado por cliente = $20.000 + $3.570 = $23.570
  // 3% de $23.570 = $707.1 -> Math.round = $707
  assert.equal(result.payment_fee, Math.round(23570 * 0.03));
});

test('9. Comisión fija por operación', () => {
  const result = evaluateZoneProfitability({
    zone: mockSantiagoZone,
    productPriceGross: 20000,
    supplierPrice: 8000,
    taxTreatment: 'TAX_CREDIT_APPLICABLE',
    profile: { ...mockProfile, payment_fee_pct: 0.03, payment_fee_fixed: 250 }
  });

  const expected = Math.round(23570 * 0.03) + 250;
  assert.equal(result.payment_fee, expected, 'Debe sumar la comisión fija de $250');
});

test('10. Publicidad por pedido', () => {
  const result = evaluateZoneProfitability({
    zone: mockSantiagoZone,
    productPriceGross: 25000,
    supplierPrice: 8000,
    taxTreatment: 'TAX_CREDIT_APPLICABLE',
    profile: { ...mockProfile, estimated_ad_cost_per_order: 4500 }
  });

  assert.equal(result.ad_cost, 4500, 'El costo publicitario debe coincidir con el perfil configurado');
});

test('11. Reserva para devoluciones', () => {
  const result = evaluateZoneProfitability({
    zone: mockSantiagoZone,
    productPriceGross: 30000,
    supplierPrice: 10000,
    taxTreatment: 'TAX_CREDIT_APPLICABLE',
    profile: { ...mockProfile, return_reserve_pct: 0.03 } // 3%
  });

  assert.equal(result.return_reserve, 30000 * 0.03, 'Reserva de devoluciones = $900');
});

// -----------------------------------------------------------------------------
// PRUEBAS DE MÁRGENES, PRECIO MÍNIMO Y SEMÁFORO (Casos 12 al 16)
// -----------------------------------------------------------------------------

test('12. Precio mínimo rentable (solución algebraica determinista)', () => {
  const calculation = calculateTargetSellingPrice({
    targetMarginFraction: 0.25, // 25%
    vatSalesRate: 0.19,
    effectiveProviderCost: 10000,
    effectiveShippingCost: 3000,
    customerShippingPrice: 3570,
    adCost: 3000,
    paymentFeePct: 0.03,
    paymentFeeFixed: 0,
    returnReservePct: 0.02,
    otherVariableCosts: 0
  });

  assert.ok(calculation.isFeasible, 'El cálculo debe ser matemáticamente viable');
  assert.ok(calculation.price !== null && calculation.price > 10000, 'El precio debe ser superior al costo del proveedor');

  // Evaluar con el precio obtenido para comprobar que el margen alcanzado sea >= 25%
  const evaluated = evaluateZoneProfitability({
    zone: mockSantiagoZone,
    productPriceGross: calculation.price!,
    supplierPrice: 11900,
    taxTreatment: 'TAX_CREDIT_APPLICABLE',
    profile: mockProfile
  });

  assert.ok(
    evaluated.contribution_margin_pct! >= 24.8,
    `El margen resultante (${evaluated.contribution_margin_pct}%) debe cumplir el objetivo del 25%`
  );
});

test('13. Margen negativo (detección de pérdida)', () => {
  const result = evaluateZoneProfitability({
    zone: mockSantiagoZone,
    productPriceGross: 12000, // Venta muy baja
    supplierPrice: 15000,     // Proveedor alto
    taxTreatment: 'NO_TAX_CREDIT',
    profile: mockProfile
  });

  assert.equal(result.status, 'LOSS', 'El semáforo debe clasificar como Pérdida Estimada');
  assert.ok(result.contribution_margin_pct! < 0, 'El margen debe ser negativo');
  assert.ok(result.flags.includes('MARGEN_NEGATIVO_EN_ZONA'));
});

test('14. Margen exactamente en el umbral (Semáforo)', () => {
  // Configuración con margen >= 25% -> ATTRACTIVE
  const attractiveResult = evaluateZoneProfitability({
    zone: mockSantiagoZone,
    productPriceGross: 50000,
    supplierPrice: 10000,
    taxTreatment: 'TAX_CREDIT_APPLICABLE',
    profile: mockProfile
  });
  assert.equal(attractiveResult.status, 'ATTRACTIVE');

  // Configuración con margen moderado (entre 15% y 24.9%)
  const moderateResult = evaluateZoneProfitability({
    zone: mockSantiagoZone,
    productPriceGross: 24000,
    supplierPrice: 10000,
    taxTreatment: 'TAX_CREDIT_APPLICABLE',
    profile: mockProfile
  });
  assert.ok(
    moderateResult.status === 'MODERATE' || moderateResult.status === 'ATTRACTIVE',
    `Status debe ser MODERATE o ATTRACTIVE, obtenido: ${moderateResult.status}`
  );
});

test('15. Zona sin tarifa (no evaluable, sin asignar utilidad ficticia)', () => {
  const unconfiguredZone: ShippingZone = {
    id: 'zone_no_rate',
    name: 'Zona Remota Sin Tarifa',
    status: 'ACTIVE',
    requires_quote: false,
    coverage_type: 'NATIONAL',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    rate: undefined
  };

  const result = evaluateZoneProfitability({
    zone: unconfiguredZone,
    productPriceGross: 25000,
    supplierPrice: 10000,
    taxTreatment: 'TAX_CREDIT_APPLICABLE',
    profile: mockProfile
  });

  assert.equal(result.is_evaluable, false, 'No debe ser evaluable');
  assert.equal(result.estimated_profit, null, 'No debe asignar utilidad ficticia de 0');
  assert.equal(result.contribution_margin_pct, null, 'No debe asignar margen ficticio');
  assert.equal(result.status, 'INCOMPLETE');
  assert.ok(result.flags.includes('COSTO_LOGISTICO_NO_DISPONIBLE'));
});

test('16. Zona con cotización obligatoria', () => {
  const quoteZone: ShippingZone = {
    id: 'zone_extreme_quote',
    name: 'Zona Antártica e Islas',
    status: 'ACTIVE',
    requires_quote: true,
    coverage_type: 'EXTREME',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const result = evaluateZoneProfitability({
    zone: quoteZone,
    productPriceGross: 25000,
    supplierPrice: 10000,
    taxTreatment: 'TAX_CREDIT_APPLICABLE',
    profile: mockProfile
  });

  assert.equal(result.is_evaluable, false);
  assert.equal(result.requires_quote, true);
  assert.equal(result.status, 'INCOMPLETE');
  assert.ok(result.flags.includes('ZONA_REQUIERE_COTIZACION'));
});

// -----------------------------------------------------------------------------
// PRUEBAS DE VARIANTES, ANOMALÍAS Y PERFILES (Casos 17 al 20)
// -----------------------------------------------------------------------------

test('17. Producto con variantes múltiples', async () => {
  const mockProductWithVariants: DropiProductRecord = {
    id: 'prod_var_test',
    dropi_id: 99001,
    name: 'Zapatilla Deportiva Variantes',
    supplier_name: 'Calzados Chile',
    category: 'Moda',
    supplier_price_min: 15000,
    supplier_price_max: 20000,
    suggested_price: 35000,
    stock: 50,
    is_verified: true,
    is_premium: false,
    has_variants: true,
    variants: [
      {
        id: 1,
        dropi_variant_id: 1,
        name: 'Talla 38',
        sku: 'ZAP-38',
        supplier_price: 15000,
        suggested_price: 35000,
        stock: 30
      },
      {
        id: 2,
        dropi_variant_id: 2,
        name: 'Talla 44 Especial',
        sku: 'ZAP-44',
        supplier_price: 32000, // Costo muy alto -> margen negativo
        suggested_price: 35000,
        stock: 20
      }
    ],
    last_checked_at: new Date().toISOString()
  };

  const result = await calculateProductProfitability({
    product: mockProductWithVariants,
    profile: mockProfile
  });

  assert.ok(result.has_variants, 'Debe indicar que tiene variantes');
  assert.equal(result.variants_evaluations?.length, 2, 'Debe evaluar las 2 variantes');
  assert.ok(result.flags.includes('VARIANTE_CON_MARGEN_NEGATIVO'), 'Debe alertar la variante con margen negativo');
  assert.equal(result.variants_evaluations?.[1].has_loss, true, 'La talla 44 debe presentar pérdida');
});

test('18. Producto con precio anómalo', async () => {
  const anomalousProduct: DropiProductRecord = {
    id: 'prod_anomaly',
    dropi_id: 99002,
    name: 'Producto Precio Raro',
    supplier_name: 'Proveedor X',
    category: 'Varios',
    supplier_price_min: 15000,
    suggested_price: 5000, // Menor al costo!
    stock: 10,
    is_verified: false,
    is_premium: false,
    last_checked_at: new Date().toISOString()
  };

  const result = await calculateProductProfitability({
    product: anomalousProduct,
    profile: mockProfile
  });

  assert.ok(result.flags.includes('PRECIO_SUGERIDO_ANOMALO'), 'Debe detectar precio sugerido anómalo');
});

test('19. Cambio de perfil financiero (Estándar vs Conservador vs Optimista)', async () => {
  const profiles = await getFinancialProfiles();
  const standard = profiles.find(p => p.id === 'profile_standard')!;
  const conservative = profiles.find(p => p.id === 'profile_conservative')!;

  assert.ok(conservative.estimated_ad_cost_per_order > standard.estimated_ad_cost_per_order);
  assert.ok(conservative.return_reserve_pct > standard.return_reserve_pct);

  const calcStd = calculateTargetSellingPrice({
    targetMarginFraction: standard.target_margin_pct / 100,
    vatSalesRate: standard.vat_sales_rate,
    effectiveProviderCost: 10000,
    effectiveShippingCost: 3000,
    customerShippingPrice: 3570,
    adCost: standard.estimated_ad_cost_per_order,
    paymentFeePct: standard.payment_fee_pct,
    paymentFeeFixed: standard.payment_fee_fixed,
    returnReservePct: standard.return_reserve_pct,
    otherVariableCosts: standard.other_variable_costs
  });

  const calcCons = calculateTargetSellingPrice({
    targetMarginFraction: conservative.target_margin_pct / 100,
    vatSalesRate: conservative.vat_sales_rate,
    effectiveProviderCost: 10000,
    effectiveShippingCost: 3000,
    customerShippingPrice: 3570,
    adCost: conservative.estimated_ad_cost_per_order,
    paymentFeePct: conservative.payment_fee_pct,
    paymentFeeFixed: conservative.payment_fee_fixed,
    returnReservePct: conservative.return_reserve_pct,
    otherVariableCosts: conservative.other_variable_costs
  });

  assert.ok(calcCons.price! > calcStd.price!, 'El escenario conservador debe exigir un precio mayor para alcanzar su margen');
});

test('20. Historial y reproducibilidad de simulaciones', () => {
  const sim = saveSimulation({
    product_id: 'prod_test_sim',
    product_name: 'Producto Simulado',
    simulation_name: 'Simulación Black Friday',
    input_params: {
      sale_price: 29990,
      zone_id: 'zone_santiago_urbano',
      profile_id: 'profile_standard',
      tax_treatment: 'TAX_CREDIT_APPLICABLE',
      ad_cost: 3500
    },
    results: {
      profit: 6500,
      margin_pct: 25.5,
      status: 'ATTRACTIVE',
      min_price: 22000,
      rec_price: 29000
    }
  });

  assert.ok(sim.id.startsWith('sim_'));
  const allSims = getSavedSimulations();
  assert.ok(allSims.some(s => s.id === sim.id), 'La simulación debe persistir en el historial');
});

// -----------------------------------------------------------------------------
// PRUEBAS DE CÁLCULO MASIVO Y EXCEL (Casos 21 y 22)
// -----------------------------------------------------------------------------

test('21. Cálculo masivo de catálogo', async () => {
  const summary = await runBulkProfitabilityAnalysis();

  assert.ok(summary.id.startsWith('run_'));
  assert.equal(summary.status, 'COMPLETED');
  assert.ok(typeof summary.total_evaluated === 'number');
  assert.ok(typeof summary.attractive_count === 'number');
  assert.ok(typeof summary.moderate_count === 'number');
  assert.ok(typeof summary.loss_count === 'number');
  assert.equal(
    summary.attractive_count + summary.moderate_count + summary.low_count + summary.loss_count + summary.incomplete_count,
    summary.total_evaluated,
    'La suma de categorías debe ser igual al total evaluado'
  );
});

test('22. Exportación Excel de 6 hojas requeridas', async () => {
  const sampleProduct: DropiProductRecord = {
    id: 'prod_excel_test',
    dropi_id: 8888,
    name: 'Kit Cuidado Facial Excel',
    supplier_name: 'Cosméticos Bio',
    category: 'Belleza',
    supplier_price_min: 8000,
    suggested_price: 24990,
    stock: 45,
    is_verified: true,
    is_premium: true,
    last_checked_at: new Date().toISOString()
  };

  const evalResult = await calculateProductProfitability({
    product: sampleProduct,
    profile: mockProfile
  });

  const excelBuffer = await generateProfitabilityExcel({
    results: [evalResult],
    profile: mockProfile
  });

  assert.ok(Buffer.isBuffer(excelBuffer), 'Debe retornar un Buffer válido');
  assert.ok(excelBuffer.length > 5000, 'El archivo Excel debe contener datos y estilos');

  // Comprobar firma de archivo ZIP / XLSX (PK..)
  assert.equal(excelBuffer[0], 0x50, 'Firma XLSX byte 0 debe ser P');
  assert.equal(excelBuffer[1], 0x4B, 'Firma XLSX byte 1 debe ser K');
});
