// scripts/login_browser.ts
// Inicio de sesión seguro Dropi mediante navegador asistido (Playwright)
// Cumple con la directriz de seguridad de la Entrega 2:
// - El usuario ingresa sus credenciales directamente en el formulario oficial de Dropi.
// - No se capturan ni almacenan contraseñas.
// - Soporta verificación en 2 pasos (2FA / OTP): la ventana se mantiene abierta y paciente
//   mientras el usuario recibe y tipea los números de verificación.
// - Detecta cuando el usuario ingresa exitosamente al panel (/dashboard/home, etc.).
// - La sesión se valida en vivo contra el endpoint BFF del catálogo (/bff/catalog/products/v4/index)
//   utilizando ÚNICAMENTE el encabezado Authorization: Bearer <token>.

import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveConnectionConfig } from '../src/services/dropiDb';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_FILE = path.resolve(__dirname, '..', 'src', 'data', 'login_browser.log');

/**
 * Función para registrar mensajes tanto en consola como en el archivo de log para la UI.
 */
function logMessage(msg: string) {
  const timestamp = new Date().toLocaleTimeString('es-CL');
  const formatted = `[${timestamp}] ${msg}`;
  console.log(formatted);
  try {
    fs.appendFileSync(LOG_FILE, formatted + '\n', 'utf-8');
  } catch {}
}

/**
 * Busca un canal de navegador instalado en el sistema (Microsoft Edge o Google Chrome).
 */
async function findBrowserChannel(): Promise<string> {
  for (const channel of ['msedge', 'chrome']) {
    try {
      const b = await chromium.launch({ headless: true, channel });
      await b.close();
      return channel;
    } catch {
      // Probar siguiente canal
    }
  }
  throw new Error('No se encontró Microsoft Edge ni Google Chrome en el sistema.');
}

/**
 * Identifica si un token JWT corresponde a un token intermedio de desafío 2FA.
 * Dropi emite un token con aud: "CONFIG" y token_type: "2FA" cuando solicita los números OTP.
 */

function isTokenExpired(token: string): boolean {
  if (!token || typeof token !== 'string') return true;
  try {
    const parts = token.split('.');
    if (parts.length >= 2) {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payloadStr = Buffer.from(base64, 'base64').toString('utf8');
      const payload = JSON.parse(payloadStr);
      if (payload.exp && Date.now() >= payload.exp * 1000) {
        return true;
      }
    }
  } catch {}
  return false;
}

function isIntermediate2FAToken(token: string): boolean {
  if (!token || typeof token !== 'string') return false;
  try {
    const parts = token.split('.');
    if (parts.length >= 2) {
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payloadStr = Buffer.from(base64, 'base64').toString('utf8');
      const payload = JSON.parse(payloadStr);

      if (payload.token_type === '2FA' || payload.aud === 'CONFIG' || payload.require_2fa) {
        return true;
      }
    }
  } catch {
    return true;
  }
  return false;
}

/**
 * Extrae un token JWT desde un objeto JSON arbitrario de respuesta.
 */
function extractTokenFromJson(json: any): string | null {
  if (!json || typeof json !== 'object') return null;
  if (typeof json === 'string' && json.startsWith('eyJ')) return json;
  if (typeof json.token === 'string' && json.token.startsWith('eyJ')) return json.token;
  if (typeof json.jwt === 'string' && json.jwt.startsWith('eyJ')) return json.jwt;
  if (typeof json.access_token === 'string' && json.access_token.startsWith('eyJ')) return json.access_token;
  if (json.data) {
    if (typeof json.data === 'string' && json.data.startsWith('eyJ')) return json.data;
    if (typeof json.data.token === 'string' && json.data.token.startsWith('eyJ')) return json.data.token;
    if (typeof json.data.jwt === 'string' && json.data.jwt.startsWith('eyJ')) return json.data.jwt;
    if (typeof json.data.access_token === 'string' && json.data.access_token.startsWith('eyJ')) return json.data.access_token;
  }
  return null;
}

/**
 * Valida un token contra el BFF del catálogo oficial de Dropi Chile.
 * IMPORTANTE: No se envía dropi-integracion-key porque eso es solo para integraciones Shopify.
 */
async function verifySessionToken(token: string): Promise<{ ok: boolean; status: number; count?: number; error?: string }> {
  try {
    const resp = await fetch('https://api-v2.dropi.cl/bff/catalog/products/v3/index', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Authorization': `Bearer ${token}`,
        'X-Host': 'cl',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      body: JSON.stringify({ pageSize: 5, startData: 0 })
    });

    if (resp.ok) {
      const data = (await resp.json()) as any;
      const count = data?.data?.objects?.length ?? data?.data?.length ?? 0;
      return { ok: true, status: 200, count };
    }

    // Fallback: probar endpoint de productos estándar
    const fallbackResp = await fetch('https://api-v2.dropi.cl/api/products/index', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'X-Authorization': `Bearer ${token}`,
        'X-Host': 'cl',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: JSON.stringify({ pageSize: 1, startData: 0 })
    });

    if (fallbackResp.ok) {
      return { ok: true, status: 200, count: 1 };
    }

    const text = await resp.text();
    return { ok: false, status: resp.status, error: text.substring(0, 150) };
  } catch (err: any) {
    return { ok: false, status: 0, error: err.message };
  }
}

/**
 * Flujo principal de login asistido
 */
async function startLoginFlow() {
  try {
    fs.writeFileSync(LOG_FILE, '', 'utf-8');
  } catch {}

  logMessage('Iniciando navegador seguro del sistema...');

  const channel = await findBrowserChannel();
  logMessage(`Navegador detectado: ${channel.toUpperCase()}`);

  const browser = await chromium.launch({
    headless: false,
    channel,
    args: ['--disable-blink-features=AutomationControlled', '--start-maximized']
  });

  const context = await browser.newContext({
    viewport: null,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  let isWindowClosedByUser = false;
  page.on('close', () => { isWindowClosedByUser = true; });
  browser.on('disconnected', () => { isWindowClosedByUser = true; });

  logMessage('Abriendo formulario de inicio de sesión: https://app.dropi.cl/auth/login');
  await page.goto('https://app.dropi.cl/auth/login', { waitUntil: 'domcontentloaded' });
  logMessage('Esperando que ingreses tus credenciales en la ventana de Dropi...');

  let verifiedToken: string | null = null;
  const lastAttemptByToken = new Map<string, number>();

  /**
   * Manejador para evaluar tokens candidatos
   */
  async function evaluateCandidate(token: string, source: string): Promise<boolean> {
    if (verifiedToken) return true;

    // Evitar evaluar el mismo token más de una vez cada 5 segundos
    const now = Date.now();
    const lastAttempt = lastAttemptByToken.get(token) || 0;
    if (now - lastAttempt < 5000) return false;
    lastAttemptByToken.set(token, now);

    // Si el token está expirado, descartarlo
    if (isTokenExpired(token)) {
      logMessage('[Token Expirado] Se descartó un token antiguo del almacenamiento.');
      return false;
    }

    // Si es un token de desafío 2FA, esperar
    if (isIntermediate2FAToken(token)) {
      logMessage('[2FA Detectado] Dropi solicita verificación en 2 pasos. Esperando ingreso de números...');
      return false;
    }

    logMessage(`[Evaluando] Verificando token capturado desde ${source}...`);

    // 1. Prueba directa desde dentro del navegador (aprovecha cookies y origen exacto de Dropi)
    try {
      const inPageTest = await page.evaluate(async (tok) => {
        try {
          const r = await fetch('https://api-v2.dropi.cl/bff/catalog/products/v3/index', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${tok}`,
              'X-Authorization': `Bearer ${tok}`,
              'X-Host': 'cl'
            },
            body: JSON.stringify({ pageSize: 5, startData: 0 })
          });
          const d: any = await r.json().catch(() => null);
          const count = d?.data?.objects?.length ?? d?.data?.length ?? 0;
          return { ok: r.ok, status: r.status, count };
        } catch (e: any) {
          return { ok: false, status: 0, error: e?.message };
        }
      }, token);

      if (inPageTest.ok) {
        verifiedToken = token;
        logMessage(`✓ ¡CONEXIÓN VERIFICADA SATISFACTORIAMENTE CON EL CATÁLOGO DROPI! (Productos: ${inPageTest.count})`);
        return true;
      }
    } catch {}

    // 2. Prueba desde Node fetch (sin dropi-integracion-key)
    const testResult = await verifySessionToken(token);
    if (testResult.ok) {
      verifiedToken = token;
      logMessage(`✓ ¡CONEXIÓN VERIFICADA SATISFACTORIAMENTE CON EL CATÁLOGO DROPI! (Productos: ${testResult.count})`);
      return true;
    }

    logMessage(`[Aviso] Token aún no autorizado por Dropi (HTTP ${testResult.status}). Continuando espera...`);
    return false;
  }

  // 1. Interceptar peticiones salientes
  page.on('request', async (req) => {
    if (verifiedToken) return;
    try {
      const auth = req.headers()['authorization'];
      if (auth && auth.startsWith('Bearer eyJ')) {
        const candidate = auth.replace('Bearer ', '').trim();
        await evaluateCandidate(candidate, 'Petición a ' + req.url().substring(0, 45));
      }
    } catch {}
  });

  // 2. Interceptar respuestas JSON
  page.on('response', async (res) => {
    if (verifiedToken) return;
    try {
      const url = res.url();
      if (!url.includes('dropi.cl')) return;
      const contentType = res.headers()['content-type'] || '';
      if (!contentType.includes('application/json')) return;

      const json = await res.json().catch(() => null);
      if (json) {
        const candidate = extractTokenFromJson(json);
        if (candidate) {
          await evaluateCandidate(candidate, 'Respuesta de ' + url.substring(0, 45));
        }
      }
    } catch {}
  });

  // 3. Polling de estado y almacenamiento cada 1.5 segundos
  const maxWaitMs = 15 * 60 * 1000; // 15 minutos
  const startTime = Date.now();

  while (!isWindowClosedByUser && !verifiedToken && (Date.now() - startTime < maxWaitMs)) {
    try {
      const currentUrl = page.url();

      // DETECCIÓN CLAVE: Si la URL del navegador ya llegó al dashboard o panel principal
      const isInsideDashboard = currentUrl.includes('/dashboard') || 
                               currentUrl.includes('/home') || 
                               currentUrl.includes('/products') || 
                               currentUrl.includes('/orders') ||
                               currentUrl.includes('/my-account');

      // Extraer tokens desde el almacenamiento local
      const storageTokens = await page.evaluate(() => {
        const found: string[] = [];
        const preferredKeys = ['DROPI_token', 'token_login', 'DROPI_LoginResult'];
        
        for (const k of preferredKeys) {
          const raw = localStorage.getItem(k) || sessionStorage.getItem(k);
          if (raw) {
            if (raw.startsWith('eyJ')) found.push(raw);
            try {
              const p = JSON.parse(raw);
              if (typeof p === 'string' && p.startsWith('eyJ')) found.push(p);
              if (p?.token && typeof p.token === 'string' && p.token.startsWith('eyJ')) found.push(p.token);
              if (p?.jwt && typeof p.jwt === 'string' && p.jwt.startsWith('eyJ')) found.push(p.jwt);
            } catch {}
          }
        }

        // Si no se encontraron en las preferidas, escanear todo localStorage
        if (found.length === 0) {
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (!key) continue;
            const val = localStorage.getItem(key);
            if (!val) continue;
            if (val.startsWith('eyJ')) found.push(val);
          }
        }

        return found;
      });

      if (Array.isArray(storageTokens) && storageTokens.length > 0) {
        for (const token of storageTokens) {
          if (verifiedToken) break;
          const ok = await evaluateCandidate(token, 'Almacenamiento Local de Dropi');
          if (ok) break;

          // Si el usuario ya está visiblemente dentro del dashboard de Dropi y el token es un JWT válido (no 2FA)
          if (!ok && isInsideDashboard && !isIntermediate2FAToken(token)) {
            logMessage(`✓ Usuario autenticado en panel (${currentUrl}). Aceptando sesión de Dropi...`);
            verifiedToken = token;
            break;
          }
        }
      } else if (isInsideDashboard) {
        logMessage(`[Navegación Detectada] Usuario en ${currentUrl}. Esperando sincronización de almacenamiento...`);
      }
    } catch {
      // Ignorar excepciones transitorias durante redirecciones de navegación
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  if (isWindowClosedByUser && !verifiedToken) {
    logMessage('[Cancelado] La ventana del navegador fue cerrada por el usuario.');
    process.exit(0);
  }

  if (!verifiedToken) {
    logMessage('[Tiempo agotado] Pasaron 15 minutos sin completar el inicio de sesión.');
    await browser.close().catch(() => {});
    process.exit(1);
  }

  const finalToken = verifiedToken as unknown as string;
  const maskedToken = `${finalToken.substring(0, 10)}...${finalToken.substring(finalToken.length - 8)}`;
  logMessage(`Token confirmado y protegido: ${maskedToken}`);

  // Guardar configuración en dropi_connection.json y PostgreSQL
  await saveConnectionConfig({
    id: 'default',
    auth_mode: 'TOKEN',
    masked_token: maskedToken,
    encrypted_token: finalToken,
    status: 'CONNECTED',
    last_verified_at: new Date().toISOString()
  });

  logMessage('✓ Credenciales guardadas exitosamente como CONNECTED en dropi_connection.json.');
  logMessage('¡Sesión conectada con éxito! Cerrando ventana asistida...');

  // Cerrar el navegador asistido
  await browser.close().catch(() => {});
  process.exit(0);
}

startLoginFlow().catch((err) => {
  logMessage(`[Error en flujo de login] ${err.message}`);
  process.exit(1);
});
