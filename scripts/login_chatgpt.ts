import path from 'node:path';
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
