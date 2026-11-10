import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail() email: string;
  @IsString() @MaxLength(72) password: string;
}

export class GoogleDto {
  @IsString() @MaxLength(4096) credential: string;
}

export class FacebookDto {
  @IsString() @MaxLength(4096) accessToken: string;
}

export class LinkDto {
  @IsString() @MaxLength(2048) token: string;
}

export class RecoveryDto {
  @IsEmail() email: string;
}

export class KeyDto {
  @IsEmail() email: string;
  @IsString() @Length(36, 36, { message: 'Chave inválida' }) auth_key: string;
}

export class ResetDto extends KeyDto {
  @IsString() @MinLength(6, { message: 'A senha precisa de ao menos 6 caracteres.' }) @MaxLength(72) newPassword: string;
}
