import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

export const TIPOS_SANGUINEOS = ['1', '2', '3', '4', '5', '6', '7', '8'];

class NewProfileDto {
  @IsString() @MaxLength(120) name: string;
  @IsOptional() @IsString() @MaxLength(255) image?: string;
}

export class RegisterDto {
  @IsEmail() @MaxLength(190) email: string;
  @IsString() @MinLength(6, { message: 'A senha precisa de ao menos 6 caracteres.' }) @MaxLength(72) password: string;
  @ValidateNested() @Type(() => NewProfileDto) profile: NewProfileDto;
}

class ProfileUpdateDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsIn(TIPOS_SANGUINEOS) bloodtype?: string;
  @IsOptional() @IsString() @MaxLength(255) image?: string;
  @IsOptional() @IsInt() @Type(() => Number) city?: number;
  @IsOptional() @IsInt() @Type(() => Number) state?: number;
}

export class UpdateMeDto {
  @ValidateNested() @Type(() => ProfileUpdateDto) profile: ProfileUpdateDto;
}

export class TrocarSenhaDto {
  @IsString() @MaxLength(72) senhaAtual: string;
  @IsString() @MinLength(6, { message: 'A senha nova precisa de ao menos 6 caracteres.' }) @MaxLength(72) novaSenha: string;
}

// Usado pelo adm para corrigir o perfil de alguém (o e-mail não muda por aqui)
export class PerfilAdminDto extends ProfileUpdateDto {}
