import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { TIPOS_SANGUINEOS } from '../user/user.dto';

// O front manda o hemocentro como { id } ou id; vazio significa "nenhum".
const idOuNulo = ({ value }: { value: any }) => {
  const bruto = value && typeof value === 'object' ? value.id : value;
  return bruto === null || bruto === undefined || bruto === '' ? null : Number(bruto);
};

export class CampaignDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsIn(TIPOS_SANGUINEOS) bloodtype?: string;
  @IsOptional() @IsString() @MaxLength(255) image?: string;
  @IsOptional() @IsString() @MaxLength(255) bcname?: string;
  @IsOptional() @IsString() @MaxLength(255) bcaddress?: string;
  @IsOptional() @IsString() @MaxLength(255) bccountry?: string;
  @IsOptional() @IsString() @MaxLength(255) tags?: string;
  @IsOptional() @IsString() description?: string;

  // Quantos doadores a família precisa; null remove a meta
  @ValidateIf((_, v) => v !== undefined && v !== null) @IsInt() @Min(1) @Max(500) @Type(() => Number) meta_doadores?: number | null;

  // Consentimento do paciente ou da família (LGPD)
  @IsOptional() @IsBoolean() consentimento?: boolean;
  @IsOptional() @IsIn(['paciente', 'familiar', 'responsavel', 'equipe']) vinculo?: string;
  @IsOptional() @IsBoolean() so_primeiro_nome?: boolean;

  @ValidateIf((_, v) => v !== undefined && v !== null) @Transform(idOuNulo) @IsInt() bccity?: number | null;
  @ValidateIf((_, v) => v !== undefined && v !== null) @Transform(idOuNulo) @IsInt() bcstate?: number | null;
  @ValidateIf((_, v) => v !== undefined && v !== null) @Transform(idOuNulo) @IsInt() bcParent?: number | null;
}

export class CampaignListQuery {
  @IsOptional() @IsInt() @Type(() => Number) page?: number;
}

export class SituacaoDto {
  @IsIn(['ativo', 'atendido', 'encerrado']) situacao: string;
}
