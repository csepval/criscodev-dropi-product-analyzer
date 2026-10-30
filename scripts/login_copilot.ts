// scripts/login_copilot.ts
// Inicio de sesión asistido en Microsoft Copilot
// Permite guardar la sesión de Microsoft en el perfil persistente local
// para habilitar consultas en segundo plano ("por debajo").

import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USER_DATA = path.resolve(__dirname, '..', 'src', 'data', 'copilot_profile');

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

async function main() {
  console.log('===========================================================');
  console.log(' Microsoft Copilot – Sesión Asistida');
  console.log('===========================================================');
  console.log('Abriendo navegador para iniciar sesión en Microsoft Copilot...');
  console.log(`Perfil persistente: ${USER_DATA}`);

  if (!fs.existsSync(USER_DATA)) {
    fs.mkdirSync(USER_DATA, { recursive: true });
  }

  const channel = await findBrowserChannel();
  console.log(`Canal detectado: ${channel}`);

  const context = await chromium.launchPersistentContext(USER_DATA, {
    channel,
    headless: false,
    args: ['--start-maximized', '--no-sandbox']
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://copilot.microsoft.com');

  console.log('Ventana abierta. Por favor, inicia sesión con tu cuenta Microsoft.');
  console.log('Una vez que hayas iniciado sesión, puedes cerrar la ventana del navegador.');
}

main().catch(err => {
  console.error('Error al iniciar ventana de Copilot:', err);
});
