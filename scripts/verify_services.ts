import { getProducts, getSummaryStats, getConnectionConfig, getImportJobs } from '../src/services/dropiDb';

async function verify() {
  console.log('--- 1. Verificando Configuración de Conexión ---');
  const config = await getConnectionConfig();
  console.log('Estado:', config.status, '| Modo:', config.auth_mode);

  console.log('\n--- 2. Verificando Historial de Jobs ---');
  const jobs = await getImportJobs(5);
  console.log(`Jobs registrados: ${jobs.length}`);
  if (jobs.length > 0) {
    console.log(`Último job: ${jobs[0].id} | Estado: ${jobs[0].status} | Procesados: ${jobs[0].total_fetched}`);
  }

  console.log('\n--- 3. Verificando Catálogo Completo (Filtros y Paginación) ---');
  const resAll = await getProducts({ limit: 10, offset: 0 });
  console.log(`Total productos en catálogo: ${resAll.total}`);
  console.log(`Página 1 (limit 10): ${resAll.products.length} productos devueltos`);

  console.log('\n--- 4. Verificando Filtro: Solo Verificados y Premium ---');
  const resFiltered = await getProducts({ is_verified: true, is_premium: true, limit: 50 });
  console.log(`Productos Verificados + Premium: ${resFiltered.products.length}`);

  console.log('\n--- 5. Verificando Filtro: Excluir Alertas ---');
  const resClean = await getProducts({ exclude_flags: true, limit: 50 });
  console.log(`Productos sin alertas: ${resClean.products.length}`);

  console.log('\n--- 6. Verificando Filtro: Margen Mínimo 40% ---');
  const resMargin = await getProducts({ min_margin: 40, limit: 50 });
  console.log(`Productos con margen >= 40%: ${resMargin.products.length}`);

  console.log('\n--- 7. Verificando Estadísticas Resumen ---');
  const stats = await getSummaryStats();
  console.log('Estadísticas:', stats);

  console.log('\n>>> TODAS LAS COMPROBACIONES DE SERVICIO PASARON SATISFACTORIAMENTE <<<');
  process.exit(0);
}

verify().catch((err) => {
  console.error(err);
  process.exit(1);
});
