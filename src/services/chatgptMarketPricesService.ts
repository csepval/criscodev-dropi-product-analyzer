// src/services/chatgptMarketPricesService.ts
// Servicio de consulta automática de precios de mercado en Chile usando la sesión web de ChatGPT o Copilot (Playwright)

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';
import {
  getAIConfig,
  interpolateProductPrompt,
  type AIProviderType,
} from './aiConfigService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(__dirname, '..', 'data');
const CHATGPT_PROFILE_DIR = path.join(DATA_DIR, 'chatgpt_profile');
const COPILOT_PROFILE_DIR = path.join(DATA_DIR, 'copilot_profile');
const CHATGPT_CACHE_FILE = path.join(DATA_DIR, 'chatgpt_market_prices_cache.json');

export interface MarketPriceQueryInput {
  product_name: string;
  dropi_id?: number | string;
  supplier_price?: number;
  suggested_price?: number;
  sale_price?: number;
  provider?: AIProviderType;
  custom_prompt?: string;
}

export interface StorePriceItem {
  tienda: string;
  link: string;
  precio: string;
  precio_numerico: number | null;
  es_tienda_obligatoria: boolean;
}

export interface MarketPricesQueryResult {
  success: boolean;
  provider_used: AIProviderType;
  source: 'CHATGPT_LIVE' | 'COPILOT_LIVE' | 'CACHE' | 'REQUIERE_SESION_IA';
  product_name: string;
  prompt_used: string;
  chatgpt_url: string;
  items: StorePriceItem[];
  raw_response: string;
  QueriedAt: string;
  warning?: string;
}

const REQUIRED_STORES = ['Falabella', 'Lider', 'Ripley', 'Mercado Libre'];

function ensureDirectoriesExist(): void {
  for (const dir of [DATA_DIR, CHATGPT_PROFILE_DIR, COPILOT_PROFILE_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Construye el prompt de precios de mercado usando la plantilla configurada en Administración IA.
 */
export function buildMarketPricesPrompt(
  productName: string,
  customTemplate?: string
): string {
  const aiConfig = getAIConfig();
  const templateToUse =
    customTemplate && customTemplate.trim().length > 0
      ? customTemplate
      : aiConfig.market_prices_prompt_template;
  return interpolateProductPrompt(templateToUse, productName);
}

/**
 * Formatea un número en pesos chilenos (CLP), ej: $19.990
 */
function formatClp(amount: number): string {
  return '$' + Math.round(amount).toLocaleString('es-CL');
}

/**
 * Genera un link de búsqueda en la tienda chilena correspondiente como respaldo si la línea no trae URL explícita.
 */
function buildFallbackStoreLink(storeName: string, productName: string): string {
  const encodedProduct = encodeURIComponent(productName.trim());
  const lower = storeName.toLowerCase();

  if (lower.includes('falabella')) {
    return `https://www.falabella.com/falabella-cl/search?Ntt=${encodedProduct}`;
  }
  if (lower.includes('lider')) {
    return `https://www.lider.cl/supermercado/search?query=${encodedProduct}`;
  }
  if (lower.includes('ripley')) {
    return `https://simple.ripley.cl/search/${encodedProduct}`;
  }
  if (lower.includes('mercado libre') || lower.includes('mercadolibre')) {
    const slug = productName.trim().replace(/\s+/g, '-');
    return `https://listado.mercadolibre.cl/${encodeURIComponent(slug)}`;
  }
  if (lower.includes('paris')) {
    return `https://www.paris.cl/search?q=${encodedProduct}`;
  }
  if (lower.includes('sodimac')) {
    return `https://www.sodimac.cl/sodimac-cl/search?Ntt=${encodedProduct}`;
  }
  if (lower.includes('la polar')) {
    return `https://www.abc.cl/search?q=${encodedProduct}`;
  }
  if (lower.includes('hites')) {
    return `https://www.hites.com/buscar?q=${encodedProduct}`;
  }
  if (lower.includes('pcfactory') || lower.includes('pc factory')) {
    return `https://www.pcfactory.cl/buscar?valor=${encodedProduct}`;
  }

  return `https://www.google.cl/search?q=${encodeURIComponent(storeName + ' Chile ' + productName)}`;
}

/**
 * Extrae una URL válida desde un fragmento de texto (soporta Markdown [texto](url) o URL directa).
 */
function extractUrlFromText(text: string): string | null {
  if (!text) return null;

  const markdownLinkMatch = text.match(/\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/i);
  if (markdownLinkMatch && markdownLinkMatch[1]) {
    return markdownLinkMatch[1].trim();
  }

  const rawUrlMatch = text.match(/(https?:\/\/[^\s|)\]>,"']+)/i);
  if (rawUrlMatch && rawUrlMatch[1]) {
    return rawUrlMatch[1].replace(/[.,;]+$/, '').trim();
  }

  const domainMatch = text.match(/\b((?:www\.|[a-z0-9-]+\.)+(?:cl|com)\b[^\s|)\]>,"']*)/i);
  if (domainMatch && domainMatch[1]) {
    return 'https://' + domainMatch[1].replace(/[.,;]+$/, '').trim();
  }

  return null;
}

/**
 * Extrae el valor numérico en CLP desde un texto de precio (ej. "$14.990", "CLP 14.990", "$ 14,990")
 */
function extractNumericPriceClp(priceText: string): number | null {
  if (!priceText) return null;

  const withoutUrls = priceText.replace(/https?:\/\/[^\s)]+/gi, '');
  const normalized = withoutUrls.replace(/CLP/gi, '').trim();

  const priceMatch = normalized.match(/\$\s*([0-9]{1,3}(?:[.,][0-9]{3})+|[0-9]{4,7})/);
  if (priceMatch && priceMatch[1]) {
    const digitsOnly = priceMatch[1].replace(/[.,]/g, '');
    const parsed = parseInt(digitsOnly, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  const fallbackMatch = normalized.match(/([0-9]{1,3}(?:\.[0-9]{3})+)/);
  if (fallbackMatch && fallbackMatch[1]) {
    const digitsOnly = fallbackMatch[1].replace(/\./g, '');
    const parsed = parseInt(digitsOnly, 10);
    if (!Number.isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function isMandatoryStore(storeName: string): boolean {
  const lower = storeName.toLowerCase();
  return REQUIRED_STORES.some((required) => lower.includes(required.toLowerCase()));
}

/**
 * Parsea la respuesta en texto o tabla Markdown (nombre de la tienda, link y precio)
 * y la ordena de menor a mayor precio.
 */
export function parseStorePricesFromResponse(
  rawText: string,
  productName = ''
): StorePriceItem[] {
  if (!rawText || !rawText.trim()) {
    return [];
  }

  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const parsedItems: StorePriceItem[] = [];
  const seenStores = new Set<string>();

  for (const line of lines) {
    if (/^\|?\s*[-:]+\s*\|/.test(line)) continue;
    if (/^\|?\s*(#|n°|tienda|nombre de la tienda)\s*\|/i.test(line) && /precio/i.test(line)) {
      continue;
    }

    let storeCandidate = '';
    let linkCandidate: string | null = extractUrlFromText(line);
    let priceCandidate = '';

    if (line.includes('|')) {
      const cells = line
        .split('|')
        .map((cell) => cell.replace(/\*\*/g, '').trim())
        .filter((cell) => cell.length > 0);

      if (cells.length >= 2) {
        const startIdx = /^\d+$/.test(cells[0]) && cells.length >= 3 ? 1 : 0;
        storeCandidate = cells[startIdx] || '';

        if (cells.length - startIdx >= 3) {
          const possibleLinkCell = cells[startIdx + 1] || '';
          linkCandidate = extractUrlFromText(possibleLinkCell) || linkCandidate;
          priceCandidate = cells[startIdx + 2] || '';
        } else {
          priceCandidate = cells[startIdx + 1] || '';
        }
      }
    } else {
      const cleanedLine = line
        .replace(/^(\d+[.)]|[-•*])\s*/, '')
        .replace(/\*\*/g, '')
        .trim();

      const lineWithoutLinks = cleanedLine
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi, '$1')
        .replace(/https?:\/\/[^\s|—–\-]+/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();

      const parts = lineWithoutLinks
        .split(/\s*[:—–\-]\s*/)
        .map((part) => part.trim())
        .filter((part) => part.length > 0);

      if (parts.length >= 2) {
        storeCandidate = parts[0];
        priceCandidate = parts[parts.length - 1];
      } else {
        const inlinePriceMatch = lineWithoutLinks.match(/^(.+?)\s+(\$\s*[0-9.,]+.*)$/);
        if (inlinePriceMatch) {
          storeCandidate = inlinePriceMatch[1].trim();
          priceCandidate = inlinePriceMatch[2].trim();
        }
      }
    }

    const storeMdMatch = storeCandidate.match(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/i);
    if (storeMdMatch) {
      storeCandidate = storeMdMatch[1].trim();
      if (!linkCandidate) {
        linkCandidate = storeMdMatch[2].trim();
      }
    }

    storeCandidate = storeCandidate.replace(/https?:\/\/[^\s]+/gi, '').trim();

    if (!storeCandidate || !priceCandidate) continue;
    if (/^(tienda|nombre|producto|nota|importante|fuente)/i.test(storeCandidate)) continue;

    const numericPrice = extractNumericPriceClp(priceCandidate);
    const storeKey = storeCandidate.toLowerCase();

    if (seenStores.has(storeKey)) continue;
    seenStores.add(storeKey);

    const formattedPrice = numericPrice !== null ? formatClp(numericPrice) : priceCandidate;
    const resolvedLink = linkCandidate || buildFallbackStoreLink(storeCandidate, productName);

    parsedItems.push({
      tienda: storeCandidate,
      link: resolvedLink,
      precio: formattedPrice,
      precio_numerico: numericPrice,
      es_tienda_obligatoria: isMandatoryStore(storeCandidate),
    });
  }

  parsedItems.sort((a, b) => {
    if (a.precio_numerico !== null && b.precio_numerico !== null) {
      return a.precio_numerico - b.precio_numerico;
    }
    if (a.precio_numerico !== null) return -1;
    if (b.precio_numerico !== null) return 1;
    return 0;
  });

  return parsedItems.slice(0, 10);
}

/**
 * Genera una lista referencial ordenada de menor a mayor cuando la sesión aún no está iniciada.
 */
function buildReferentialMarketList(input: MarketPriceQueryInput): StorePriceItem[] {
  const basePrice =
    input.sale_price && input.sale_price > 0
      ? input.sale_price
      : input.suggested_price && input.suggested_price > 0
        ? input.suggested_price
        : input.supplier_price && input.supplier_price > 0
          ? Math.round(input.supplier_price * 2.1)
          : 19990;

  const roundTo990 = (val: number) => Math.max(1990, Math.round(val / 1000) * 1000 - 10);

  const rawStores: Array<{ tienda: string; factor: number }> = [
    { tienda: 'Lider', factor: 0.88 },
    { tienda: 'Mercado Libre', factor: 0.92 },
    { tienda: 'Meiggs Mayorista Chile', factor: 0.95 },
    { tienda: 'Paris', factor: 0.98 },
    { tienda: 'Falabella', factor: 1.02 },
    { tienda: 'Sodimac', factor: 1.05 },
    { tienda: 'Ripley', factor: 1.08 },
    { tienda: 'La Polar', factor: 1.11 },
    { tienda: 'Hites', factor: 1.15 },
    { tienda: 'PcFactory', factor: 1.19 },
  ];

  const items: StorePriceItem[] = rawStores.map((entry) => {
    const numeric = roundTo990(basePrice * entry.factor);
    return {
      tienda: entry.tienda,
      link: buildFallbackStoreLink(entry.tienda, input.product_name),
      precio: formatClp(numeric),
      precio_numerico: numeric,
      es_tienda_obligatoria: isMandatoryStore(entry.tienda),
    };
  });

  items.sort((a, b) => (a.precio_numerico || 0) - (b.precio_numerico || 0));
  return items.slice(0, 10);
}

function isInvalidAssistantResponse(text: string): boolean {
  if (!text || text.trim().length < 15) return true;
  const lower = text.toLowerCase();
  const blockedPhrases = [
    'iniciar sesión',
    'inicia sesión',
    'log in',
    'sign up',
    'verify you are human',
    'cloudflare',
    'checking your browser',
  ];
  if (text.length < 120 && blockedPhrases.some((phrase) => lower.includes(phrase))) {
    return true;
  }
  return false;
}

/**
 * Ejecuta la consulta de precios del mercado usando el proveedor activo en Administración IA (ChatGPT o Copilot).
 */
export async function queryChatGptMarketPrices(
  input: MarketPriceQueryInput
): Promise<MarketPricesQueryResult> {
  ensureDirectoriesExist();

  const aiConfig = getAIConfig();
  const provider: AIProviderType = input.provider || aiConfig.provider;
  const prompt =
    input.custom_prompt && input.custom_prompt.trim().length > 0
      ? interpolateProductPrompt(input.custom_prompt, input.product_name)
      : buildMarketPricesPrompt(input.product_name);

  const isCopilot = provider === 'copilot';
  const profileDir = isCopilot ? COPILOT_PROFILE_DIR : CHATGPT_PROFILE_DIR;
  const targetUrl = isCopilot
    ? `https://copilot.microsoft.com/?q=${encodeURIComponent(prompt)}`
    : `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;

  let context: any = null;

  try {
    const launchOptionsBase = {
      viewport: { width: 1280, height: 850 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-infobars',
      ],
    };

    try {
      context = await chromium.launchPersistentContext(profileDir, {
        ...launchOptionsBase,
        channel: 'msedge',
        headless: true,
      });
    } catch {
      context = await chromium.launchPersistentContext(profileDir, {
        ...launchOptionsBase,
        channel: 'chrome',
        headless: true,
      });
    }

    const page = context.pages()[0] || (await context.newPage());

    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 25000,
    });

    await page.waitForTimeout(3500);

    const assistantMessagesCount = await page
      .locator('[data-message-author-role="assistant"], [data-content="ai-message"]')
      .count()
      .catch(() => 0);

    if (assistantMessagesCount === 0) {
      const inputSelectors = [
        '#prompt-textarea',
        'div[contenteditable="true"]#prompt-textarea',
        'textarea[placeholder]',
        'div[contenteditable="true"]',
        'textarea',
      ];

      let inputTriggered = false;
      for (const selector of inputSelectors) {
        const element = page.locator(selector).first();
        if (await element.isVisible().catch(() => false)) {
          const existingText = (await element.innerText().catch(() => '')).trim();
          if (!existingText) {
            await element.click({ timeout: 3000 }).catch(() => {});
            await element.fill(prompt).catch(async () => {
              await page.keyboard.type(prompt, { delay: 8 });
            });
            await page.waitForTimeout(400);
          }

          const sendButton = page
            .locator('button[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="Enviar"]')
            .first();

          if (await sendButton.isVisible().catch(() => false)) {
            await sendButton.click().catch(() => {});
          } else {
            await page.keyboard.press('Enter');
          }

          inputTriggered = true;
          break;
        }
      }

      if (!inputTriggered) {
        await page.keyboard.press('Enter').catch(() => {});
      }
    }

    let bestAssistantResponse = '';
    let stableTicks = 0;

    for (let attempt = 0; attempt < 18; attempt++) {
      await page.waitForTimeout(2000);

      const extractedText = await page
        .evaluate(() => {
          const assistantNodes = Array.from(
            document.querySelectorAll(
              '[data-message-author-role="assistant"], article[data-turn="assistant"] .markdown, [data-content="user-message"] ~ *, [class*="response"], [class*="message-content"]'
            )
          );
          if (assistantNodes.length === 0) return '';

          const lastNode = assistantNodes[assistantNodes.length - 1].cloneNode(true) as HTMLElement;
          const anchors = Array.from(lastNode.querySelectorAll('a[href]'));
          for (const anchor of anchors) {
            const href = anchor.getAttribute('href') || '';
            const label = (anchor.textContent || '').trim();
            if (href.startsWith('http')) {
              anchor.textContent = label && !label.startsWith('http') ? `[${label}](${href})` : href;
            }
          }
          return (lastNode.innerText || lastNode.textContent || '').trim();
        })
        .catch(() => '');

      if (extractedText && extractedText.length > 20) {
        if (extractedText === bestAssistantResponse) {
          stableTicks++;
          const isGenerating = await page
            .locator('button[data-testid="stop-button"]')
            .isVisible()
            .catch(() => false);
          if (!isGenerating && stableTicks >= 2) {
            break;
          }
        } else {
          bestAssistantResponse = extractedText;
          stableTicks = 0;
        }
      }
    }

    await context.close();
    context = null;

    if (!isInvalidAssistantResponse(bestAssistantResponse)) {
      const parsedItems = parseStorePricesFromResponse(bestAssistantResponse, input.product_name);

      if (parsedItems.length > 0) {
        const result: MarketPricesQueryResult = {
          success: true,
          provider_used: provider,
          source: isCopilot ? 'COPILOT_LIVE' : 'CHATGPT_LIVE',
          product_name: input.product_name,
          prompt_used: prompt,
          chatgpt_url: targetUrl,
          items: parsedItems,
          raw_response: bestAssistantResponse,
          QueriedAt: new Date().toISOString(),
        };

        saveMarketPricesToCache(input.product_name, result);
        return result;
      }
    }
  } catch (error: any) {
    console.warn('[ChatGptMarketPricesService] Aviso en consulta Playwright:', error?.message || error);
    if (context) {
      try {
        await context.close();
      } catch {
        // Ignorar error al cerrar contexto
      }
    }
  }

  const cachedResult = getMarketPricesFromCache(input.product_name);
  if (cachedResult && cachedResult.items.length > 0 && cachedResult.items[0].link) {
    return {
      ...cachedResult,
      provider_used: provider,
      source: 'CACHE',
    };
  }

  const referentialItems = buildReferentialMarketList(input);
  const referentialText = referentialItems
    .map((item, idx) => `${idx + 1}. ${item.tienda} - ${item.link} - ${item.precio}`)
    .join('\n');

  const providerLabel = isCopilot ? 'Microsoft Copilot' : 'ChatGPT';

  return {
    success: true,
    provider_used: provider,
    source: 'REQUIERE_SESION_IA',
    product_name: input.product_name,
    prompt_used: prompt,
    chatgpt_url: targetUrl,
    items: referentialItems,
    raw_response: referentialText,
    QueriedAt: new Date().toISOString(),
    warning: `Motor activo: ${providerLabel}. Para obtener respuestas en vivo desde tu cuenta sin usar API, inicia sesión una sola vez en ${providerLabel} o abre la consulta directa en el navegador.`,
  };
}

function saveMarketPricesToCache(productName: string, result: MarketPricesQueryResult): void {
  try {
    ensureDirectoriesExist();
    let cache: Record<string, MarketPricesQueryResult> = {};
    if (fs.existsSync(CHATGPT_CACHE_FILE)) {
      cache = JSON.parse(fs.readFileSync(CHATGPT_CACHE_FILE, 'utf-8'));
    }
    cache[productName.trim().toLowerCase()] = result;
    fs.writeFileSync(CHATGPT_CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  } catch {
    // Ignorar errores de escritura de caché
  }
}

function getMarketPricesFromCache(productName: string): MarketPricesQueryResult | null {
  try {
    if (!fs.existsSync(CHATGPT_CACHE_FILE)) return null;
    const cache = JSON.parse(fs.readFileSync(CHATGPT_CACHE_FILE, 'utf-8'));
    return cache[productName.trim().toLowerCase()] || null;
  } catch {
    return null;
  }
}

/**
 * Abre una ventana real de navegador con el perfil persistente de ChatGPT para que el usuario
 * inicie sesión en su cuenta (Plus/Team/Free) y quede guardada para las consultas automáticas.
 */
export async function startAssistedChatGptLoginWindow(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    ensureDirectoriesExist();

    const scriptsDir = path.resolve(__dirname, '..', '..', 'scripts');
    if (!fs.existsSync(scriptsDir)) {
      fs.mkdirSync(scriptsDir, { recursive: true });
    }

    const scriptPath = path.join(scriptsDir, 'login_chatgpt.ts');
    if (!fs.existsSync(scriptPath)) {
      const scriptContent = `import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CHATGPT_PROFILE_DIR = path.resolve(__dirname, '..', 'src', 'data', 'chatgpt_profile');

async function main() {
  console.log('Abriendo navegador para iniciar sesión en ChatGPT...');
  let context;
  try {
    context = await chromium.launchPersistentContext(CHATGPT_PROFILE_DIR, {
      channel: 'msedge',
      headless: false,
      viewport: { width: 1280, height: 850 },
      args: ['--disable-blink-features=AutomationControlled']
    });
  } catch {
    context = await chromium.launchPersistentContext(CHATGPT_PROFILE_DIR, {
      channel: 'chrome',
      headless: false,
      viewport: { width: 1280, height: 850 },
      args: ['--disable-blink-features=AutomationControlled']
    });
  }

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://chatgpt.com/');
  await new Promise<void>((resolve) => {
    context.on('close', () => resolve());
  });
}

main().catch(console.error);
`;
      fs.writeFileSync(scriptPath, scriptContent, 'utf-8');
    }

    const tsxCli = path.resolve(__dirname, '..', '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const child = spawn(process.execPath, [tsxCli, scriptPath], {
      detached: true,
      stdio: 'ignore',
      cwd: path.resolve(__dirname, '..', '..'),
    });
    child.unref();

    return {
      success: true,
      message:
        'Se ha abierto la ventana de navegador para ChatGPT. Inicia sesión con tu cuenta y luego ciérrala para guardar tu sesión.',
    };
  } catch (error: any) {
    return {
      success: false,
      message: `No se pudo abrir la ventana de inicio de sesión de ChatGPT: ${error?.message || String(error)}`,
    };
  }
}
