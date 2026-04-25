import type { PaymentStatus, PaymentMethod, ContractPlan, ContractStatus } from './enums';

export interface Payment {
  id: string;
  contractId?: string;
  serviceOrderId?: string;
  ownerId: string;
  asaasPaymentId: string;       // ID externo Asaas
  amount: number;               // Em centavos
  status: PaymentStatus;
  method: PaymentMethod;
  description: string;
  dueDate: string;
  paidAt?: string;
  pixQrCode?: string;
  pixCopyPaste?: string;
  boletoUrl?: string;
  boletoBarCode?: string;
  invoiceUrl?: string;
  receiptUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Contract {
  id: string;
  propertyId: string;
  ownerId: string;
  plan: ContractPlan;
  status: ContractStatus;
  startDate: string;
  endDate?: string;
  monthlyAmount: number;        // Em centavos
  billingDay: number;           // Dia do mês 1-28
  asaasSubscriptionId?: string; // Assinatura recorrente Asaas
  includedServices: string[];
  maxServiceOrders?: number;    // Por mês
  autoRenew: boolean;
  cancelledAt?: string;
  cancelReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContractPlanDetails {
  plan: ContractPlan;
  name: string;
  description: string;
  monthlyAmount: number;
  features: string[];
  maxProperties: number;
  maxServiceOrdersPerMonth: number;
  includesEmergency: boolean;
  includesAiReports: boolean;
  includesBodyCam: boolean;
}
