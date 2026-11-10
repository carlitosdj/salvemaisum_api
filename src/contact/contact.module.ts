import { Body, Controller, Delete, Get, Inject, Ip, Module, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength } from 'class-validator';
import { desc, eq } from 'drizzle-orm';
import { AdminOnly, SkipAuth } from '../auth/auth.decorators';
import { LimiteTentativas } from '../common/limite';
import { DB_SERVICE, DbType } from '../drizzle/drizzle.provider';
import * as schema from '../_schemas/schema';

const limite = new LimiteTentativas(10, 60 * 60 * 1000);

class ContactDto {
  @IsString() @MaxLength(255) name: string;
  @IsEmail() @MaxLength(255) email: string;
  @IsString() @MaxLength(255) subject: string;
  @IsString() @MaxLength(5000) message: string;
}

@ApiTags('contato')
@ApiBearerAuth()
@Controller()
class ContactController {
  constructor(@Inject(DB_SERVICE) private readonly db: DbType) {}

  @SkipAuth()
  @Post('contact')
  async criar(@Body() dados: ContactDto, @Ip() ip: string) {
    limite.verificar(ip);
    await this.db.insert(schema.contact).values({ ...dados, created_at: Date.now() / 1000 });
    return { msg: 'Ok!' };
  }

  @AdminOnly()
  @Get('contacts')
  listar() {
    return this.db.select().from(schema.contact).orderBy(desc(schema.contact.id));
  }

  @AdminOnly()
  @Delete('contact/:id')
  async remover(@Param('id', ParseIntPipe) id: number) {
    await this.db.delete(schema.contact).where(eq(schema.contact.id, id));
    return id;
  }
}

@Module({ controllers: [ContactController] })
export class ContactModule {}
