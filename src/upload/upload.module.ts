import { BadRequestException, Controller, Module, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import * as crypto from 'crypto';
import { mkdirSync } from 'fs';
import { diskStorage } from 'multer';

const EXTENSOES: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const destino = process.env.UPLOADS_DIR || 'uploads';
mkdirSync(destino, { recursive: true });

@ApiTags('upload')
@ApiBearerAuth()
@Controller('upload')
class UploadController {
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: destino,
        filename: (_req, file, cb) => cb(null, crypto.randomUUID() + EXTENSOES[file.mimetype]),
      }),
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => cb(null, Boolean(EXTENSOES[file.mimetype])),
    }),
  )
  enviar(@UploadedFile() arquivo?: Express.Multer.File) {
    if (!arquivo) throw new BadRequestException('Envie uma imagem JPG, PNG ou WEBP.');
    return { filename: arquivo.filename };
  }
}

@Module({ controllers: [UploadController] })
export class UploadModule {}
