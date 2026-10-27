-- ==============================================================================
-- Migración 003: Creación de tablas para CrisCodev Dropi Product Analyzer
-- Autor: CrisCodev
-- Fecha: 2026-10-22
-- Descripción: Catálogo, proveedores, variantes, histórico, bitácora de importación,
--              alertas de calidad y scoring comercial de Dropi Chile.
-- ==============================================================================

-- 1. Tabla de Proveedores de Dropi
CREATE TABLE IF NOT EXISTS dropi_suppliers (
    id VARCHAR(64) PRIMARY KEY,
    dropi_user_id BIGINT UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    is_premium BOOLEAN NOT NULL DEFAULT false,
    city VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dropi_suppliers_name ON dropi_suppliers(name);
CREATE INDEX IF NOT EXISTS idx_dropi_suppliers_badges ON dropi_suppliers(is_verified, is_premium);

-- 2. Tabla Principal de Productos de Dropi
CREATE TABLE IF NOT EXISTS dropi_products (
    id VARCHAR(64) PRIMARY KEY,
    dropi_id BIGINT UNIQUE NOT NULL,
    supplier_id VARCHAR(64) REFERENCES dropi_suppliers(id) ON DELETE SET NULL,
    supplier_name VARCHAR(255) NOT NULL,
    name VARCHAR(500) NOT NULL,
    category VARCHAR(150) NOT NULL,
    supplier_price_min NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    supplier_price_max NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    suggested_price NUMERIC(14, 2) DEFAULT NULL,
    stock INT NOT NULL DEFAULT 0,
    city VARCHAR(100) DEFAULT NULL,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    is_premium BOOLEAN NOT NULL DEFAULT false,
    has_variants BOOLEAN NOT NULL DEFAULT false,
    image_url TEXT DEFAULT NULL,
    product_url TEXT DEFAULT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVO',
    requires_review BOOLEAN NOT NULL DEFAULT false,
    imported_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_checked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dropi_products_dropi_id ON dropi_products(dropi_id);
CREATE INDEX IF NOT EXISTS idx_dropi_products_category ON dropi_products(category);
CREATE INDEX IF NOT EXISTS idx_dropi_products_supplier_id ON dropi_products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_dropi_products_price ON dropi_products(supplier_price_min, supplier_price_max);
CREATE INDEX IF NOT EXISTS idx_dropi_products_stock ON dropi_products(stock);
CREATE INDEX IF NOT EXISTS idx_dropi_products_review ON dropi_products(requires_review);
CREATE INDEX IF NOT EXISTS idx_dropi_products_badges ON dropi_products(is_verified, is_premium);

-- 3. Tabla de Variantes de Productos
CREATE TABLE IF NOT EXISTS dropi_product_variants (
    id VARCHAR(64) PRIMARY KEY,
    product_id VARCHAR(64) NOT NULL REFERENCES dropi_products(id) ON DELETE CASCADE,
    dropi_variant_id BIGINT NOT NULL,
    sku VARCHAR(100) DEFAULT NULL,
    variation_name VARCHAR(255) NOT NULL,
    supplier_price NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    suggested_price NUMERIC(14, 2) DEFAULT NULL,
    stock INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_dropi_variant UNIQUE (product_id, dropi_variant_id)
);

CREATE INDEX IF NOT EXISTS idx_dropi_variants_product_id ON dropi_product_variants(product_id);

-- 4. Historial de Observaciones y Cambios
CREATE TABLE IF NOT EXISTS dropi_product_history (
    id BIGSERIAL PRIMARY KEY,
    product_id VARCHAR(64) NOT NULL REFERENCES dropi_products(id) ON DELETE CASCADE,
    supplier_price_min NUMERIC(14, 2),
    supplier_price_max NUMERIC(14, 2),
    suggested_price NUMERIC(14, 2),
    stock INT,
    stock_delta INT NOT NULL DEFAULT 0,
    status VARCHAR(50),
    is_change BOOLEAN NOT NULL DEFAULT true,
    observed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dropi_history_product_id ON dropi_product_history(product_id);
CREATE INDEX IF NOT EXISTS idx_dropi_history_observed_at ON dropi_product_history(observed_at);
CREATE INDEX IF NOT EXISTS idx_dropi_history_is_change ON dropi_product_history(is_change);

-- 5. Bitácora de Trabajos de Importación (Import Jobs)
CREATE TABLE IF NOT EXISTS dropi_import_jobs (
    id VARCHAR(64) PRIMARY KEY,
    job_type VARCHAR(50) NOT NULL DEFAULT 'API_MANUAL',
    filters_used JSONB,
    total_fetched INT NOT NULL DEFAULT 0,
    total_inserted INT NOT NULL DEFAULT 0,
    total_updated INT NOT NULL DEFAULT 0,
    total_flagged INT NOT NULL DEFAULT 0,
    total_errors INT NOT NULL DEFAULT 0,
    duration_ms INT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'RUNNING',
    diagnostic_message TEXT DEFAULT NULL,
    error_message TEXT DEFAULT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMPTZ DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_dropi_import_jobs_started_at ON dropi_import_jobs(started_at);
CREATE INDEX IF NOT EXISTS idx_dropi_import_jobs_status ON dropi_import_jobs(status);

-- 6. Alertas y Banderas de Calidad de Datos (Flags)
CREATE TABLE IF NOT EXISTS dropi_product_flags (
    id BIGSERIAL PRIMARY KEY,
    product_id VARCHAR(64) NOT NULL REFERENCES dropi_products(id) ON DELETE CASCADE,
    flag_code VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'WARNING',
    resolved BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dropi_flags_product_id ON dropi_product_flags(product_id);
CREATE INDEX IF NOT EXISTS idx_dropi_flags_code ON dropi_product_flags(flag_code);
CREATE INDEX IF NOT EXISTS idx_dropi_flags_resolved ON dropi_product_flags(resolved);

-- 7. Puntuaciones y Evaluación Comercial (Scores - Preparación Fase 5)
CREATE TABLE IF NOT EXISTS dropi_product_scores (
    id VARCHAR(64) PRIMARY KEY,
    product_id VARCHAR(64) NOT NULL REFERENCES dropi_products(id) ON DELETE CASCADE,
    score_total NUMERIC(5, 2) DEFAULT NULL,
    evaluable_points NUMERIC(5, 2) DEFAULT NULL,
    data_coverage_pct NUMERIC(5, 2) DEFAULT NULL,
    classification VARCHAR(50) NOT NULL DEFAULT 'INCOMPLETE',
    confidence_level VARCHAR(20) NOT NULL DEFAULT 'LOW',
    gross_profit NUMERIC(14, 2) DEFAULT NULL,
    gross_margin_pct NUMERIC(6, 2) DEFAULT NULL,
    score_breakdown JSONB DEFAULT NULL,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dropi_scores_product_id ON dropi_product_scores(product_id);
CREATE INDEX IF NOT EXISTS idx_dropi_scores_classification ON dropi_product_scores(classification);

-- 8. Configuración de Conexión y Sesión Local de Dropi (almacenamiento seguro en DB)
CREATE TABLE IF NOT EXISTS dropi_connection_config (
    id VARCHAR(32) PRIMARY KEY DEFAULT 'default',
    auth_mode VARCHAR(50) NOT NULL DEFAULT 'TOKEN', -- 'TOKEN', 'BEARER_SESSION', 'PLAYWRIGHT_PROFILE'
    masked_token VARCHAR(50) DEFAULT NULL,
    encrypted_token TEXT DEFAULT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'DISCONNECTED', -- 'CONNECTED', 'DISCONNECTED', 'EXPIRED'
    last_verified_at TIMESTAMPTZ DEFAULT NULL,
    expires_at TIMESTAMPTZ DEFAULT NULL,
    user_data JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
