// src/services/pancocosPublishService.ts
// Publicación de productos simulados: guarda en la BD de Pancocos y
// delega la publicación en Shopify a Pancocos-Fulfillment.

import { getPancocosPool } from '../lib/pancocosDb';

export interface BusinessUnit {
  id: number;
  name: string;
  slug: string;
  is_default: boolean;
}

export interface ProductToPublish {
  dropiId: number;
  name: string;
  description: string;
  category: string;
  supplierName: string;
  imageUrl: string | null;
  supplierPrice: number;
  suggestedPrice: number | null;
  salePrice: number;
  stock: number;
  simulatedMarginPct: number | null;
}

export interface SavedPancocosProduct {
  pancocosProductId: number;
  categoryId: number;
}

export interface FulfillmentPublishResult {
  supplierProductId: string;
  pancocosProductId: number;
  shopifyProductId: string;
  shopifyVariantId: string;
  updatedExisting: boolean;
  catalogStatus: string;
}

const FULFILLMENT_TIMEOUT_MS = 60_000;
const DEFAULT_CATEGORY_NAME = 'Dropshipping';

export async function getActiveBusinessUnits(): Promise<BusinessUnit[]> {
  const result = await getPancocosPool().query<BusinessUnit>(
    `SELECT id, name, slug, is_default
       FROM public.business_units
      WHERE is_active = true
      ORDER BY is_default DESC, name ASC`,
  );
  return result.rows;
}

export async function findActiveBusinessUnit(businessUnitId: number): Promise<BusinessUnit | null> {
  const result = await getPancocosPool().query<BusinessUnit>(
    `SELECT id, name, slug, is_default
       FROM public.business_units
      WHERE id = $1 AND is_active = true`,
    [businessUnitId],
  );
  return result.rows[0] ?? null;
}

function toSlug(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Guarda (o actualiza) el producto en `public."Producto"` dentro de una transacción,
 * junto con su categoría, valores financieros vigentes e inventario.
 * Es idempotente por (business_unit_id, nombre).
 */
export async function saveProductToPancocosDb(
  businessUnit: BusinessUnit,
  product: ProductToPublish,
): Promise<SavedPancocosProduct> {
  const client = await getPancocosPool().connect();

  try {
    await client.query('BEGIN');

    // 1. Categoría de la unidad de negocio (se crea si no existe)
    const categoryName = product.category?.trim() || DEFAULT_CATEGORY_NAME;
    const categoryResult = await client.query<{ id: number }>(
      `INSERT INTO public."Categoria" (business_unit_id, nombre, slug)
       VALUES ($1, $2, $3)
       ON CONFLICT (business_unit_id, nombre) DO UPDATE SET nombre = EXCLUDED.nombre
       RETURNING id`,
      [businessUnit.id, categoryName, toSlug(categoryName) || toSlug(DEFAULT_CATEGORY_NAME)],
    );
    const categoryId = categoryResult.rows[0].id;

    // 2. Producto
    const marginText =
      product.simulatedMarginPct !== null ? `${product.simulatedMarginPct.toFixed(1)}%` : 'n/d';
    const extendedDetail =
      `Dropi ID: ${product.dropiId} | Proveedor: ${product.supplierName} | ` +
      `Margen simulado: ${marginText}`;

    const productResult = await client.query<{ id: number }>(
      `INSERT INTO public."Producto"
         (business_unit_id, nombre, descripcion, precio, "imagenUrl", "categoriaId",
          stock, dropshipping, "detalleAmpliado")
       VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8)
       ON CONFLICT (business_unit_id, nombre) DO UPDATE SET
         descripcion = EXCLUDED.descripcion,
         precio = EXCLUDED.precio,
         "imagenUrl" = EXCLUDED."imagenUrl",
         "categoriaId" = EXCLUDED."categoriaId",
         stock = EXCLUDED.stock,
         dropshipping = true,
         "detalleAmpliado" = EXCLUDED."detalleAmpliado"
       RETURNING id`,
      [
        businessUnit.id,
        product.name,
        product.description,
        product.salePrice,
        product.imageUrl ?? '',
        categoryId,
        product.stock,
        extendedDetail,
      ],
    );
    const pancocosProductId = productResult.rows[0].id;

    // 3. Valores financieros: se cierra el vigente anterior y se inserta el nuevo
    const margin = product.salePrice - product.supplierPrice;
    const marginPct = product.salePrice > 0 ? (margin / product.salePrice) * 100 : 0;

    await client.query(
      `UPDATE public."ProductoValores"
          SET vigente = false, "fechaFin" = NOW()
        WHERE "productoId" = $1 AND vigente = true`,
      [pancocosProductId],
    );
    await client.query(
      `INSERT INTO public."ProductoValores"
         ("productoId", "valorMargen", "valorNeto", "valorVenta", "porcentajeMargen", vigente)
       VALUES ($1, $2, $3, $4, $5, true)`,
      [pancocosProductId, margin, product.supplierPrice, product.salePrice, marginPct],
    );

    // 4. Inventario
    await client.query(
      `INSERT INTO public."Inventario" ("productoId", descripcion, stock)
       VALUES ($1, $2, $3)
       ON CONFLICT ("productoId") DO UPDATE SET stock = EXCLUDED.stock`,
      [pancocosProductId, product.name, product.stock],
    );

    await client.query('COMMIT');
    return { pancocosProductId, categoryId };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Pide a Pancocos-Fulfillment que cree/actualice el producto en Shopify
 * y lo registre en fulfillment.supplier_products.
 */
export async function publishViaPancocosFulfillment(
  businessUnit: BusinessUnit,
  product: ProductToPublish,
  pancocosProductId: number,
): Promise<FulfillmentPublishResult> {
  const baseUrl = process.env.PANCOCOS_FULFILLMENT_URL;
  const internalSecret = process.env.GATEWAY_INTERNAL_SECRET;

  if (!baseUrl || !internalSecret) {
    throw new Error(
      'PANCOCOS_FULFILLMENT_URL y GATEWAY_INTERNAL_SECRET deben estar configuradas en .env.',
    );
  }

  const payload = {
    pancocosProductId,
    dropiProductId: String(product.dropiId),
    title: product.name,
    descriptionHtml: product.description,
    imageUrl: product.imageUrl ?? undefined,
    supplierName: product.supplierName,
    productType: product.category,
    businessUnitSlug: businessUnit.slug,
    supplierCost: product.supplierPrice,
    supplierSuggestedPrice: product.suggestedPrice ?? undefined,
    salePrice: product.salePrice,
    supplierStock: product.stock,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FULFILLMENT_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/catalog/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': internalSecret,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      const detail = body?.message ?? `HTTP ${response.status}`;
      throw new Error(`Pancocos-Fulfillment rechazó la publicación: ${detail}`);
    }

    return body as FulfillmentPublishResult;
  } finally {
    clearTimeout(timeout);
  }
}

