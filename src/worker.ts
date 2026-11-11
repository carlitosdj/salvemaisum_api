import 'dotenv/config';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AgenteWorkerModule } from './agente/agente.module';
import { AgenteService } from './agente/agente.service';
import { DrizzleModule } from './drizzle/drizzle.module';

// Worker do Salve Mais Um: roda fora da API, para gerações longas não pesarem no site nem pararem num deploy da API.
// Confere a cada 5 segundos se o adm pediu uma geração de notícias.
@Module({ imports: [ConfigModule.forRoot({ isGlobal: true }), DrizzleModule, AgenteWorkerModule] })
class WorkerModule {}

const INTERVALO_MS = 5000;

async function iniciar() {
  const app = await NestFactory.createApplicationContext(WorkerModule, { logger: ['log', 'warn', 'error'] });
  app.enableShutdownHooks();
  const log = new Logger('Worker');
  const agente = app.get(AgenteService);
  await agente.limparInterrompidas();
  log.log(`Worker no ar. Chave do Claude ${process.env.ANTHROPIC_API_KEY ? 'configurada' : 'AUSENTE'}.`);

  let parar = false;
  for (const sinal of ['SIGTERM', 'SIGINT'] as const) process.once(sinal, () => { parar = true; });

  while (!parar) {
    try {
      const id = await agente.proxima();
      if (id) {
        log.log(`Execução ${id}: começando`);
        await agente.processar(id);
        log.log(`Execução ${id}: terminou`);
        continue;
      }
    } catch (erro) {
      log.error(erro instanceof Error ? erro.message : String(erro));
    }
    await new Promise((r) => setTimeout(r, INTERVALO_MS));
  }
  await app.close();
}

iniciar();
