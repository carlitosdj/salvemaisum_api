import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { jwtConstants } from './auth.constants';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Module({
  imports: [JwtModule.register({ global: true, secret: jwtConstants.secret, signOptions: { expiresIn: '30d' } })],
  providers: [AuthService, { provide: APP_GUARD, useClass: AuthGuard }],
  controllers: [AuthController],
})
export class AuthModule {}
