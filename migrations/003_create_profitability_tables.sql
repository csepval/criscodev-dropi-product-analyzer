-- ==============================================================================
-- Migración 003: Tablas para Motor de Rentabilidad, Costos e IVA por Zona
-- Proyecto: CrisCodev Dropi Product Analyzer
-- Etapa 2: Motor financiero, perfiles, evaluaciones y simulaciones
-- ==============================================================================

-- 1. Tabla de Perfiles Financieros y Escenarios de Análisis
CREATE TABLE IF NOT EXISTS dropi_financial_profiles (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT false,
    is_default BOOLEAN NOT NULL DEFAULT false,
    vat_sales_rate NUMERIC(6, 4) NOT NULL DEFAULT 0.1900,         -- 19%
    target_margin_pct NUMERIC(6, 2) NOT NULL DEFAULT 25.00,       -- 25%
    min_acceptable_margin_pct NUMERIC(6, 2) NOT NULL DEFAULT 15.00, -- 15%
    estimated_ad_cost NUMERIC(14, 2) NOT NULL DEFAULT 3000.00,   -- $3.000 CLP
    payment_fee_pct NUMERIC(6, 4) NOT NULL DEFAULT 0.0300,        -- 3%
    payment_fee_fixed NUMERIC(14, 2) NOT NULL DEFAULT 0.00,       -- $0 CLP
    return_reserve_pct NUMERIC(6, 4) NOT NULL DEFAULT 0.0200,     -- 2%
    other_variable_costs NUMERIC(14, 2) NOT NULL DEFAULT 0.00,    -- $0 CLP
    currency VARCHAR(10) NOT NULL DEFAULT 'CLP',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dropi_fin_profiles_active ON dropi_financial_profiles(is_active);

-- 2. Tabla Consolidada de Rentabilidad por Producto
CREATE TABLE IF NOT EXISTS dropi_product_profitability (
    id VARCHAR(64) PRIMARY KEY,
    product_id VARCHAR(64) NOT NULL REFERENCES dropi_products(id) ON DELETE CASCADE,
    profile_id VARCHAR(64) NOT NULL REFERENCES dropi_financial_profiles(id) ON DELETE RESTRICT,
    tax_treatment VARCHAR(50) NOT NULL DEFAULT 'TAX_CREDIT_APPLICABLE',
    sale_price NUMERIC(14, 2) NOT NULL,
    min_profitable_price NUMERIC(14, 2),
    recommended_price NUMERIC(14, 2),
    best_margin_pct NUMERIC(6, 2),
    worst_margin_pct NUMERIC(6, 2),
    avg_margin_pct NUMERIC(6, 2),
    best_zone_name VARCHAR(150),
    worst_zone_name VARCHAR(150),
    profitable_zones_count INT NOT NULL DEFAULT 0,
    insufficient_zones_count INT NOT NULL DEFAULT 0,
    unevaluable_zones_count INT NOT NULL DEFAULT 0,
    total_zones_count INT NOT NULL DEFAULT 0,
    evaluable_coverage_pct NUMERIC(6, 2) NOT NULL DEFAULT 0.00,
    classification VARCHAR(50) NOT NULL DEFAULT 'INCOMPLETE', -- 'ATTRACTIVE', 'MODERATE', 'LOW', 'LOSS', 'INCOMPLETE'
    flags JSONB DEFAULT '[]'::jsonb,
    snapshot_data JSONB,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dropi_prof_prod ON dropi_product_profitability(product_id);
CREATE INDEX IF NOT EXISTS idx_dropi_prof_class ON dropi_product_profitability(classification);
CREATE INDEX IF NOT EXISTS idx_dropi_prof_avg ON dropi_product_profitability(avg_margin_pct);

-- 3. Tabla de Rentabilidad Desglosada por Zona de Despacho
CREATE TABLE IF NOT EXISTS dropi_product_zone_profitability (
    id VARCHAR(64) PRIMARY KEY,
    profitability_id VARCHAR(64) NOT NULL REFERENCES dropi_product_profitability(id) ON DELETE CASCADE,
    product_id VARCHAR(64) NOT NULL REFERENCES dropi_products(id) ON DELETE CASCADE,
    zone_id VARCHAR(64) NOT NULL REFERENCES shipping_zones(id) ON DELETE CASCADE,
    sale_price NUMERIC(14, 2) NOT NULL,
    shipping_charged NUMERIC(14, 2),
    shipping_cost NUMERIC(14, 2),
    total_charged NUMERIC(14, 2),
    net_revenue NUMERIC(14, 2),
    effective_provider_cost NUMERIC(14, 2),
    effective_shipping_cost NUMERIC(14, 2),
    payment_fee NUMERIC(14, 2),
    ad_cost NUMERIC(14, 2),
    return_reserve NUMERIC(14, 2),
    total_effective_costs NUMERIC(14, 2),
    estimated_profit NUMERIC(14, 2),
    margin_pct NUMERIC(6, 2),
    status VARCHAR(50) NOT NULL,
    is_evaluable BOOLEAN NOT NULL DEFAULT true,
    requires_quote BOOLEAN NOT NULL DEFAULT false,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dropi_zone_prof_zone ON dropi_product_zone_profitability(zone_id);
CREATE INDEX IF NOT EXISTS idx_dropi_zone_prof_prod ON dropi_product_zone_profitability(product_id);

-- 4. Bitácora de Ejecuciones Masivas de Rentabilidad (Profitability Runs)
CREATE TABLE IF NOT EXISTS dropi_profitability_runs (
    id VARCHAR(64) PRIMARY KEY,
    profile_id VARCHAR(64) NOT NULL,
    zone_id VARCHAR(64), -- NULL si evaluó todas las zonas
    total_evaluated INT NOT NULL DEFAULT 0,
    attractive_count INT NOT NULL DEFAULT 0,
    moderate_count INT NOT NULL DEFAULT 0,
    low_count INT NOT NULL DEFAULT 0,
    loss_count INT NOT NULL DEFAULT 0,
    incomplete_count INT NOT NULL DEFAULT 0,
    duration_ms INT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dropi_runs_date ON dropi_profitability_runs(started_at);

-- 5. Tabla de Simulaciones Interactivas Guardadas
CREATE TABLE IF NOT EXISTS dropi_profitability_simulations (
    id VARCHAR(64) PRIMARY KEY,
    product_id VARCHAR(64) NOT NULL REFERENCES dropi_products(id) ON DELETE CASCADE,
    variant_id VARCHAR(64),
    zone_id VARCHAR(64),
    profile_id VARCHAR(64),
    simulation_name VARCHAR(150) NOT NULL,
    input_params JSONB NOT NULL,
    results_data JSONB NOT NULL,
    created_by VARCHAR(100) NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dropi_sim_prod ON dropi_profitability_simulations(product_id);
