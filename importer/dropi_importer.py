#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CrisCodev - Dropi Product Analyzer
Módulo: Importador de Catálogo Dropi Chile
Autor: CrisCodev
Fecha: 2026-10-22

Regla de codificación: Prioriza código legible sobre código corto.

Este servicio realiza la extracción controlada de productos del catálogo de Dropi Chile,
aplica validaciones comerciales y de calidad de datos, detecta precios anómalos
y estructura los registros para su persistencia en PostgreSQL.
"""

import sys
import os
import json
import time
import argparse
import urllib.request
import urllib.error
import ssl
from typing import Dict, Any, List, Optional, Tuple


# ==============================================================================
# CONFIGURACIÓN Y CONSTANTES
# ==============================================================================

DEFAULT_API_URL = "https://api-v2.dropi.cl/bff/catalog/products/v4/index"
FALLBACK_API_URL = "https://api.dropi.cl/api/products/v4/index"
OFFICIAL_API_URL = "https://api.dropi.cl/api/products/index"

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)

# Umbral mínimo de precio sugerido razonable en pesos chilenos (CLP)
MINIMUM_REASONABLE_SUGGESTED_PRICE_CLP = 2000.0


# ==============================================================================
# CLASE PRINCIPAL: DropiImporter
# ==============================================================================

class DropiImporter:
    """
    Cliente para la importación autorizada y filtrada del catálogo de Dropi Chile.
    """

    def __init__(self, token: Optional[str] = None):
        """
        Inicializa el importador con el token de autorización provisto o guardado.
        """
        self.token = token or self._resolve_token()
        self.ssl_context = ssl.create_default_context()

    def _resolve_token(self) -> Optional[str]:
        """
        Busca el token en variables de entorno o en el archivo de sesión local.
        """
        env_token = os.environ.get("DROPI_TOKEN") or os.environ.get("DROPI_INTEGRATION_TOKEN")
        if env_token:
            return env_token.strip()

        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        session_file = os.path.join(base_dir, "src", "data", "dropi_connection.json")
        if os.path.exists(session_file):
            try:
                with open(session_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    token = data.get("encrypted_token") or data.get("token")
                    if token:
                        return token.strip()
            except Exception:
                pass
        return None

    def test_connection(self) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
        """
        Verifica si la conexión y el token son válidos consultando el catálogo.
        Retorna (exitoso, mensaje_diagnostico, datos_adicionales).
        """
        if not self.token:
            return False, "No hay ningún token o sesión de Dropi configurado.", None

        # Probar con lote mínimo de 1 producto
        payload = {
            "pageSize": 1,
            "startData": 0,
            "search_type": "simple"
        }

        success, response_data, error_msg = self._make_request(DEFAULT_API_URL, payload)
        if success:
            return True, "Conexión autorizada y verificada con Dropi Chile exitosamente.", response_data

        # Probar con API alternativa
        alt_success, alt_response, alt_error = self._make_request(FALLBACK_API_URL, payload)
        if alt_success:
            return True, "Conexión verificada exitosamente a través de la API alternativa de Dropi.", alt_response

        return False, f"Fallo de autenticación en Dropi: {error_msg or alt_error}", None

    def fetch_products(
        self,
        category: Optional[str] = "Tecnología",
        categoryuser: Optional[List[int]] = None,
        min_price: float = 0.0,
        max_price: float = 50000.0,
        min_stock: int = 0,
        city: Optional[str] = None,
        max_products: int = 50,
        keywords: str = ""
    ) -> Dict[str, Any]:
        """
        Realiza la extracción controlada de productos paginando hasta alcanzar max_products.
        """
        start_time = time.time()
        job_result = {
            "total_fetched": 0,
            "total_inserted": 0,
            "total_updated": 0,
            "total_flagged": 0,
            "total_errors": 0,
            "duration_ms": 0,
            "status": "RUNNING",
            "products": [],
            "suppliers": [],
            "diagnostic_message": "",
            "error_message": None
        }

        # Proveedores por defecto: 1 = Premium, 2 = Verificado
        if categoryuser is None:
            categoryuser = [2, 1]

        fetched_products: List[Dict[str, Any]] = []
        page_size = min(max_products, 50)
        current_offset = 0

        while len(fetched_products) < max_products:
            # Construcción del payload según contrato Dropi verificado en la auditoría
            payload: Dict[str, Any] = {
                "pageSize": page_size,
                "startData": current_offset,
                "search_type": "simple",
                "keywords": keywords,
                "minPrice": int(min_price),
                "maxPrice": int(max_price),
                "with_collection": True,
                "get_stock": False,
                "no_count": True
            }

            if category:
                payload["category"] = [category]
            if categoryuser:
                payload["categoryuser"] = categoryuser
                payload["userVerified"] = True
            if city:
                payload["cities"] = [city]

            print(
                f"[Importador] Solicitando lote offset={current_offset}, tamaño={page_size}...",
                file=sys.stderr
            )

            success, response_data, error_msg = self._make_request(DEFAULT_API_URL, payload)

            if not success:
                # Intentar con endpoint fallback
                print(
                    f"[Importador] Reintentando con endpoint alternativo debido a: {error_msg}",
                    file=sys.stderr
                )
                success, response_data, error_msg = self._make_request(FALLBACK_API_URL, payload)

            if not success:
                job_result["status"] = "FAILED"
                job_result["error_message"] = error_msg
                job_result["diagnostic_message"] = f"Error al consultar Dropi en offset {current_offset}: {error_msg}"
                break

            # Extraer lista de productos del formato devuelto
            batch_raw = self._extract_products_from_response(response_data)

            if not batch_raw:
                print("[Importador] No se encontraron más productos en la respuesta.", file=sys.stderr)
                break

            for raw_item in batch_raw:
                if len(fetched_products) >= max_products:
                    break

                try:
                    normalized_product = self._normalize_product(raw_item)
                    fetched_products.append(normalized_product)
                    if normalized_product.get("requires_review"):
                        job_result["total_flagged"] += 1
                except Exception as parse_err:
                    print(f"[Importador] Error al parsear producto: {parse_err}", file=sys.stderr)
                    job_result["total_errors"] += 1

            # Si el lote vino con menos productos que el page_size, fin del catálogo
            if len(batch_raw) < page_size:
                break

            current_offset += page_size
            time.sleep(0.4)  # Pausa de cortesía para respetar límites de Dropi

        elapsed_ms = int((time.time() - start_time) * 1000)
        job_result["total_fetched"] = len(fetched_products)
        job_result["products"] = fetched_products
        job_result["duration_ms"] = elapsed_ms

        if job_result["status"] != "FAILED":
            job_result["status"] = "COMPLETED"
            job_result["diagnostic_message"] = (
                f"Importación controlada finalizada con éxito. "
                f"Obtenidos {len(fetched_products)} productos en {elapsed_ms}ms "
                f"({job_result['total_flagged']} con advertencias de calidad)."
            )

        return job_result

    # --------------------------------------------------------------------------
    # MÉTODOS PRIVADOS DE APOYO
    # --------------------------------------------------------------------------

    def _make_request(
        self, url: str, payload: Dict[str, Any]
    ) -> Tuple[bool, Optional[Dict[str, Any]], Optional[str]]:
        """
        Ejecuta una petición HTTP POST segura hacia Dropi con las cabeceras requeridas.
        """
        encoded_data = json.dumps(payload).encode("utf-8")

        headers = {
            "Content-Type": "application/json",
            "User-Agent": DEFAULT_USER_AGENT,
        }

        if self.token:
            clean_token = self.token.replace("Bearer ", "").strip()
            headers["Authorization"] = f"Bearer {clean_token}"
            headers["X-Authorization"] = f"Bearer {clean_token}"
            headers["X-Host"] = "cl"
            # dropi-integracion-key solo aplica para llaves API directas, no tokens de sesión JWT
            if not clean_token.startswith("eyJ"):
                headers["dropi-integracion-key"] = clean_token

        req = urllib.request.Request(url, data=encoded_data, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(req, context=self.ssl_context, timeout=20) as response:
                response_text = response.read().decode("utf-8")
                parsed_json = json.loads(response_text)
                return True, parsed_json, None

        except urllib.error.HTTPError as http_err:
            error_body = ""
            try:
                error_body = http_err.read().decode("utf-8")
            except Exception:
                pass

            if http_err.code == 401:
                return False, None, "Sesión no autorizada o expirada en Dropi (HTTP 401)."
            elif http_err.code == 403:
                return False, None, "Acceso denegado por Dropi (HTTP 403)."
            elif http_err.code == 429:
                return False, None, "Límite de peticiones alcanzado en Dropi (HTTP 429 Rate Limit)."
            else:
                return False, None, f"Error HTTP {http_err.code}: {http_err.reason} - {error_body[:200]}"

        except urllib.error.URLError as url_err:
            return False, None, f"Error de conexión con Dropi: {url_err.reason}"
        except Exception as general_err:
            return False, None, f"Error inesperado al consultar Dropi: {str(general_err)}"

    def _extract_products_from_response(self, response_data: Optional[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Extrae la lista de objetos de producto considerando las distintas envolturas de Dropi.
        """
        if not response_data:
            return []

        # Formato BFF v4: {"data": {"objects": [...]}}
        if "data" in response_data and isinstance(response_data["data"], dict):
            data_dict = response_data["data"]
            if "objects" in data_dict and isinstance(data_dict["objects"], list):
                return data_dict["objects"]
            if "products" in data_dict and isinstance(data_dict["products"], list):
                return data_dict["products"]

        # Formato estándar: {"objects": [...]}
        if "objects" in response_data:
            objs = response_data["objects"]
            if isinstance(objs, list):
                return objs
            if isinstance(objs, dict) and "products" in objs:
                return objs["products"]

        # Formato lista directa
        if "products" in response_data and isinstance(response_data["products"], list):
            return response_data["products"]

        return []

    def _normalize_product(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        """
        Normaliza los atributos del producto y evalúa reglas de calidad comercial.
        No modifica ni inventa los precios originales; si detecta anomalías,
        activa requires_review y crea las alertas correspondientes.
        """
        product_id = raw.get("id")
        if not product_id:
            raise ValueError("El producto no contiene un identificador único 'id'.")

        name = (raw.get("name") or "Sin Nombre").strip()

        # Determinación de tipo y variantes
        product_type = (raw.get("type") or "SIMPLE").upper()
        has_variants = (product_type == "VARIABLE") or bool(raw.get("is_variation"))

        # Precios brutos
        raw_sale_price = raw.get("sale_price")
        supplier_price_min = float(raw_sale_price) if raw_sale_price is not None else 0.0
        supplier_price_max = supplier_price_min

        raw_suggested = raw.get("suggested_price")
        suggested_price: Optional[float] = float(raw_suggested) if raw_suggested is not None else None

        # Stock disponible
        raw_stock = raw.get("stock")
        if raw_stock is None:
            raw_stock = raw.get("stock_simple")
        stock = int(raw_stock) if raw_stock is not None else 0

        # Datos del proveedor
        supplier_info = raw.get("supplier") or raw.get("user") or {}
        supplier_id_raw = supplier_info.get("id") or raw.get("user_id") or 0
        supplier_name = (supplier_info.get("name") or "Proveedor Dropi").strip()
        is_verified = bool(supplier_info.get("is_verified") or raw.get("userVerified"))
        is_premium = bool(supplier_info.get("is_premium") or raw.get("is_premium"))

        # Categoría y ciudad
        category_obj = raw.get("category")
        category_name = "General"
        if isinstance(category_obj, dict):
            category_name = category_obj.get("name") or "General"
        elif isinstance(category_obj, str) and category_obj.strip():
            category_name = category_obj.strip()

        city = raw.get("city") or supplier_info.get("city") or None

        # Imágenes (Dropi prioriza imagen marcada como main en gallery)
        image_url: Optional[str] = raw.get("image")
        gallery = raw.get("gallery") or []
        if isinstance(gallery, list) and gallery:
            main_img = next((g for g in gallery if isinstance(g, dict) and g.get("main")), None)
            if not main_img and len(gallery) > 0 and isinstance(gallery[0], dict):
                main_img = gallery[0]
            if main_img:
                image_url = main_img.get("urlS3") or main_img.get("url") or image_url

        # URL de ficha de producto en Dropi
        slug = raw.get("slug") or str(product_id)
        product_url = f"https://app.dropi.cl/dashboard/product-details/{product_id}/{slug}"

        # Procesamiento de variantes
        variants_list: List[Dict[str, Any]] = []
        raw_variations = raw.get("variations") or []
        if isinstance(raw_variations, list) and raw_variations:
            has_variants = True
            var_prices = []
            var_total_stock = 0

            for v in raw_variations:
                if not isinstance(v, dict):
                    continue
                v_id = v.get("id") or 0
                v_price = float(v.get("sale_price") or supplier_price_min)
                v_suggested = float(v.get("suggested_price")) if v.get("suggested_price") else suggested_price
                v_stock = int(v.get("stock") or 0)
                v_sku = v.get("sku") or None
                v_name = v.get("variation_name") or v.get("title") or f"Variante {v_id}"

                var_prices.append(v_price)
                var_total_stock += v_stock

                variants_list.append({
                    "id": f"var_{product_id}_{v_id}",
                    "product_id": f"dropi_{product_id}",
                    "dropi_variant_id": v_id,
                    "sku": v_sku,
                    "variation_name": v_name,
                    "supplier_price": v_price,
                    "suggested_price": v_suggested,
                    "stock": v_stock
                })

            if var_prices:
                supplier_price_min = min(var_prices)
                supplier_price_max = max(var_prices)
            if stock == 0 and var_total_stock > 0:
                stock = var_total_stock

        # ======================================================================
        # REGLAS DE DETECCIÓN DE ANOMALÍAS Y CONTROL DE CALIDAD
        # ======================================================================
        flags: List[Dict[str, Any]] = []
        requires_review = False

        # 1. Precio sugerido ausente o menor a $2.000 CLP
        if suggested_price is None or suggested_price <= 0:
            requires_review = True
            flags.append({
                "flag_code": "MISSING_SUGGESTED_PRICE",
                "description": "Precio sugerido no disponible o establecido en cero.",
                "severity": "WARNING"
            })
        elif suggested_price < MINIMUM_REASONABLE_SUGGESTED_PRICE_CLP:
            requires_review = True
            flags.append({
                "flag_code": "SUSPICIOUS_LOW_PRICE",
                "description": f"Precio sugerido sospechosamente bajo (${int(suggested_price):,} CLP < $2.000).",
                "severity": "CRITICAL"
            })

        # 2. Costo del proveedor superior o igual al precio sugerido (Margen negativo o nulo)
        if suggested_price is not None and suggested_price > 0:
            if supplier_price_min >= suggested_price:
                requires_review = True
                flags.append({
                    "flag_code": "NEGATIVE_OR_ZERO_MARGIN",
                    "description": (
                        f"Costo del proveedor (${int(supplier_price_min):,} CLP) "
                        f"supera o iguala al precio sugerido (${int(suggested_price):,} CLP)."
                    ),
                    "severity": "CRITICAL"
                })

        # 3. Costo de proveedor inválido o menor a cero
        if supplier_price_min <= 0:
            requires_review = True
            flags.append({
                "flag_code": "INVALID_SUPPLIER_COST",
                "description": "Costo de adquisición de proveedor es cero o negativo.",
                "severity": "CRITICAL"
            })

        # 4. Stock negativo
        if stock < 0:
            requires_review = True
            flags.append({
                "flag_code": "INVALID_STOCK_VALUE",
                "description": f"Inventario reportado con valor negativo ({stock}).",
                "severity": "WARNING"
            })

        # Cálculos de rentabilidad preliminar
        gross_profit = None
        gross_margin = None
        if suggested_price is not None and suggested_price > 0 and supplier_price_min > 0:
            gross_profit = suggested_price - supplier_price_min
            gross_margin = (gross_profit / suggested_price) * 100.0

        return {
            "id": f"dropi_{product_id}",
            "dropi_id": product_id,
            "supplier_id": f"dropi_sup_{supplier_id_raw}",
            "supplier_name": supplier_name,
            "name": name,
            "category": category_name,
            "supplier_price_min": supplier_price_min,
            "supplier_price_max": supplier_price_max,
            "suggested_price": suggested_price,
            "stock": stock,
            "city": city,
            "is_verified": is_verified,
            "is_premium": is_premium,
            "has_variants": has_variants,
            "image_url": image_url,
            "product_url": product_url,
            "status": raw.get("status") or "ACTIVO",
            "requires_review": requires_review,
            "variants": variants_list,
            "flags": flags,
            "gross_profit_preliminary": gross_profit,
            "gross_margin_preliminary": gross_margin
        }


# ==============================================================================
# ENTRADA DE LÍNEA DE COMANDOS (CLI)
# ==============================================================================

def main():
    parser = argparse.ArgumentParser(description="Importador de Catálogo Dropi Chile para CrisCodev")
    parser.add_argument("--category", type=str, default="Tecnología", help="Categoría a filtrar")
    parser.add_argument("--min-price", type=float, default=0.0, help="Precio mínimo proveedor (CLP)")
    parser.add_argument("--max-price", type=float, default=50000.0, help="Precio máximo proveedor (CLP)")
    parser.add_argument("--min-stock", type=int, default=0, help="Stock mínimo requerido")
    parser.add_argument("--city", type=str, default=None, help="Ciudad del proveedor")
    parser.add_argument("--limit", type=int, default=50, help="Cantidad máxima de productos a importar (lote inicial)")
    parser.add_argument("--token", type=str, default=None, help="Token Dropi de autorización")
    parser.add_argument("--test-connection", action="store_true", help="Comprueba la validez de la conexión")
    parser.add_argument("--json", action="store_true", help="Salida en formato JSON estricto")

    args = parser.parse_args()

    importer = DropiImporter(token=args.token)

    if args.test_connection:
        ok, msg, data = importer.test_connection()
        output = {"success": ok, "message": msg, "data": data}
        print(json.dumps(output, ensure_ascii=False, indent=2))
        sys.exit(0 if ok else 1)

    result = importer.fetch_products(
        category=args.category,
        min_price=args.min_price,
        max_price=args.max_price,
        min_stock=args.min_stock,
        city=args.city,
        max_products=args.limit
    )

    print(json.dumps(result, ensure_ascii=False, indent=2))
    sys.exit(0 if result.get("status") == "COMPLETED" else 1)


if __name__ == "__main__":
    main()
