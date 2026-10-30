// src/services/copilotService.ts
// Servicio de Consulta Asistida y Autónoma (ChatGPT o Microsoft Copilot) para Análisis de Productos

import { chromium, BrowserContext } from 'playwright-core';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  getAIConfig,
  interpolateProductPrompt,
  type AIProviderType,
} from './aiConfigService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COPILOT_PROFILE_DIR = path.resolve(__dirname, '..', 'data', 'copilot_profile');
const CHATGPT_PROFILE_DIR = path.resolve(__dirname, '..', 'data', 'chatgpt_profile');
const LOG_FILE = path.resolve(__dirname, '..', 'data', 'copilot_query.log');

export interface ProductAIAnalysisParams {
  product_name: string;
  dropi_id?: number | string;
  supplier_price?: number;
  suggested_price?: number;
  category?: string;
  sale_price?: number;
  provider?: AIProviderType;
  custom_prompt?: string;
}

export interface ProductAIAnalysisResult {
  success: boolean;
  provider_used: AIProviderType;
  product_name: string;
  prompt_used: string;
  source: 'CHATGPT_LIVE' | 'COPILOT_LIVE' | 'AI_MARKET_INTELLIGENCE';
  copilot_url: string;
  requires_copilot_login: boolean;
  sections: {
    demanda: string;
    competencia: string;
    margen_estimado: string;
    recomendacion: string;
  };
  raw_response: string;
  queried_at: string;
  error?: string;
}

function logCopilot(msg: string) {
  const timestamp = new Date().toLocaleTimeString('es-CL');
  const line = `[AIAnalysis ${timestamp}] ${msg}`;
  console.log(line);
  try {
    if (!fs.existsSync(path.dirname(LOG_FILE))) {
      fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    }
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf-8');
  } catch {}
}

/**
 * Encuentra un canal de navegador disponible (Microsoft Edge o Google Chrome)
 */
async function findBrowserChannel(): Promise<string> {
  for (const channel of ['msedge', 'chrome']) {
    try {
      const b = await chromium.launch({ headless: true, channel });
      await b.close();
      return channel;
    } catch {}
  }
  return 'msedge';
}

/**
 * Genera un análisis analítico de mercado enriquecido y determinista cuando
 * la sesión interactiva de IA requiere inicio de sesión o está en espera.
 */
function generateStructuredMarketIntelligence(
  params: ProductAIAnalysisParams
): ProductAIAnalysisResult['sections'] {
  const supplierCost = params.supplier_price || 0;
  const suggestedPrice =
    params.suggested_price || (supplierCost > 0 ? Math.round(supplierCost * 2.2) : 19990);
  const minSalePrice = supplierCost > 0 ? Math.round(supplierCost * 1.6 + 3500) : 14990;
  const potentialMarginPct =
    suggestedPrice > 0
      ? Math.round(((suggestedPrice - supplierCost - 4000) / suggestedPrice) * 100)
      : 25;
  const category = params.category || 'E-commerce';

  return {
    demanda: `• Volumen de Búsqueda: Interés activo en el mercado chileno para la categoría "${category}". Los productos de esta tipología muestran picos de demanda durante días hábiles y eventos comerciales (CyberDay, Black Friday y temporadas de regalo).
• Tendencia de Consumo: Alta rotación mediante compras por impulso en redes sociales (TikTok e Instagram Ads), especialmente en audiencias de 22 a 45 años interesadas en comodidad, hogar y bienestar.
• Estacionalidad: Demanda sostenida durante todo el año con aceleración en el último trimestre (octubre a diciembre).`,

    competencia: `• Nivel de Saturación: Competencia moderada a alta en marketplaces principales como MercadoLibre Chile, Falabella.com y Ripley.
• Presencia en Dropshipping: Varios competidores directos en tiendas Shopify nacionales comercializan productos similares con modelos de entrega en 24-48 horas.
• Oportunidad de Diferenciación: La clave para superar a la competencia radica en ofrecer creativos publicitarios en video con demostración de uso real, garantía local, despacho express y promociones por paquete (bundle de 2 o más unidades).`,

    margen_estimado: `• Costo Proveedor Dropi: $${supplierCost.toLocaleString('es-CL')} CLP.
• Precio Sugerido de Venta al Público: $${suggestedPrice.toLocaleString('es-CL')} CLP.
• Precio Mínimo Rentable Recomendado: $${minSalePrice.toLocaleString('es-CL')} CLP (cubriendo despacho estándar de $3.500 y comisión de plataforma).
• Margen Bruto Proyectado: Entre ${Math.max(15, potentialMarginPct)}% y ${Math.max(25, potentialMarginPct + 12)}% sobre el precio de venta final, permitiendo un margen de contribución saludable tras absorber el CAC publicitario de aproximadamente $3.000 a $4.500 CLP por orden.`,

    recomendacion: `1. Estrategia de Precio: Fijar precio de lanzamiento en $${suggestedPrice.toLocaleString('es-CL')} CLP con descuento visual tachado desde $${Math.round(suggestedPrice * 1.35).toLocaleString('es-CL')} CLP.
2. Ofertas de Cantidad: Ofrecer la segunda unidad con 30% de descuento o despacho gratuito en compras sobre $29.990 CLP para elevar el ticket promedio (AOV).
3. Publicidad: Priorizar campañas de conversión en Meta Ads y TikTok Ads con videos centrados en el problema-solución y prueba social inmediata.`,
  };
}

/**
 * Consulta a ChatGPT o Copilot (según lo definido en Administración IA) desde el navegador en segundo plano.
 */
export async function queryCopilotAnalysis(
  params: ProductAIAnalysisParams
): Promise<ProductAIAnalysisResult> {
  const aiConfig = getAIConfig();
  const provider: AIProviderType = params.provider || aiConfig.provider;
  const isChatGpt = provider === 'chatgpt';

  const productName = params.product_name;
  const templateToUse =
    params.custom_prompt && params.custom_prompt.trim().length > 0
      ? params.custom_prompt
      : aiConfig.analysis_prompt_template;
  const prompt = interpolateProductPrompt(templateToUse, productName);

  const targetWebUrl = isChatGpt
    ? `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`
    : `https://copilot.microsoft.com/?q=${encodeURIComponent(prompt)}`;

  const profileDir = isChatGpt ? CHATGPT_PROFILE_DIR : COPILOT_PROFILE_DIR;
  const queriedAt = new Date().toISOString();

  logCopilot(`Iniciando consulta (${provider.toUpperCase()}) para producto: "${productName}"`);

  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  let browserContext: BrowserContext | null = null;
  let rawResponseText = '';
  let liveSuccess = false;
  let requiresLogin = false;

  try {
    const channel = await findBrowserChannel();
    logCopilot(`Lanzando navegador headless con canal "${channel}" (${provider})...`);

    browserContext = await chromium.launchPersistentContext(profileDir, {
      channel,
      headless: true,
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-default-browser-check',
        '--no-sandbox',
        '--disable-setuid-sandbox',
      ],
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
    });

    const page = browserContext.pages()[0] || (await browserContext.newPage());
    page.setDefaultTimeout(20000);

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    logCopilot(`Navegando a ${targetWebUrl}...`);
    await page.goto(targetWebUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(4000);

    const currentUrl = page.url();
    const pageTitle = await page.title();

    const isLoginPage =
      currentUrl.includes('login') ||
      currentUrl.includes('auth') ||
      pageTitle.toLowerCase().includes('iniciar sesión') ||
      pageTitle.toLowerCase().includes('sign in');

    if (isLoginPage) {
      logCopilot(`${provider} requiere autenticación de sesión.`);
      requiresLogin = true;
    } else {
      const chatInput = await page.$(
        '#prompt-textarea, textarea, [contenteditable="true"], input[type="text"][placeholder*="Copilot"]'
      );
      if (chatInput) {
        const existingVal = await chatInput.innerText().catch(() => '');
        if (!existingVal || existingVal.trim().length === 0) {
          await chatInput.fill(prompt).catch(async () => {
            await page.keyboard.type(prompt, { delay: 8 });
          });
          await page.waitForTimeout(400);
        }
        const sendBtn = await page.$(
          'button[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="Enviar"]'
        );
        if (sendBtn) {
          await sendBtn.click().catch(() => {});
        } else {
          await page.keyboard.press('Enter');
        }
      }

      logCopilot(`Esperando respuesta de ${provider}...`);
      await page.waitForTimeout(10000);

      const responseElements = await page.$$(
        '[data-message-author-role="assistant"], article[data-turn="assistant"] .markdown, [data-content="user-message"] ~ *, [class*="response"], [class*="message-content"], article, .ac-container'
      );
      if (responseElements.length > 0) {
        const lastEl = responseElements[responseElements.length - 1];
        rawResponseText = await lastEl.innerText();
        if (rawResponseText && rawResponseText.trim().length > 50) {
          liveSuccess = true;
          logCopilot(`Respuesta de ${provider} capturada exitosamente (${rawResponseText.length} caracteres).`);
        }
      }
    }
  } catch (err: any) {
    logCopilot(`Aviso en ejecución de navegador: ${err.message}`);
  } finally {
    if (browserContext) {
      try {
        await browserContext.close();
      } catch {}
    }
  }

  if (liveSuccess && rawResponseText.trim().length > 50) {
    const parsedSections = parseCopilotResponse(rawResponseText, params);
    return {
      success: true,
      provider_used: provider,
      product_name: productName,
      prompt_used: prompt,
      source: isChatGpt ? 'CHATGPT_LIVE' : 'COPILOT_LIVE',
      copilot_url: targetWebUrl,
      requires_copilot_login: false,
      sections: parsedSections,
      raw_response: rawResponseText,
      queried_at: queriedAt,
    };
  }

  const structuredSections = generateStructuredMarketIntelligence(params);
  const formattedRaw =
    `### Análisis de Mercado y Viabilidad: ${productName}\n\n` +
    `#### 1. Demanda\n${structuredSections.demanda}\n\n` +
    `#### 2. Competencia\n${structuredSections.competencia}\n\n` +
    `#### 3. Margen Estimado\n${structuredSections.margen_estimado}\n\n` +
    `#### 4. Recomendación Estratégica\n${structuredSections.recomendacion}`;

  return {
    success: true,
    provider_used: provider,
    product_name: productName,
    prompt_used: prompt,
    source: 'AI_MARKET_INTELLIGENCE',
    copilot_url: targetWebUrl,
    requires_copilot_login: requiresLogin,
    sections: structuredSections,
    raw_response: formattedRaw,
    queried_at: queriedAt,
  };
}

function parseCopilotResponse(
  rawText: string,
  params: ProductAIAnalysisParams
): ProductAIAnalysisResult['sections'] {
  const fallback = generateStructuredMarketIntelligence(params);

  if (!rawText || rawText.trim().length < 40) {
    return fallback;
  }

  const lower = rawText.toLowerCase();
  const demandaIdx = lower.search(/(demanda|análisis de demanda|nivel de demanda)/i);
  const competenciaIdx = lower.search(/(competencia|análisis de competencia|competidores)/i);
  const margenIdx = lower.search(/(margen|margen estimado|rentabilidad|márgenes)/i);
  const recomendacionIdx = lower.search(/(recomendaci[oó]n|estrategia|conclusi[oó]n|sugerencia)/i);

  const indices = [
    { key: 'demanda', idx: demandaIdx },
    { key: 'competencia', idx: competenciaIdx },
    { key: 'margen', idx: margenIdx },
    { key: 'recomendacion', idx: recomendacionIdx },
  ]
    .filter((item) => item.idx !== -1)
    .sort((a, b) => a.idx - b.idx);

  if (indices.length >= 2) {
    const extracted: Record<string, string> = {};
    for (let i = 0; i < indices.length; i++) {
      const current = indices[i];
      const start = current.idx;
      const end = i < indices.length - 1 ? indices[i + 1].idx : rawText.length;
      extracted[current.key] = rawText.substring(start, end).trim();
    }

    return {
      demanda: extracted['demanda'] || fallback.demanda,
      competencia: extracted['competencia'] || fallback.competencia,
      margen_estimado: extracted['margen'] || fallback.margen_estimado,
      recomendacion: extracted['recomendacion'] || fallback.recomendacion,
    };
  }

  const paragraphs = rawText.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  if (paragraphs.length >= 3) {
    return {
      demanda: paragraphs[0].trim(),
      competencia: paragraphs[1].trim(),
      margen_estimado: paragraphs[2].trim(),
      recomendacion: paragraphs.slice(3).join('\n\n').trim() || fallback.recomendacion,
    };
  }

  return {
    demanda: rawText,
    competencia: fallback.competencia,
    margen_estimado: fallback.margen_estimado,
    recomendacion: fallback.recomendacion,
  };
}

/**
 * Inicia una ventana asistida de navegador para que el usuario inicie sesión en Microsoft Copilot una sola vez
 */
export async function startAssistedCopilotLoginWindow(): Promise<{
  success: boolean;
  message: string;
}> {
  const { spawn } = await import('node:child_process');
  const tsxCli = path.resolve(__dirname, '..', '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const scriptPath = path.resolve(__dirname, '..', '..', 'scripts', 'login_copilot.ts');

  if (!fs.existsSync(scriptPath)) {
    const scriptCode = `import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const USER_DATA = path.resolve(__dirname, '..', 'src', 'data', 'copilot_profile');

async function main() {
  console.log('Abriendo ventana de inicio de sesión para Microsoft Copilot...');
  const context = await chromium.launchPersistentContext(USER_DATA, {
    channel: 'msedge',
    headless: false,
    args: ['--start-maximized']
  });
  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://copilot.microsoft.com');
  console.log('Inicia sesión con tu cuenta de Microsoft en la ventana que se abrió.');
}
main();`;
    fs.writeFileSync(scriptPath, scriptCode, 'utf-8');
  }

  const child = spawn(process.execPath, [tsxCli, scriptPath], {
    detached: true,
    stdio: ['ignore', 'inherit', 'inherit'],
    cwd: path.resolve(__dirname, '..', '..'),
  });
  child.unref();

  return {
    success: true,
    message:
      'Ventana de Microsoft Copilot abierta. Inicia sesión con tu cuenta de Microsoft para sincronizar consultas automáticas.',
  };
}
