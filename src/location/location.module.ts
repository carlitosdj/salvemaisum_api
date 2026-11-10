import { Controller, Get, Inject, Module, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { asc, eq } from 'drizzle-orm';
import { SkipAuth } from '../auth/auth.decorators';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';
import * as schema from '../_schemas/schema';

@ApiTags('localidades')
@SkipAuth()
@Controller()
class LocationController {
  constructor(@Inject(DB_SERVICE) private readonly db: DbType) {}

  @Get('states')
  estados() {
    return this.db.select().from(schema.state).orderBy(asc(schema.state.name));
  }

  @Get('cities/:uf')
  cidades(@Param('uf', ParseIntPipe) estado: number) {
    return this.db.select().from(schema.city).where(eq(schema.city.state, estado)).orderBy(asc(schema.city.name));
  }
}

@Module({ controllers: [LocationController] })
export class LocationModule {}
