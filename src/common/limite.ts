import { HttpException, HttpStatus } from '@nestjs/common';

// Limite de tentativas em memória (por processo) para rotas públicas sensíveis:
// cadastro, esqueci a senha. Suficiente para uma instância; com várias, trocar por Redis.
export class LimiteTentativas {
  private readonly janelas = new Map<string, number[]>();

  constructor(
    private readonly maximo: number,
    private readonly janelaMs: number,
  ) {}

  verificar(chave: string) {
    const agora = Date.now();
    const recentes = (this.janelas.get(chave) ?? []).filter(
      (t) => agora - t < this.janelaMs,
    );
    if (recentes.length >= this.maximo) {
      throw new HttpException(
        'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    recentes.push(agora);
    this.janelas.set(chave, recentes);
    if (this.janelas.size > 10000) this.limpar(agora);
  }

  private limpar(agora: number) {
    for (const [k, v] of this.janelas)
      if (!v.some((t) => agora - t < this.janelaMs)) this.janelas.delete(k);
  }
}
