import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import { DB_SERVICE, DbProvider, DbType } from './drizzle.provider';

@Global()
@Module({
  providers: [DbProvider],
  exports: [DB_SERVICE, DbProvider],
})
export class DrizzleModule implements OnApplicationShutdown {
  constructor(@Inject(DB_SERVICE) private readonly db: DbType) {}

  // Fecha o pool no app.close() (seeds e testes não ficam pendurados)
  async onApplicationShutdown() {
    await this.db.$client.end();
  }
}
