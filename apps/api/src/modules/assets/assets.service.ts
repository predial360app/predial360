import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { type Asset, MaintenanceFrequency, UserRole } from '@prisma/client';
import * as QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';

import { PrismaService } from '../../database/prisma.service';
import type { CreateAssetDto, UpdateAssetDto } from './dto/create-asset.dto';

// Dias por frequência de manutenção
const FREQUENCY_DAYS: Record<MaintenanceFrequency, number> = {
  WEEKLY: 7,
  MONTHLY: 30,
  QUARTERLY: 90,
  SEMIANNUAL: 180,
  ANNUAL: 365,
  BIENNIAL: 730,
};

@Injectable()
export class AssetsService {
  private readonly logger = new Logger(AssetsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ── Criar ativo ───────────────────────────────────────────────────────────

  async create(propertyId: string, requesterId: string, requesterRole: UserRole, dto: CreateAssetDto): Promise<Asset> {
    await this.assertPropertyAccess(propertyId, requesterId, requesterRole);

    const qrCode = uuidv4(); // UUID único como payload do QR

    let nextMaintenanceDate: Date | undefined;
    if (dto.maintenanceFrequency && dto.installationDate) {
      const install = new Date(dto.installationDate);
      const days = FREQUENCY_DAYS[dto.maintenanceFrequency];
      nextMaintenanceDate = new Date(install.getTime() + days * 86400000);
    } else if (dto.maintenanceFrequency) {
      const days = FREQUENCY_DAYS[dto.maintenanceFrequency];
      nextMaintenanceDate = new Date(Date.now() + days * 86400000);
    }

    const asset = await this.prisma.asset.create({
      data: {
        propertyId,
        name: dto.name,
        category: dto.category,
        brand: dto.brand,
        model: dto.model,
        serialNumber: dto.serialNumber,
        installationDate: dto.installationDate ? new Date(dto.installationDate) : undefined,
        warrantyExpiration: dto.warrantyExpiration ? new Date(dto.warrantyExpiration) : undefined,
        maintenanceFrequency: dto.maintenanceFrequency,
        nextMaintenanceDate,
        applicableNorms: (dto.applicableNorms as string[]) ?? [],
        notes: dto.notes,
        qrCode,
      },
    });

    this.logger.log(`Ativo criado: ${asset.id} — ${asset.name} (propriedade: ${propertyId})`);
    return asset;
  }

  // ── Listar ativos de um imóvel ─────────────────────────────────────────────

  async findByProperty(
    propertyId: string,
    requesterId: string,
    requesterRole: UserRole,
    category?: string,
  ): Promise<Asset[]> {
    await this.assertPropertyAccess(propertyId, requesterId, requesterRole);

    return this.prisma.asset.findMany({
      where: {
        propertyId,
        deletedAt: null,
        ...(category ? { category: { equals: category as Asset['category'] } } : {}),
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  // ── Detalhes de um ativo ──────────────────────────────────────────────────

  async findById(id: string, requesterId: string, requesterRole: UserRole): Promise<Asset> {
    const asset = await this.prisma.asset.findFirst({
      where: { id, deletedAt: null },
      include: {
        property: { select: { ownerId: true } },
      },
    });

    if (!asset) throw new NotFoundException('Ativo não encontrado.');

    const ownerId = (asset as Asset & { property: { ownerId: string } }).property.ownerId;
    if (requesterRole !== UserRole.ADMIN && ownerId !== requesterId) {
      throw new ForbiddenException('Acesso negado a este ativo.');
    }

    return asset;
  }

  // ── Atualizar ativo ────────────────────────────────────────────────────────

  async update(
    id: string,
    requesterId: string,
    requesterRole: UserRole,
    dto: UpdateAssetDto,
  ): Promise<Asset> {
    await this.findById(id, requesterId, requesterRole);

    let nextMaintenanceDate: Date | undefined;
    if (dto.lastMaintenanceDate && dto.maintenanceFrequency) {
      const days = FREQUENCY_DAYS[dto.maintenanceFrequency];
      nextMaintenanceDate = new Date(
        new Date(dto.lastMaintenanceDate).getTime() + days * 86400000,
      );
    }

    return this.prisma.asset.update({
      where: { id },
      data: {
        ...dto,
        lastMaintenanceDate: dto.lastMaintenanceDate
          ? new Date(dto.lastMaintenanceDate)
          : undefined,
        nextMaintenanceDate: dto.nextMaintenanceDate
          ? new Date(dto.nextMaintenanceDate)
          : nextMaintenanceDate,
      },
    });
  }

  // ── Soft-delete ───────────────────────────────────────────────────────────

  async remove(id: string, requesterId: string, requesterRole: UserRole): Promise<void> {
    await this.findById(id, requesterId, requesterRole);
    await this.prisma.asset.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ── QR Code ───────────────────────────────────────────────────────────────

  async getQrCode(
    assetId: string,
    requesterId: string,
    requesterRole: UserRole,
  ): Promise<{ qrCodeDataUrl: string; qrCodePayload: string; assetId: string; assetName: string }> {
    const asset = await this.findById(assetId, requesterId, requesterRole);

    if (!asset.qrCode) {
      // Gera QR Code lazy se não existir
      const qrCode = uuidv4();
      await this.prisma.asset.update({ where: { id: assetId }, data: { qrCode } });
      asset.qrCode = qrCode;
    }

    // Payload: deep link para o app
    const deepLinkPayload = JSON.stringify({
      type: 'asset',
      id: assetId,
      qr: asset.qrCode,
    });

    const qrCodeDataUrl = await QRCode.toDataURL(deepLinkPayload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 400,
      color: { dark: '#1E3A5F', light: '#FFFFFF' },
    });

    return {
      qrCodeDataUrl,
      qrCodePayload: deepLinkPayload,
      assetId,
      assetName: asset.name,
    };
  }

  /** Busca ativo pelo UUID do QR Code (escaneado pelo técnico) */
  async findByQrCode(qrCode: string): Promise<Asset> {
    const asset = await this.prisma.asset.findFirst({
      where: { qrCode, deletedAt: null },
      include: {
        property: {
          select: { id: true, name: true, ownerId: true, city: true, state: true },
        },
      },
    });
    if (!asset) throw new NotFoundException('QR Code inválido ou ativo não encontrado.');
    return asset;
  }

  // ── Helper privado ─────────────────────────────────────────────────────────

  private async assertPropertyAccess(
    propertyId: string,
    requesterId: string,
    role: UserRole,
  ): Promise<void> {
    if (role === UserRole.ADMIN || role === UserRole.TECHNICIAN) return;

    const property = await this.prisma.property.findFirst({
      where: { id: propertyId, deletedAt: null },
      select: { ownerId: true },
    });

    if (!property) throw new NotFoundException('Imóvel não encontrado.');
    if (property.ownerId !== requesterId) {
      throw new ForbiddenException('Acesso negado a este imóvel.');
    }
  }
}
