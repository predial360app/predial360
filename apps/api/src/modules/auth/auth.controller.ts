import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
  Version,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '@predial360/shared';
import { AuthService } from './auth.service';
import {
  AuthResponseDto,
  Enable2FaResponseDto,
  LoginDto,
  RefreshTokenDto,
  RegisterDto,
  Verify2FaDto,
} from './dto/auth.dto';
import type { GoogleUser } from './strategies/google.strategy';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ── Registro ──────────────────────────────────────────────────────────────

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar novo usuário' })
  @ApiResponse({ status: 201, type: AuthResponseDto, description: 'Usuário criado e tokens gerados' })
  @ApiResponse({ status: 409, description: 'E-mail ou CPF já cadastrado' })
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  // ── Login ─────────────────────────────────────────────────────────────────

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Autenticar usuário (suporta 2FA)' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Credenciais inválidas ou 2FA incorreto' })
  login(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ): Promise<AuthResponseDto> {
    return this.authService.login(
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  // ── Refresh Token ─────────────────────────────────────────────────────────

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Renovar access token via refresh token' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Refresh token inválido ou expirado' })
  @UseGuards(AuthGuard('jwt-refresh'))
  refreshTokens(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RefreshTokenDto,
  ): Promise<AuthResponseDto> {
    return this.authService.refreshTokens(user.sub, dto.refreshToken);
  }

  // ── Logout ────────────────────────────────────────────────────────────────

  @ApiBearerAuth('JWT')
  @Delete('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Invalidar tokens (access + todos os refresh)' })
  @ApiResponse({ status: 204 })
  async logout(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.authService.logout(user.jti, user.sub);
  }

  // ── Google OAuth ──────────────────────────────────────────────────────────

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Iniciar login com Google' })
  @ApiResponse({ status: 302, description: 'Redirect para Google OAuth' })
  googleAuth(): void {
    // Passport redireciona automaticamente
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Callback do Google OAuth' })
  @ApiResponse({ status: 200, type: AuthResponseDto })
  googleCallback(@Req() req: Request): Promise<AuthResponseDto> {
    return this.authService.loginWithGoogle(req.user as GoogleUser);
  }

  // ── 2FA ───────────────────────────────────────────────────────────────────

  @ApiBearerAuth('JWT')
  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Gerar QR code para ativação do 2FA (TOTP)',
    description: 'Retorna URL do QR code e secret para Google Authenticator / Authy.',
  })
  @ApiResponse({ status: 200, type: Enable2FaResponseDto })
  enable2fa(@CurrentUser() user: JwtPayload): Promise<Enable2FaResponseDto> {
    return this.authService.enable2fa(user.sub);
  }

  @ApiBearerAuth('JWT')
  @Post('2fa/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Confirmar ativação do 2FA com código TOTP' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 401, description: 'Código TOTP inválido' })
  async confirm2fa(
    @CurrentUser() user: JwtPayload,
    @Body() dto: Verify2FaDto,
  ): Promise<void> {
    await this.authService.confirm2fa(user.sub, dto.totpCode);
  }

  @ApiBearerAuth('JWT')
  @Delete('2fa/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Desativar 2FA (exige código TOTP de confirmação)' })
  @ApiResponse({ status: 204 })
  async disable2fa(
    @CurrentUser() user: JwtPayload,
    @Body() dto: Verify2FaDto,
  ): Promise<void> {
    await this.authService.disable2fa(user.sub, dto.totpCode);
  }

  // ── Perfil do usuário autenticado ─────────────────────────────────────────

  @ApiBearerAuth('JWT')
  @Get('me')
  @Version('1')
  @ApiOperation({ summary: 'Retornar payload do usuário autenticado' })
  @ApiResponse({ status: 200, description: 'Payload JWT decodificado' })
  me(@CurrentUser() user: JwtPayload): JwtPayload {
    return user;
  }
}
