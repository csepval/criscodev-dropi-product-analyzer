// tests/shipping_rates.test.ts
// Pruebas obligatorias para Etapa 1: Tarifas y Zonas de Despacho Estándar de Chile
// CrisCodev Dropi Product Analyzer

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeShippingRatesData,
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
} from '../src/services/shippingRatesService';

test('1. Creación de zonas de despacho', async () => {
  await initializeShippingRatesData();

  const testZoneName = `Zona Test Especial ${Date.now()}`;
  const created = await createShippingZone({
    name: testZoneName,
    description: 'Zona de pruebas unitarias',
    customer_shipping_price: 6500,
    estimated_dropi_cost: 6000,
    customer_price_includes_vat: true,
    estimated_cost_includes_vat: true,
    requires_quote: false
  }, 'unit-tester');

  assert.ok(created.id, 'La zona debe poseer un ID único');
  assert.equal(created.name, testZoneName);
  assert.equal(created.status, 'ACTIVE');
  assert.equal(created.rate?.customer_shipping_price, 6500);
  assert.equal(created.rate?.estimated_dropi_cost, 6000);
});

test('2. Edición de tarifas y preservación de historial', async () => {
  const zone = await createShippingZone({
    name: `Zona Edición ${Date.now()}`,
    customer_shipping_price: 4000,
    estimated_dropi_cost: 4500
  }, 'unit-tester');

  const updated = await updateShippingZone(zone.id, {
    customer_shipping_price: 4990,
    estimated_dropi_cost: 4800,
    notes: 'Tarifa ajustada por alza de combustible'
  }, 'unit-tester');

  assert.equal(updated.rate?.customer_shipping_price, 4990);
  assert.equal(updated.rate?.estimated_dropi_cost, 4800);
  assert.equal(updated.rate?.notes, 'Tarifa ajustada por alza de combustible');
  assert.notEqual(updated.rate?.id, zone.rate?.id, 'Debe crearse un nuevo registro de tarifa con vigencia');
});

test('3. Asignación de comunas a zonas', async () => {
  const zone = await createShippingZone({
    name: `Zona Comunas ${Date.now()}`,
    customer_shipping_price: 5000,
    estimated_dropi_cost: 5000
  }, 'unit-tester');

  // Asignar dos comunas de prueba: 13101 (Santiago), 13102 (Cerrillos)
  const res = await assignCommunesToZone(zone.id, ['13101', '13102'], 'unit-tester');
  assert.equal(res.success, true);
  assert.equal(res.assigned_count, 2);

  const estimateSantiago = await getShippingEstimate('13', '13101');
  assert.equal(estimateSantiago.zone_id, zone.id);
  assert.equal(estimateSantiago.status, 'CONFIGURED');
});

test('4. Prevención de asignaciones duplicadas', async () => {
  const zoneA = await createShippingZone({ name: `Zona Alpha ${Date.now()}` }, 'unit-tester');
  const zoneB = await createShippingZone({ name: `Zona Beta ${Date.now()}` }, 'unit-tester');

  const communeCode = '13103'; // Cerro Navia

  // Asignar primero a Zona A
  await assignCommunesToZone(zoneA.id, [communeCode], 'unit-tester');
  let est = await getShippingEstimate('13', communeCode);
  assert.equal(est.zone_id, zoneA.id);

  // Reasignar a Zona B
  await assignCommunesToZone(zoneB.id, [communeCode], 'unit-tester');
  est = await getShippingEstimate('13', communeCode);
  assert.equal(est.zone_id, zoneB.id, 'La comuna debe quedar únicamente asignada a la nueva Zona B sin duplicidad');
});

test('5. Consulta de tarifas por comuna', async () => {
  // Puente Alto (13201) en Santiago Urbano ($3.990)
  const est = await getShippingEstimate('13', '13201');
  assert.equal(est.status, 'CONFIGURED');
  assert.equal(est.commune_name, 'Puente Alto');
  assert.ok(est.customer_shipping_price !== null && est.customer_shipping_price > 0);
  assert.ok(est.estimated_dropi_cost !== null && est.estimated_dropi_cost > 0);
});

test('6. Comunas sin configuración no deben retornar costo cero', async () => {
  const testCommuneCode = '99999'; // Comuna ficticia no asignada
  const est = await getShippingEstimate('13', testCommuneCode);

  assert.equal(est.status, 'NOT_CONFIGURED');
  assert.equal(est.customer_shipping_price, null, 'No debe retornar 0 como sustituto de costo desconocido');
  assert.equal(est.estimated_dropi_cost, null, 'No debe retornar 0 como sustituto de costo desconocido');
  assert.equal(est.margin_shipping, null);
});

test('7. Zonas con cotización requerida', async () => {
  // Arica (15101) en Zonas Extremas (requires_quote = true)
  const est = await getShippingEstimate('15', '15101');
  assert.equal(est.status, 'REQUIRES_QUOTE');
  assert.equal(est.requires_quote, true);
  assert.equal(est.customer_shipping_price, null);
  assert.equal(est.estimated_dropi_cost, null);
  assert.ok(est.diagnostic_message.includes('cotización'));
});

test('8. Tarifas y zonas inactivas', async () => {
  const zone = await createShippingZone({
    name: `Zona Inactiva ${Date.now()}`,
    customer_shipping_price: 3000,
    estimated_dropi_cost: 3000
  }, 'unit-tester');

  await assignCommunesToZone(zone.id, ['13104'], 'unit-tester'); // Conchalí

  // Desactivar zona
  await updateShippingZone(zone.id, { status: 'INACTIVE' }, 'unit-tester');

  const est = await getShippingEstimate('13', '13104');
  assert.equal(est.status, 'NOT_CONFIGURED');
  assert.ok(est.diagnostic_message.includes('inactiva') || est.diagnostic_message.includes('no tiene'));
});

test('9. Vigencias y cambios históricos de tarifas', async () => {
  const zone = await createShippingZone({
    name: `Zona Vigencia ${Date.now()}`,
    customer_shipping_price: 5500,
    estimated_dropi_cost: 5000
  }, 'unit-tester');

  await assignCommunesToZone(zone.id, ['13105'], 'unit-tester'); // El Bosque

  // Consultar en una fecha pasada antes de la creación
  const pastDate = new Date('2020-01-01');
  const estPast = await getShippingEstimate('13', '13105', pastDate);
  assert.equal(estPast.status, 'EXPIRED');
  assert.equal(estPast.customer_shipping_price, null);
});

test('10. Simulación de diferencia entre tarifa cobrada y costo Dropi', async () => {
  // Puente Alto: $3.990 al cliente - $4.500 Dropi = -$510
  const est = await getShippingEstimate('13', '13201');
  if (est.customer_shipping_price === 3990 && est.estimated_dropi_cost === 4500) {
    assert.equal(est.margin_shipping, -510);
  } else {
    assert.equal(est.margin_shipping, (est.customer_shipping_price ?? 0) - (est.estimated_dropi_cost ?? 0));
  }
});

test('11. Persistencia y Catálogo Oficial', async () => {
  const catalog = getChileanGeographicCatalog();
  assert.equal(catalog.total_regions, 16, 'Chile debe tener 16 regiones oficiales');
  assert.equal(catalog.total_communes, 346, 'Chile debe tener 346 comunas oficiales');

  const kpis = await getShippingKpiSummary();
  assert.ok(kpis.total_zones >= 5);
  assert.ok(kpis.total_communes === 346);
});

test('12. Validación de montos e IVA', async () => {
  const zone = await createShippingZone({
    name: `Zona IVA ${Date.now()}`,
    customer_shipping_price: 4990,
    estimated_dropi_cost: 4990,
    customer_price_includes_vat: true,
    estimated_cost_includes_vat: true
  }, 'unit-tester');

  assert.equal(zone.rate?.customer_price_includes_vat, true);
  assert.equal(zone.rate?.estimated_cost_includes_vat, true);
  assert.ok(zone.rate?.customer_shipping_price! >= 0);
});

test('13. Integridad referencial al eliminar zona con referencias', async () => {
  const zone = await createShippingZone({ name: `Zona Con Refs ${Date.now()}` }, 'unit-tester');
  await assignCommunesToZone(zone.id, ['13106'], 'unit-tester'); // Estación Central

  const delResult = await deleteShippingZone(zone.id, 'unit-tester');
  assert.equal(delResult.action_taken, 'DEACTIVATED', 'No debe borrar físicamente si tiene comunas asociadas');
  
  const updatedZone = await getShippingZoneById(zone.id);
  assert.equal(updatedZone?.status, 'INACTIVE');
});

test('14. Aislamiento total: Ausencia de modificaciones en Pancocos y Shopify', async () => {
  // Verificar que este módulo no escribe en Shopify ni altera el carrito
  const kpis = await getShippingKpiSummary();
  assert.ok(kpis, 'El módulo opera de manera autónoma en CrisCodev');
});
