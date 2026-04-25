// ─── Enums compartilhados entre mobile, web e API ───────────────────────────

export enum UserRole {
  OWNER = 'OWNER',       // Proprietário
  TECHNICIAN = 'TECHNICIAN', // Técnico
  ADMIN = 'ADMIN',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION',
}

export enum PropertyType {
  RESIDENTIAL = 'RESIDENTIAL',   // Residência
  CLINIC = 'CLINIC',             // Clínica
  COMMERCE = 'COMMERCE',         // Comércio
  MIXED = 'MIXED',               // Uso misto
}

export enum ServiceOrderStatus {
  DRAFT = 'DRAFT',               // Rascunho
  PENDING = 'PENDING',           // Aguardando técnico
  ASSIGNED = 'ASSIGNED',         // Técnico designado
  IN_PROGRESS = 'IN_PROGRESS',   // Em execução
  AWAITING_APPROVAL = 'AWAITING_APPROVAL', // Aguardando aprovação do proprietário
  APPROVED = 'APPROVED',         // Aprovada pelo proprietário
  COMPLETED = 'COMPLETED',       // Concluída
  CANCELLED = 'CANCELLED',       // Cancelada
  ON_HOLD = 'ON_HOLD',           // Em espera
}

export enum ServiceOrderPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
  EMERGENCY = 'EMERGENCY',
}

export enum ServiceOrderType {
  PREVENTIVE = 'PREVENTIVE',     // Manutenção preventiva
  CORRECTIVE = 'CORRECTIVE',     // Manutenção corretiva
  INSPECTION = 'INSPECTION',     // Inspeção predial (NBR 16747)
  EMERGENCY = 'EMERGENCY',       // Emergência
  REFORM = 'REFORM',             // Reforma (NBR 16280)
}

export enum ChecklistItemStatus {
  PENDING = 'PENDING',
  CONFORMING = 'CONFORMING',     // Conforme
  NON_CONFORMING = 'NON_CONFORMING', // Não conforme
  NOT_APPLICABLE = 'NOT_APPLICABLE', // N/A
  REQUIRES_MONITORING = 'REQUIRES_MONITORING', // Requer acompanhamento
}

export enum AssetStatus {
  OPERATIONAL = 'OPERATIONAL',
  UNDER_MAINTENANCE = 'UNDER_MAINTENANCE',
  DEACTIVATED = 'DEACTIVATED',
  SCRAPPED = 'SCRAPPED',
}

export enum ContractStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

export enum ContractPlan {
  BASIC = 'BASIC',
  STANDARD = 'STANDARD',
  PREMIUM = 'PREMIUM',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  RECEIVED = 'RECEIVED',
  OVERDUE = 'OVERDUE',
  REFUNDED = 'REFUNDED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentMethod {
  PIX = 'PIX',
  CREDIT_CARD = 'CREDIT_CARD',
  BOLETO = 'BOLETO',
  DEBIT_CARD = 'DEBIT_CARD',
}

export enum NotificationType {
  SERVICE_ORDER_CREATED = 'SERVICE_ORDER_CREATED',
  SERVICE_ORDER_UPDATED = 'SERVICE_ORDER_UPDATED',
  SERVICE_ORDER_COMPLETED = 'SERVICE_ORDER_COMPLETED',
  TECHNICIAN_ASSIGNED = 'TECHNICIAN_ASSIGNED',
  TECHNICIAN_EN_ROUTE = 'TECHNICIAN_EN_ROUTE',
  PAYMENT_DUE = 'PAYMENT_DUE',
  PAYMENT_CONFIRMED = 'PAYMENT_CONFIRMED',
  REPORT_READY = 'REPORT_READY',
  MAINTENANCE_DUE = 'MAINTENANCE_DUE',   // Manutenção preventiva vencendo
  CONTRACT_EXPIRING = 'CONTRACT_EXPIRING',
  EMERGENCY_ALERT = 'EMERGENCY_ALERT',
}

export enum ReportStatus {
  DRAFT = 'DRAFT',
  GENERATED = 'GENERATED',
  SIGNED = 'SIGNED',           // Assinado pelo técnico
  DELIVERED = 'DELIVERED',     // Enviado ao proprietário
}

/** Normas ABNT aplicáveis */
export enum AbntNorm {
  NBR_5674 = 'NBR_5674',    // Manutenção predial
  NBR_16747 = 'NBR_16747',  // Inspeção predial
  NBR_14037 = 'NBR_14037',  // Manual do proprietário
  NBR_15575 = 'NBR_15575',  // Desempenho
  NBR_16280 = 'NBR_16280',  // Reformas
  NBR_9077 = 'NBR_9077',    // Saídas de emergência
}

export enum MaintenanceFrequency {
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY',
  QUARTERLY = 'QUARTERLY',
  SEMIANNUAL = 'SEMIANNUAL',
  ANNUAL = 'ANNUAL',
  BIENNIAL = 'BIENNIAL',
}

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  EXPORT = 'EXPORT',
  PAYMENT = 'PAYMENT',
  SIGNATURE = 'SIGNATURE',
}
