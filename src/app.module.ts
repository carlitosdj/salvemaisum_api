import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DrizzleModule } from './drizzle/drizzle.module';
import { EmailModule } from './email/email.module';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { CampaignModule } from './campaign/campaign.module';
import { BloodcenterModule } from './bloodcenter/bloodcenter.module';
import { LocationModule } from './location/location.module';
import { ContentModule } from './content/content.module';
import { ContactModule } from './contact/contact.module';
import { UploadModule } from './upload/upload.module';
import { AdminModule } from './admin/admin.module';
import { HealthModule } from './health/health.module';
import { PreviewModule } from './preview/preview.module';
import { DoacaoModule } from './doacao/doacao.module';
import { SeoModule } from './seo/seo.module';
import { AvisoModule } from './aviso/aviso.module';
import { DoadorModule } from './doador/doador.module';
import { PulsoModule } from './pulso/pulso.module';
import { CorporativoModule } from './corporativo/corporativo.module';
import { AcaoModule } from './acao/acao.module';
import { NoticiaModule } from './noticia/noticia.module';
import { AgenteModule } from './agente/agente.module';
import { ComentarioModule } from './comentario/comentario.module';
import { RegistroModule } from './registro/registro.module';
import { CicloModule } from './ciclo/ciclo.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DrizzleModule,
    EmailModule,
    AuthModule,
    UserModule,
    CampaignModule,
    BloodcenterModule,
    LocationModule,
    ContentModule,
    ContactModule,
    UploadModule,
    AdminModule,
    HealthModule,
    PreviewModule,
    DoacaoModule,
    SeoModule,
    AvisoModule,
    DoadorModule,
    PulsoModule,
    CorporativoModule,
    AcaoModule,
    NoticiaModule,
    AgenteModule,
    ComentarioModule,
    RegistroModule,
    CicloModule,
  ],
})
export class AppModule {}
