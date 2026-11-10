import { Controller, Get, Module, NotFoundException, Param, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import * as crypto from 'crypto';
import { Response } from 'express';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join, resolve } from 'path';
import * as sharp from 'sharp';
import { SkipAuth } from '../auth/auth.decorators';

// O app nunca baixa a foto original: mostra sempre uma versão WebP leve, gerada na 1ª vez e guardada em disco.
const TAMANHOS: Record<string, { largura: number; qualidade: number }> = {
  mini: { largura: 420, qualidade: 62 },
  media: { largura: 1000, qualidade: 72 },
};
const ARQUIVO_VALIDO = /^[^/\\]+\.(jpe?g|png|webp|gif)$/i;
const MAXIMO_BYTES = 20 * 1024 * 1024;
// Fotos antigas ficam no servidor do site; o que foi enviado depois fica em UPLOADS_DIR.
const ORIGEM = (process.env.FILES_ORIGIN || 'https://salvemaisum.com.br/files').replace(/\/+$/, '');
const pastaUploads = () => resolve(process.env.UPLOADS_DIR || 'uploads');

const emAndamento = new Map<string, Promise<void>>();

async function lerOriginal(arquivo: string) {
  const local = join(pastaUploads(), arquivo);
  if (existsSync(local)) return readFile(local);
  const resposta = await fetch(`${ORIGEM}/${encodeURIComponent(arquivo)}`, { signal: AbortSignal.timeout(15000) });
  if (!resposta.ok) throw new NotFoundException();
  const dados = Buffer.from(await resposta.arrayBuffer());
  if (dados.length > MAXIMO_BYTES) throw new NotFoundException();
  return dados;
}

async function gerar(arquivo: string, tamanho: { largura: number; qualidade: number }, destino: string) {
  const original = await lerOriginal(arquivo);
  const pronta = await sharp(original)
    .rotate()
    .resize({ width: tamanho.largura, withoutEnlargement: true })
    .webp({ quality: tamanho.qualidade })
    .toBuffer();
  await writeFile(destino, pronta);
}

@ApiTags('imagens')
@Controller('preview')
class PreviewController {
  @SkipAuth()
  @Get(':tamanho/:arquivo')
  async preview(@Param('tamanho') nome: string, @Param('arquivo') arquivo: string, @Res() res: Response) {
    const tamanho = TAMANHOS[nome];
    if (!tamanho || !ARQUIVO_VALIDO.test(arquivo) || arquivo.includes('..')) throw new NotFoundException();

    const pasta = join(pastaUploads(), '.previews', nome);
    const destino = join(pasta, `${crypto.createHash('sha1').update(arquivo).digest('hex')}.webp`);
    if (!existsSync(destino)) {
      await mkdir(pasta, { recursive: true });
      // Vários cartões pedindo a mesma foto geram uma única vez
      const chave = destino;
      if (!emAndamento.has(chave)) {
        emAndamento.set(chave, gerar(arquivo, tamanho, destino).finally(() => emAndamento.delete(chave)));
      }
      try {
        await emAndamento.get(chave);
      } catch {
        // Tipo de imagem: com JSON o navegador bloqueia a resposta antes do onError da tela
        return res.status(404).type('image/webp').end();
      }
    }
    res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
    return res.sendFile(destino, { dotfiles: 'allow' });
  }
}

@Module({ controllers: [PreviewController] })
export class PreviewModule {}
