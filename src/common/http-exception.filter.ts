import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { Response } from 'express';

// O front lê `error` nas respostas de falha; `message` segue o padrão do Nest.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Erro');

  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (!(exception instanceof HttpException)) {
      this.logger.error(exception);
      return response.status(500).json({ statusCode: 500, message: 'Erro interno.', error: 'Erro interno.' });
    }
    const status = exception.getStatus();
    const body = exception.getResponse() as { message?: string | string[] } | string;
    const raw = typeof body === 'string' ? body : body.message ?? exception.message;
    const message = Array.isArray(raw) ? raw.join('; ') : raw;
    return response.status(status).json({ statusCode: status, message, error: message });
  }
}
