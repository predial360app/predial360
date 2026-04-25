import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class LoginDto {
  @ApiProperty({ example: 'joao@email.com', description: 'E-mail do usuário' })
  @IsEmail({}, { message: 'E-mail inválido.' })
  email!: string;

  @ApiProperty({ example: 'Senha@123!', description: 'Senha do usuário' })
  @IsString()
  @IsNotEmpty()
  password!: string;

  @ApiPropertyOptional({ example: '123456', description: 'Código TOTP (se 2FA ativo)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Código TOTP deve ter 6 dígitos.' })
  totpCode?: string;
}

export class RegisterDto {
  @ApiProperty({ example: 'João da Silva' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail({}, { message: 'E-mail inválido.' })
  email!: string;

  @ApiProperty({
    example: 'Senha@123!',
    description: 'Mínimo 8 chars: maiúscula, minúscula, número e especial',
  })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/, {
    message: 'Senha fraca: exija maiúscula, minúscula, número e caractere especial.',
  })
  password!: string;

  @ApiProperty({ example: '(11) 99999-1234' })
  @IsString()
  @Matches(/^\(\d{2}\)\s\d{4,5}-\d{4}$/, { message: 'Telefone inválido. Ex.: (11) 99999-1234' })
  phone!: string;

  @ApiProperty({ example: '123.456.789-09' })
  @IsString()
  @Matches(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/, { message: 'CPF inválido.' })
  cpf!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.OWNER })
  @IsEnum(UserRole)
  role!: UserRole;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'Refresh token válido' })
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}

export class Enable2FaResponseDto {
  @ApiProperty({ description: 'URI para QR code (Google Authenticator / Authy)' })
  otpauthUrl!: string;

  @ApiProperty({ description: 'Secret base32 para entrada manual' })
  secret!: string;
}

export class Verify2FaDto {
  @ApiProperty({ example: '123456', description: 'Código TOTP de 6 dígitos' })
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Código TOTP deve ter 6 dígitos.' })
  totpCode!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ description: 'Token de redefinição recebido por e-mail' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ example: 'NovaSenha@456!' })
  @IsString()
  @MinLength(8)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/, {
    message: 'Senha fraca.',
  })
  newPassword!: string;
}

export class AuthResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty()
  expiresIn!: number;

  @ApiProperty()
  tokenType!: 'Bearer';
}
