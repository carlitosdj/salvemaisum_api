import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger('Email');

  async enviar(to: string, subject: string, html: string) {
    if (!process.env.SMTP_HOST) {
      this.logger.log(`[sem SMTP] ${subject} -> ${to}: ${html}`);
      return;
    }
    const transporte = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    try {
      await transporte.sendMail({ from: process.env.SMTP_FROM, to, subject, html });
    } catch (erro) {
      this.logger.error(`Falha ao enviar "${subject}"`, erro);
    }
  }

  botao(titulo: string, texto: string, url: string, rotulo: string) {
    return `<center><h2 style="font-family:Helvetica,Arial,sans-serif">${titulo}</h2>
<p style="font-family:Helvetica,Arial,sans-serif">${texto}</p>
<a href="${url}" style="display:inline-block;padding:12px 24px;background:#cf3533;color:#fff;border-radius:6px;font-family:Helvetica,Arial,sans-serif;text-decoration:none">${rotulo}</a></center>`;
  }
}
