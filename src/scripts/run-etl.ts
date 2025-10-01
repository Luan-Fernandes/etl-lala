import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { DatasusService } from '../datasus/datasus.service';

async function run() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  try {
    const service = app.get(DatasusService);

    // Executa sempre o fluxo padrão (12 links por mês) sem precisar de env/parâmetros
    const links = await service.downloadLinksPorMesPadrao();
    links.forEach(link => {
      console.log(link);
    });
  } finally {
    await app.close();
  }
}

run().catch((e) => {
  console.error('ETL failed:', e?.message || e);
  process.exit(1);
});
