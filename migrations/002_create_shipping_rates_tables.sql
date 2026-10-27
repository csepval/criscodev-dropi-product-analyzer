-- ==============================================================================
-- Migración 002: Tablas de Tarifas y Zonas de Despacho Estándar de Chile
-- Proyecto: CrisCodev Dropi Product Analyzer
-- Etapa 1: Configuración y administración de despachos estándar por zona
-- ==============================================================================

-- 1. Tabla de Zonas de Despacho
CREATE TABLE IF NOT EXISTS shipping_zones (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    description TEXT DEFAULT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- 'ACTIVE', 'INACTIVE'
    requires_quote BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shipping_zones_status ON shipping_zones(status);
CREATE INDEX IF NOT EXISTS idx_shipping_zones_name ON shipping_zones(name);

-- 2. Tabla de Asociación de Comunas por Zona (1 Comuna -> Máximo 1 Zona de Despacho)
CREATE TABLE IF NOT EXISTS shipping_zone_communes (
    id BIGSERIAL PRIMARY KEY,
    zone_id VARCHAR(64) NOT NULL REFERENCES shipping_zones(id) ON DELETE CASCADE,
    region_code VARCHAR(10) NOT NULL,
    commune_code VARCHAR(10) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_shipping_zone_commune UNIQUE (commune_code)
);

CREATE INDEX IF NOT EXISTS idx_shipping_communes_zone ON shipping_zone_communes(zone_id);
CREATE INDEX IF NOT EXISTS idx_shipping_communes_region ON shipping_zone_communes(region_code);
CREATE INDEX IF NOT EXISTS idx_shipping_communes_code ON shipping_zone_communes(commune_code);

-- 3. Tabla de Tarifas Financieras por Zona
CREATE TABLE IF NOT EXISTS shipping_zone_rates (
    id VARCHAR(64) PRIMARY KEY,
    zone_id VARCHAR(64) NOT NULL REFERENCES shipping_zones(id) ON DELETE CASCADE,
    customer_shipping_price NUMERIC(14, 2) DEFAULT NULL,
    estimated_dropi_cost NUMERIC(14, 2) DEFAULT NULL,
    customer_price_includes_vat BOOLEAN NOT NULL DEFAULT true,
    estimated_cost_includes_vat BOOLEAN NOT NULL DEFAULT true,
    valid_from TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMPTZ DEFAULT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    origin VARCHAR(50) NOT NULL DEFAULT 'MANUAL', -- 'MANUAL', 'REFERENCIA', 'HISTORICO'
    notes TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_shipping_rate_validity CHECK (valid_until IS NULL OR valid_until >= valid_from),
    CONSTRAINT chk_shipping_rate_prices CHECK (
        (customer_shipping_price IS NULL OR customer_shipping_price >= 0) AND
        (estimated_dropi_cost IS NULL OR estimated_dropi_cost >= 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_shipping_rates_zone ON shipping_zone_rates(zone_id);
CREATE INDEX IF NOT EXISTS idx_shipping_rates_active ON shipping_zone_rates(is_active);
CREATE INDEX IF NOT EXISTS idx_shipping_rates_dates ON shipping_zone_rates(valid_from, valid_until);

-- Garantiza que solo exista una tarifa activa vigente por cada zona
CREATE UNIQUE INDEX IF NOT EXISTS uq_active_shipping_rate_per_zone 
ON shipping_zone_rates(zone_id) 
WHERE is_active = true;

-- 4. Tabla de Auditoría y Trazabilidad Histórica de Tarifas y Zonas
CREATE TABLE IF NOT EXISTS shipping_rate_audit (
    id BIGSERIAL PRIMARY KEY,
    rate_id VARCHAR(64) REFERENCES shipping_zone_rates(id) ON DELETE SET NULL,
    zone_id VARCHAR(64) REFERENCES shipping_zones(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- 'CREATE_ZONE', 'UPDATE_RATE', 'ACTIVATE', 'DEACTIVATE', 'ASSIGN_COMMUNES', 'UNASSIGN_COMMUNES', 'DELETE_ZONE'
    previous_values JSONB DEFAULT NULL,
    new_values JSONB DEFAULT NULL,
    changed_by VARCHAR(100) NOT NULL DEFAULT 'admin',
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_shipping_audit_zone ON shipping_rate_audit(zone_id);
CREATE INDEX IF NOT EXISTS idx_shipping_audit_rate ON shipping_rate_audit(rate_id);
CREATE INDEX IF NOT EXISTS idx_shipping_audit_date ON shipping_rate_audit(changed_at);
