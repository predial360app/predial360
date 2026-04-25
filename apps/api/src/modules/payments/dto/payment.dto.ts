import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum PaymentMethodDto {
  PIX = 'PIX',
  CREDIT_CARD = 'CREDIT_CARD',
  BOLETO = 'BOLETO',
}

export class CreatePixChargeDto {
  @ApiProperty({ description: 'UUID da OS a ser cobrada', example: 'os-uuid' })
  @IsUUID()
  serviceOrderId!: string;

  @ApiProperty({ description: 'Valor em centavos (ex: 35000 = R$ 350,00)', example: 35000 })
  @IsInt()
  @IsPositive()
  @Min(100) // mínimo R$ 1,00
  @Type(() => Number)
  amountCents!: number;

  @ApiProperty({
    description: 'Descrição da cobrança',
    example: 'Manutenção preventiva ar condicionado — OS-2024-00001',
  })
  @IsString()
  @MinLength(5)
  description!: string;

  @ApiPropertyOptional({
    description: 'Data de vencimento (ISO 8601). Default: hoje + 3 dias.',
    example: '2024-06-20',
  })
  @IsOptional()
  @IsString()
  dueDate?: string;
}

export class AsaasWebhookDto {
  @ApiProperty({ example: 'PAYMENT_CONFIRMED' })
  @IsString()
  @IsNotEmpty()
  event!: string;

  @ApiProperty()
  payment!: {
    id: string;
    status: string;
    value: number;
    billingType: string;
    paymentDate?: string;
    invoiceUrl?: string;
  };
}
