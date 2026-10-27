// src/services/profitabilityExcel.ts
// Generador de reportes Excel (.xlsx) para el Motor de Rentabilidad (Etapa 2)
// CrisCodev Dropi Product Analyzer
//
// 6 Hojas Requeridas:
// 1. Resumen General (KPIs, fechas, notas metodológicas y disclaimer)
// 2. Rentabilidad por Producto (Resumen consolidado, semáforo, márgenes, precios recomendados)
// 3. Rentabilidad por Zona (Matriz producto x zona de despacho, costos logísticos, utilidad neta)
// 4. Productos con Pérdidas (Productos con margen < 0% o alertas de inviabilidad)
// 5. Productos con Evaluación Incompleta (Zonas con cotización obligatoria o sin tarifas Dropi)
// 6. Parámetros Financieros (Perfiles de costos, comisiones, publicidad, IVA)

import ExcelJS from 'exceljs';
import {
  ProductProfitabilityResult,
  FinancialProfile,
  ProfitabilityRunSummary
} from './profitabilityService';

export async function generateProfitabilityExcel(params: {
  results: ProductProfitabilityResult[];
  profile: FinancialProfile;
  runSummary?: ProfitabilityRunSummary;
}): Promise<Buffer> {
  const { results, profile, runSummary } = params;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CrisCodev - Dropi Product Analyzer (Etapa 2)';
  workbook.lastModifiedBy = 'CrisCodev';
  workbook.created = new Date();
  workbook.modified = new Date();

  // Paleta de estilos corporativa CrisCodev
  const COLOR_HEADER_BG = 'FF1E293B'; // Slate 800
  const COLOR_HEADER_TEXT = 'FFFFFFFF';
  const COLOR_ATTRACTIVE_BG = 'FFD1FAE5'; // Light green
  const COLOR_ATTRACTIVE_TEXT = 'FF065F46';
  const COLOR_MODERATE_BG = 'FFDBEAFE'; // Light blue
  const COLOR_MODERATE_TEXT = 'FF1E40AF';
  const COLOR_LOW_BG = 'FFFEF3C7'; // Light amber
  const COLOR_LOW_TEXT = 'FF92400E';
  const COLOR_LOSS_BG = 'FFFEE2E2'; // Light red
  const COLOR_LOSS_TEXT = 'FF991B1B';
  const COLOR_INCOMPLETE_BG = 'FFF3F4F6'; // Light gray
  const COLOR_INCOMPLETE_TEXT = 'FF4B5563';

  // Helper para aplicar estilo al encabezado
  const applyHeaderStyle = (sheet: ExcelJS.Worksheet) => {
    sheet.getRow(1).height = 28;
    sheet.getRow(1).eachCell((cell) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLOR_HEADER_BG },
      };
      cell.font = {
        name: 'Calibri',
        size: 11,
        bold: true,
        color: { argb: COLOR_HEADER_TEXT },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
  };

  // Helper para semáforo de texto
  const getStatusText = (status: string) => {
    switch (status) {
      case 'ATTRACTIVE': return 'Rentabilidad Atractiva (≥25%)';
      case 'MODERATE': return 'Rentabilidad Moderada (15%-25%)';
      case 'LOW': return 'Rentabilidad Baja (0%-15%)';
      case 'LOSS': return 'Pérdida Estimada (<0%)';
      case 'INCOMPLETE': default: return 'Evaluación Incompleta';
    }
  };

  // ==============================================================================
  // HOJA 1: RESUMEN GENERAL
  // ==============================================================================
  const sheetSummary = workbook.addWorksheet('Resumen General');
  sheetSummary.columns = [
    { header: 'Métrica / Indicador', key: 'metric', width: 38 },
    { header: 'Valor', key: 'value', width: 28 },
    { header: 'Detalle / Observación', key: 'notes', width: 45 },
  ];

  sheetSummary.getRow(1).height = 28;
  applyHeaderStyle(sheetSummary);

  const totalProducts = results.length;
  const attractive = results.filter(r => r.overall_classification === 'ATTRACTIVE').length;
  const moderate = results.filter(r => r.overall_classification === 'MODERATE').length;
  const low = results.filter(r => r.overall_classification === 'LOW').length;
  const loss = results.filter(r => r.overall_classification === 'LOSS').length;
  const incomplete = results.filter(r => r.overall_classification === 'INCOMPLETE').length;

  const validAvgMargins = results
    .map(r => r.avg_margin_pct)
    .filter((m): m is number => m !== null);
  const globalAvgMargin = validAvgMargins.length > 0
    ? (validAvgMargins.reduce((a, b) => a + b, 0) / validAvgMargins.length).toFixed(1) + '%'
    : 'N/A';

  const rowsSummaryData = [
    { metric: 'Herramienta de Análisis', value: 'CrisCodev – Dropi Product Analyzer', notes: 'Etapa 2: Motor de Rentabilidad y Costos' },
    { metric: 'Fecha de Generación', value: new Date().toLocaleString('es-CL'), notes: 'Hora local Chile' },
    { metric: 'Perfil Financiero Aplicado', value: profile.name, notes: profile.description },
    { metric: 'Margen Objetivo Configurado', value: `${profile.target_margin_pct}%`, notes: 'Umbral para rentabilidad atractiva' },
    { metric: 'Margen Mínimo Aceptable', value: `${profile.min_acceptable_margin_pct}%`, notes: 'Umbral mínimo antes de alerta' },
    { metric: 'Inversión Publicitaria Base', value: `$${profile.estimated_ad_cost_per_order.toLocaleString('es-CL')} CLP`, notes: 'Estimación analítica por pedido' },
    { metric: 'Comisión Pasarela de Pago', value: `${(profile.payment_fee_pct * 100).toFixed(1)}% + $${profile.payment_fee_fixed} CLP`, notes: 'Sobre valor cobrado al cliente' },
    { metric: 'Reserva para Devoluciones', value: `${(profile.return_reserve_pct * 100).toFixed(1)}%`, notes: 'Sobre precio venta producto' },
    { metric: 'Tasa IVA Ventas', value: `${(profile.vat_sales_rate * 100).toFixed(0)}%`, notes: 'IVA Débito fiscal Chile' },
    { metric: '--------------------------------', value: '--------------------', notes: '----------------------------------------' },
    { metric: 'Total Productos Evaluados', value: totalProducts, notes: 'Catálogo importado Dropi Chile' },
    { metric: '1. Rentabilidad Atractiva (≥ 25%)', value: attractive, notes: `${totalProducts > 0 ? ((attractive / totalProducts) * 100).toFixed(1) : 0}% del total` },
    { metric: '2. Rentabilidad Moderada (15% - 25%)', value: moderate, notes: `${totalProducts > 0 ? ((moderate / totalProducts) * 100).toFixed(1) : 0}% del total` },
    { metric: '3. Rentabilidad Baja (0% - 15%)', value: low, notes: `${totalProducts > 0 ? ((low / totalProducts) * 100).toFixed(1) : 0}% del total` },
    { metric: '4. Productos con Pérdidas (< 0%)', value: loss, notes: `${totalProducts > 0 ? ((loss / totalProducts) * 100).toFixed(1) : 0}% del total (Alerta crítica)` },
    { metric: '5. Evaluación Incompleta / Faltante', value: incomplete, notes: `${totalProducts > 0 ? ((incomplete / totalProducts) * 100).toFixed(1) : 0}% del total (Sin tarifa o requiere cotización)` },
    { metric: 'Margen Promedio Simple Catálogo', value: globalAvgMargin, notes: 'Promedio de zonas evaluables' },
    { metric: '--------------------------------', value: '--------------------', notes: '----------------------------------------' },
    { metric: 'AVISO METODOLÓGICO Y RESTRICCIÓN', value: 'USO EXCLUSIVAMENTE ANALÍTICO', notes: 'Valores estimados. No constituyen precios publicados en Pancocos ni liquidaciones F29 reales.' }
  ];

  rowsSummaryData.forEach(r => sheetSummary.addRow(r));

  // ==============================================================================
  // HOJA 2: RENTABILIDAD POR PRODUCTO
  // ==============================================================================
  const sheetProducts = workbook.addWorksheet('Rentabilidad por Producto', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheetProducts.columns = [
    { header: 'ID Dropi', key: 'dropi_id', width: 12 },
    { header: 'Producto', key: 'product_name', width: 42 },
    { header: 'Categoría', key: 'category', width: 20 },
    { header: 'Proveedor', key: 'supplier_name', width: 26 },
    { header: 'Costo Proveedor (CLP)', key: 'supplier_price', width: 20 },
    { header: 'Tratamiento Tributario', key: 'tax_treatment', width: 24 },
    { header: 'Precio Sugerido Dropi (CLP)', key: 'suggested_price', width: 24 },
    { header: 'Precio Venta Utilizado (CLP)', key: 'sale_price', width: 24 },
    { header: 'Precio Mínimo Rentable (CLP)', key: 'min_price', width: 25 },
    { header: 'Precio Recomendado (CLP)', key: 'rec_price', width: 24 },
    { header: 'Mejor Margen (%)', key: 'best_margin', width: 16 },
    { header: 'Peor Margen (%)', key: 'worst_margin', width: 16 },
    { header: 'Margen Promedio (%)', key: 'avg_margin', width: 18 },
    { header: 'Zonas Rentables', key: 'profitable_zones', width: 16 },
    { header: 'Cobertura Evaluable (%)', key: 'coverage_pct', width: 22 },
    { header: 'Semáforo de Rentabilidad', key: 'status_label', width: 28 },
    { header: 'Alertas Financieras', key: 'flags', width: 35 },
  ];

  applyHeaderStyle(sheetProducts);
  sheetProducts.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: results.length + 1, column: sheetProducts.columns.length },
  };

  results.forEach(p => {
    const row = sheetProducts.addRow({
      dropi_id: p.dropi_id,
      product_name: p.product_name,
      category: p.category,
      supplier_name: p.supplier_name,
      supplier_price: p.supplier_price,
      tax_treatment: p.tax_treatment_used === 'TAX_CREDIT_APPLICABLE' ? 'Factura con Crédito Fiscal' : 'Sin Crédito / Conservador',
      suggested_price: p.suggested_price ?? 'Sin datos',
      sale_price: p.sale_price_used,
      min_price: p.overall_min_profitable_price ?? 'N/A',
      rec_price: p.overall_recommended_price ?? 'N/A',
      best_margin: p.best_margin_pct !== null ? `${p.best_margin_pct}%` : 'N/A',
      worst_margin: p.worst_margin_pct !== null ? `${p.worst_margin_pct}%` : 'N/A',
      avg_margin: p.avg_margin_pct !== null ? `${p.avg_margin_pct}%` : 'N/A',
      profitable_zones: `${p.profitable_zones_count} / ${p.total_zones_count}`,
      coverage_pct: `${p.evaluable_coverage_pct}%`,
      status_label: getStatusText(p.overall_classification),
      flags: p.flags.length > 0 ? p.flags.join(' | ') : 'Sin alertas'
    });

    // Formateo de números CLP
    [5, 7, 8, 9, 10].forEach(colIdx => {
      const cell = row.getCell(colIdx);
      if (typeof cell.value === 'number') {
        cell.numFmt = '"$"#,##0';
      }
    });

    // Estilo condicional según Semáforo
    const statusCell = row.getCell(16);
    let bg = COLOR_INCOMPLETE_BG;
    let fg = COLOR_INCOMPLETE_TEXT;
    if (p.overall_classification === 'ATTRACTIVE') { bg = COLOR_ATTRACTIVE_BG; fg = COLOR_ATTRACTIVE_TEXT; }
    else if (p.overall_classification === 'MODERATE') { bg = COLOR_MODERATE_BG; fg = COLOR_MODERATE_TEXT; }
    else if (p.overall_classification === 'LOW') { bg = COLOR_LOW_BG; fg = COLOR_LOW_TEXT; }
    else if (p.overall_classification === 'LOSS') { bg = COLOR_LOSS_BG; fg = COLOR_LOSS_TEXT; }

    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    statusCell.font = { name: 'Calibri', bold: true, color: { argb: fg } };
  });

  // ==============================================================================
  // HOJA 3: RENTABILIDAD POR ZONA
  // ==============================================================================
  const sheetZones = workbook.addWorksheet('Rentabilidad por Zona', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheetZones.columns = [
    { header: 'ID Dropi', key: 'dropi_id', width: 12 },
    { header: 'Producto', key: 'product_name', width: 36 },
    { header: 'Zona de Despacho', key: 'zone_name', width: 28 },
    { header: 'Precio Venta (CLP)', key: 'sale_price', width: 18 },
    { header: 'Despacho Cliente (CLP)', key: 'shipping_charged', width: 22 },
    { header: 'Costo Logístico Dropi (CLP)', key: 'shipping_dropi_cost', width: 24 },
    { header: 'Margen Logístico (CLP)', key: 'logistics_margin', width: 20 },
    { header: 'Total Cliente (CLP)', key: 'total_customer', width: 18 },
    { header: 'Venta Neta (CLP)', key: 'net_revenue', width: 18 },
    { header: 'IVA Débito (CLP)', key: 'vat_debit', width: 16 },
    { header: 'Crédito Fiscal (CLP)', key: 'tax_credit', width: 18 },
    { header: 'Costo Efectivo Prov. (CLP)', key: 'cost_prov', width: 22 },
    { header: 'Comisión Pago (CLP)', key: 'fee_payment', width: 18 },
    { header: 'Publicidad (CLP)', key: 'ad_cost', width: 16 },
    { header: 'Reserva Devol. (CLP)', key: 'return_reserve', width: 18 },
    { header: 'Utilidad Estimada (CLP)', key: 'profit', width: 20 },
    { header: 'Margen Contribución (%)', key: 'margin_pct', width: 22 },
    { header: 'Precio Mín. Rentable (CLP)', key: 'min_price', width: 22 },
    { header: 'Estado Zona', key: 'status_label', width: 24 },
  ];

  applyHeaderStyle(sheetZones);

  let zoneRowCount = 0;
  results.forEach(p => {
    p.zones_evaluations.forEach(z => {
      zoneRowCount++;
      const row = sheetZones.addRow({
        dropi_id: p.dropi_id,
        product_name: p.product_name,
        zone_name: z.zone_name,
        sale_price: z.sale_price,
        shipping_charged: z.shipping_charged ?? 'Sin tarifa',
        shipping_dropi_cost: z.shipping_dropi_cost ?? (z.requires_quote ? 'Cotización requerida' : 'No disponible'),
        logistics_margin: z.logistics_margin ?? 'N/A',
        total_customer: z.total_customer_pays ?? 'N/A',
        net_revenue: z.is_evaluable ? z.net_revenue : 'N/A',
        vat_debit: z.is_evaluable ? z.total_vat_debit : 'N/A',
        tax_credit: z.is_evaluable ? z.potential_tax_credit : 'N/A',
        cost_prov: z.effective_provider_cost,
        fee_payment: z.payment_fee,
        ad_cost: z.ad_cost,
        return_reserve: z.return_reserve,
        profit: z.estimated_profit ?? 'N/A',
        margin_pct: z.contribution_margin_pct !== null ? `${z.contribution_margin_pct}%` : 'N/A',
        min_price: z.min_profitable_price ?? 'N/A',
        status_label: getStatusText(z.status)
      });

      // Formato moneda
      [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 18].forEach(colIdx => {
        const cell = row.getCell(colIdx);
        if (typeof cell.value === 'number') {
          cell.numFmt = '"$"#,##0';
        }
      });

      const statusCell = row.getCell(19);
      if (z.status === 'LOSS') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_LOSS_BG } };
        statusCell.font = { name: 'Calibri', bold: true, color: { argb: COLOR_LOSS_TEXT } };
      } else if (z.status === 'ATTRACTIVE') {
        statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_ATTRACTIVE_BG } };
        statusCell.font = { name: 'Calibri', bold: true, color: { argb: COLOR_ATTRACTIVE_TEXT } };
      }
    });
  });

  if (zoneRowCount > 0) {
    sheetZones.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: zoneRowCount + 1, column: sheetZones.columns.length },
    };
  }

  // ==============================================================================
  // HOJA 4: PRODUCTOS CON PÉRDIDAS
  // ==============================================================================
  const sheetLoss = workbook.addWorksheet('Productos con Pérdidas', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheetLoss.columns = [
    { header: 'ID Dropi', key: 'dropi_id', width: 12 },
    { header: 'Producto', key: 'product_name', width: 40 },
    { header: 'Proveedor', key: 'supplier_name', width: 26 },
    { header: 'Costo Proveedor (CLP)', key: 'supplier_price', width: 20 },
    { header: 'Precio Venta Utilizado (CLP)', key: 'sale_price', width: 24 },
    { header: 'Margen Promedio (%)', key: 'avg_margin', width: 20 },
    { header: 'Peor Margen (%)', key: 'worst_margin', width: 18 },
    { header: 'Zonas con Pérdidas', key: 'loss_zones', width: 18 },
    { header: 'Precio Mínimo para Evitar Pérdida (CLP)', key: 'min_price', width: 32 },
    { header: 'Diagnóstico de Pérdida', key: 'flags', width: 45 },
  ];

  applyHeaderStyle(sheetLoss);

  const lossProducts = results.filter(p => p.overall_classification === 'LOSS' || p.loss_zones_count > 0);
  lossProducts.forEach(p => {
    const row = sheetLoss.addRow({
      dropi_id: p.dropi_id,
      product_name: p.product_name,
      supplier_name: p.supplier_name,
      supplier_price: p.supplier_price,
      sale_price: p.sale_price_used,
      avg_margin: p.avg_margin_pct !== null ? `${p.avg_margin_pct}%` : 'N/A',
      worst_margin: p.worst_margin_pct !== null ? `${p.worst_margin_pct}%` : 'N/A',
      loss_zones: `${p.loss_zones_count} de ${p.total_zones_count}`,
      min_price: p.overall_min_profitable_price ?? 'Inviable al margen actual',
      flags: p.flags.length > 0 ? p.flags.join(' | ') : 'Margen negativo en zonas de despacho'
    });

    [4, 5, 9].forEach(colIdx => {
      const cell = row.getCell(colIdx);
      if (typeof cell.value === 'number') {
        cell.numFmt = '"$"#,##0';
      }
    });

    row.getCell(6).font = { name: 'Calibri', bold: true, color: { argb: COLOR_LOSS_TEXT } };
  });

  if (lossProducts.length > 0) {
    sheetLoss.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: lossProducts.length + 1, column: sheetLoss.columns.length },
    };
  }

  // ==============================================================================
  // HOJA 5: PRODUCTOS CON EVALUACIÓN INCOMPLETA
  // ==============================================================================
  const sheetIncomplete = workbook.addWorksheet('Evaluación Incompleta', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheetIncomplete.columns = [
    { header: 'ID Dropi', key: 'dropi_id', width: 12 },
    { header: 'Producto', key: 'product_name', width: 40 },
    { header: 'Proveedor', key: 'supplier_name', width: 26 },
    { header: 'Costo Proveedor (CLP)', key: 'supplier_price', width: 20 },
    { header: 'Zonas sin Tarifa / Requieren Cotización', key: 'unevaluable_zones', width: 34 },
    { header: 'Cobertura Evaluable (%)', key: 'coverage_pct', width: 24 },
    { header: 'Motivo de Evaluación Incompleta', key: 'reason', width: 45 },
  ];

  applyHeaderStyle(sheetIncomplete);

  const incompleteProducts = results.filter(p => p.overall_classification === 'INCOMPLETE' || p.unevaluable_zones_count > 0);
  incompleteProducts.forEach(p => {
    const row = sheetIncomplete.addRow({
      dropi_id: p.dropi_id,
      product_name: p.product_name,
      supplier_name: p.supplier_name,
      supplier_price: p.supplier_price,
      unevaluable_zones: `${p.unevaluable_zones_count} de ${p.total_zones_count}`,
      coverage_pct: `${p.evaluable_coverage_pct}%`,
      reason: p.flags.includes('COBERTURA_INSUFICIENTE')
        ? 'Cobertura evaluable menor al 40% del territorio nacional'
        : 'Zonas con cotización obligatoria o sin estimación de costo Dropi'
    });

    row.getCell(4).numFmt = '"$"#,##0';
  });

  if (incompleteProducts.length > 0) {
    sheetIncomplete.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: incompleteProducts.length + 1, column: sheetIncomplete.columns.length },
    };
  }

  // ==============================================================================
  // HOJA 6: PARÁMETROS FINANCIEROS APLICADOS
  // ==============================================================================
  const sheetParams = workbook.addWorksheet('Parámetros Financieros');
  sheetParams.columns = [
    { header: 'Parámetro', key: 'param', width: 34 },
    { header: 'Valor Configurado', key: 'val', width: 24 },
    { header: 'Descripción e Impacto Tributario / Financiero', key: 'desc', width: 50 },
  ];

  applyHeaderStyle(sheetParams);

  const rowsParams = [
    { param: 'Nombre del Perfil', val: profile.name, desc: 'Identificador del escenario financiero evaluado' },
    { param: 'Tasa IVA Débito (Ventas)', val: `${(profile.vat_sales_rate * 100).toFixed(0)}%`, desc: 'Tasa general de IVA en Chile (Ley sobre Impuesto a las Ventas y Servicios)' },
    { param: 'Margen Objetivo', val: `${profile.target_margin_pct}%`, desc: 'Meta de margen de contribución para clasificar el producto como Atractivo' },
    { param: 'Margen Mínimo Aceptable', val: `${profile.min_acceptable_margin_pct}%`, desc: 'Piso mínimo de rentabilidad antes de emitir alerta de bajo margen' },
    { param: 'Publicidad Estimada por Pedido', val: `$${profile.estimated_ad_cost_per_order.toLocaleString('es-CL')} CLP`, desc: 'Costo de adquisición de cliente estimado (CAC)' },
    { param: 'Comisión de Pago Porcentual', val: `${(profile.payment_fee_pct * 100).toFixed(1)}%`, desc: 'Tarifa cobrada por pasarela de pago (Transbank / MercadoPago / etc.)' },
    { param: 'Comisión de Pago Fija', val: `$${profile.payment_fee_fixed} CLP`, desc: 'Costo fijo por transacción' },
    { param: 'Reserva para Devoluciones', val: `${(profile.return_reserve_pct * 100).toFixed(1)}%`, desc: 'Porcentaje reservado para cubrir pérdidas por pedidos no entregados o devueltos' },
    { param: 'Otros Costos Variables', val: `$${profile.other_variable_costs} CLP`, desc: 'Empaque, cintas, etiquetas o costos operativos directos' },
    { param: 'Moneda Oficial', val: profile.currency, desc: 'Peso Chileno (CLP)' },
    { param: 'Tratamiento Tributario Proveedor', val: 'Factura con Crédito Fiscal / Conservador', desc: 'Distingue costo neto con crédito fiscal vs costo bruto sin derecho a crédito' },
    { param: 'Restricción de Operación', val: 'Sin Modificación a Pancocos', desc: 'No interviene catálogo de Shopify ni checkout de clientes' }
  ];

  rowsParams.forEach(p => sheetParams.addRow(p));

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
