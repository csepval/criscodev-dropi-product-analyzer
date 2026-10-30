// src/services/aiConfigService.ts
// Servicio de configuración centralizada para Administración IA (motor ChatGPT / Copilot y plantillas de prompts)

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const AI_CONFIG_FILE = path.join(DATA_DIR, 'ai_config.json');

export type AIProviderType = 'chatgpt' | 'copilot';

export interface AIConfiguration {
  provider: AIProviderType;
  analysis_prompt_template: string;
  market_prices_prompt_template: string;
  updated_at: string;
}

export const DEFAULT_ANALYSIS_PROMPT_TEMPLATE =
  'Para el producto XXXXXXX, analiza la demanda, competencia, margen estimado.';

export const DEFAULT_MARKET_PRICES_PROMPT_TEMPLATE =
  'Busca un máximo de 10 tiendas en Chile donde esté disponible el producto XXXXXXX, y muestra únicamente los datos: nombre de la tienda, link y precio, ordenados de menor a mayor. Siempre incluye las tiendas: Falabella, Lider, Ripley, Mercado Libre, y el resto, tiendas donde encuentres el producto.';

function ensureDataDirExists(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getDefaultAIConfig(): AIConfiguration {
  return {
    provider: 'chatgpt',
    analysis_prompt_template: DEFAULT_ANALYSIS_PROMPT_TEMPLATE,
    market_prices_prompt_template: DEFAULT_MARKET_PRICES_PROMPT_TEMPLATE,
    updated_at: new Date().toISOString(),
  };
}

/**
 * Obtiene la configuración activa de Administración IA desde disco (o valores por defecto).
 */
export function getAIConfig(): AIConfiguration {
  try {
    ensureDataDirExists();
    if (!fs.existsSync(AI_CONFIG_FILE)) {
      const defaultConfig = getDefaultAIConfig();
      fs.writeFileSync(AI_CONFIG_FILE, JSON.stringify(defaultConfig, null, 2), 'utf-8');
      return defaultConfig;
    }

    const raw = fs.readFileSync(AI_CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);

    const provider: AIProviderType =
      parsed.provider === 'copilot' || parsed.provider === 'chatgpt'
        ? parsed.provider
        : 'chatgpt';

    const analysisPrompt =
      typeof parsed.analysis_prompt_template === 'string' &&
      parsed.analysis_prompt_template.trim().length > 0
        ? parsed.analysis_prompt_template.trim()
        : DEFAULT_ANALYSIS_PROMPT_TEMPLATE;

    const marketPricesPrompt =
      typeof parsed.market_prices_prompt_template === 'string' &&
      parsed.market_prices_prompt_template.trim().length > 0
        ? parsed.market_prices_prompt_template.trim()
        : DEFAULT_MARKET_PRICES_PROMPT_TEMPLATE;

    return {
      provider,
      analysis_prompt_template: analysisPrompt,
      market_prices_prompt_template: marketPricesPrompt,
      updated_at: parsed.updated_at || new Date().toISOString(),
    };
  } catch {
    return getDefaultAIConfig();
  }
}

/**
 * Guarda la configuración de Administración IA seleccionada por el usuario.
 */
export function saveAIConfig(input: Partial<AIConfiguration>): AIConfiguration {
  ensureDataDirExists();
  const current = getAIConfig();

  const updatedProvider: AIProviderType =
    input.provider === 'copilot' || input.provider === 'chatgpt'
      ? input.provider
      : current.provider;

  const updatedAnalysisPrompt =
    typeof input.analysis_prompt_template === 'string' &&
    input.analysis_prompt_template.trim().length > 0
      ? input.analysis_prompt_template.trim()
      : current.analysis_prompt_template;

  const updatedMarketPricesPrompt =
    typeof input.market_prices_prompt_template === 'string' &&
    input.market_prices_prompt_template.trim().length > 0
      ? input.market_prices_prompt_template.trim()
      : current.market_prices_prompt_template;

  const newConfig: AIConfiguration = {
    provider: updatedProvider,
    analysis_prompt_template: updatedAnalysisPrompt,
    market_prices_prompt_template: updatedMarketPricesPrompt,
    updated_at: new Date().toISOString(),
  };

  fs.writeFileSync(AI_CONFIG_FILE, JSON.stringify(newConfig, null, 2), 'utf-8');
  return newConfig;
}

/**
 * Reemplaza el marcador XXXXXXX (o {producto}) por el nombre real del producto en la plantilla del prompt.
 */
export function interpolateProductPrompt(template: string, productName: string): string {
  const cleanProduct = (productName || '').trim();
  const cleanTemplate = (template || '').trim();

  if (/XXXXXXX/i.test(cleanTemplate)) {
    return cleanTemplate.replace(/XXXXXXX/gi, cleanProduct);
  }
  if (/\{producto\}/i.test(cleanTemplate)) {
    return cleanTemplate.replace(/\{producto\}/gi, cleanProduct);
  }
  return `${cleanTemplate} (${cleanProduct})`;
}

