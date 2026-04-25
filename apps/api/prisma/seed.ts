/**
 * Predial360 — Seed de demonstração
 * ─────────────────────────────────────────────────────────────────────────────
 * Popula o banco com dados realistas para o protótipo/preview.
 *
 * Execução:
 *   npm run prisma:seed          (local)
 *   npx ts-node prisma/seed.ts   (direto)
 *
 * Credenciais de acesso criadas:
 *   ADMIN      → admin@predial360.com.br       / Demo@2025!
 *   OWNER      → joao.silva@email.com          / Demo@2025!
 *   TECHNICIAN → carlos.tech@predial360.com.br / Demo@2025!
 */

import {
  PrismaClient,
  UserRole,
  UserStatus,
  PropertyType,
  AssetCategory,
  AssetStatus,
  MaintenanceFrequency,
  ServiceOrderType,
  ServiceOrderStatus,
  ServiceOrderPriority,
  ChecklistItemStatus,
  ReportStatus,
  ContractPlan,
  ContractStatus,
  AbntNorm,
  NotificationType,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const hash = (password: string) => bcrypt.hashSync(password, 10);
const DEMO_PASSWORD = 'Demo@2025!';

// ─── Seed principal ───────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Iniciando seed de demonstração...\n');

  // ── Limpa dados existentes (ordem de dependências) ──────────────────────────
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.report.deleteMany(),
    prisma.checklistItem.deleteMany(),
    prisma.checklist.deleteMany(),
    prisma.serviceOrder.deleteMany(),
    prisma.asset.deleteMany(),
    prisma.contract.deleteMany(),
    prisma.property.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);
  console.log('  ✓ Banco limpo');

  // ── Usuários ──────────────────────────────────────────────────────────────────

  const admin = await prisma.user.create({
    data: {
      email: 'admin@predial360.com.br',
      passwordHash: hash(DEMO_PASSWORD),
      name: 'Administrador Predial360',
      phone: '(11) 99999-0000',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      consentGivenAt: new Date(),
    },
  });

  const owner = await prisma.user.create({
    data: {
      email: 'joao.silva@email.com',
      passwordHash: hash(DEMO_PASSWORD),
      name: 'João Pereira da Silva',
      phone: '(11) 98765-4321',
      cpf: '123.456.789-00',
      role: UserRole.OWNER,
      status: UserStatus.ACTIVE,
      consentGivenAt: new Date(),
    },
  });

  const technician = await prisma.user.create({
    data: {
      email: 'carlos.tech@predial360.com.br',
      passwordHash: hash(DEMO_PASSWORD),
      name: 'Carlos Eduardo Martins',
      phone: '(11) 97654-3210',
      cpf: '987.654.321-00',
      role: UserRole.TECHNICIAN,
      status: UserStatus.ACTIVE,
      crea: 'CREA-SP 123456',
      specialties: ['Elétrica', 'Hidráulica', 'Ar-condicionado'],
      availableForCall: true,
      rating: 4.8,
      totalServices: 127,
      consentGivenAt: new Date(),
    },
  });

  console.log(`  ✓ Usuários criados — admin: ${admin.id.slice(0, 8)}, owner: ${owner.id.slice(0, 8)}, tech: ${technician.id.slice(0, 8)}`);

  // ── Propriedade ───────────────────────────────────────────────────────────────

  const property = await prisma.property.create({
    data: {
      ownerId: owner.id,
      name: 'Edifício Solar das Palmeiras',
      type: PropertyType.RESIDENTIAL,
      description:
        'Edifício residencial com 8 andares e 32 apartamentos. Construído em 2008.',
      street: 'Rua das Palmeiras',
      number: '1240',
      complement: 'Bloco A',
      neighborhood: 'Jardim Paulistano',
      city: 'São Paulo',
      state: 'SP',
      zipCode: '01452-000',
      latitude: -23.5505,
      longitude: -46.6333,
      buildingAge: 17,
      totalArea: 3200,
      floors: 8,
      units: 32,
      constructionYear: 2008,
    },
  });

  console.log('  ✓ Propriedade criada');

  // ── Ativos ────────────────────────────────────────────────────────────────────

  const assetElevator = await prisma.asset.create({
    data: {
      propertyId: property.id,
      name: 'Elevador Social — Bloco A',
      category: AssetCategory.ELEVATOR,
      brand: 'Otis',
      model: 'GeN2',
      serialNumber: 'OT-2008-00421',
      installationDate: new Date('2008-03-15'),
      warrantyExpiration: new Date('2013-03-15'),
      lastMaintenanceDate: new Date('2025-01-10'),
      nextMaintenanceDate: new Date('2025-04-10'),
      maintenanceFrequency: MaintenanceFrequency.QUARTERLY,
      applicableNorms: [AbntNorm.NBR_5674, AbntNorm.NBR_16747],
      status: AssetStatus.OPERATIONAL,
      notes:
        'Última revisão: substituição de cabos. Próxima: verificação freios.',
    },
  });

  const assetAc = await prisma.asset.create({
    data: {
      propertyId: property.id,
      name: 'Sistema de Ar-condicionado Central',
      category: AssetCategory.HVAC,
      brand: 'Carrier',
      model: 'XPower 48000 BTU',
      serialNumber: 'CA-2015-88734',
      installationDate: new Date('2015-06-20'),
      warrantyExpiration: new Date('2020-06-20'),
      lastMaintenanceDate: new Date('2024-12-05'),
      nextMaintenanceDate: new Date('2025-06-05'),
      maintenanceFrequency: MaintenanceFrequency.SEMIANNUAL,
      applicableNorms: [AbntNorm.NBR_5674],
      status: AssetStatus.UNDER_MAINTENANCE,
      notes: 'Compressor com ruído anormal. Aguardando peça de reposição.',
    },
  });

  const assetGenerator = await prisma.asset.create({
    data: {
      propertyId: property.id,
      name: 'Gerador de Emergência',
      category: AssetCategory.GENERATOR,
      brand: 'Cummins',
      model: 'C50D6',
      serialNumber: 'CM-2010-00156',
      installationDate: new Date('2010-08-01'),
      lastMaintenanceDate: new Date('2025-02-01'),
      nextMaintenanceDate: new Date('2025-08-01'),
      maintenanceFrequency: MaintenanceFrequency.SEMIANNUAL,
      applicableNorms: [AbntNorm.NBR_5674, AbntNorm.NBR_9077],
      status: AssetStatus.OPERATIONAL,
    },
  });

  console.log('  ✓ Ativos criados (3)');

  // ── Ordens de Serviço ─────────────────────────────────────────────────────────

  const osInProgress = await prisma.serviceOrder.create({
    data: {
      code: 'OS-2025-00001',
      propertyId: property.id,
      ownerId: owner.id,
      technicianId: technician.id,
      assetId: assetAc.id,
      type: ServiceOrderType.CORRECTIVE,
      status: ServiceOrderStatus.IN_PROGRESS,
      priority: ServiceOrderPriority.HIGH,
      title: 'Reparo no compressor do ar-condicionado central',
      description:
        'Compressor apresentando ruído anormal e queda de eficiência. ' +
        'Diagnóstico preliminar indica desgaste nos rolamentos. ' +
        'Necessário verificar fluido refrigerante e pressão do sistema.',
      applicableNorms: [AbntNorm.NBR_5674],
      scheduledDate: new Date('2025-04-22T09:00:00'),
      startedAt: new Date('2025-04-22T09:15:00'),
      estimatedDurationMinutes: 180,
      estimatedCost: 2800.0,
      ownerNotes: 'Urgente — moradores reclamando do calor.',
      technicianNotes: 'Rolamentos desgastados. Peça encomendada.',
      technicianLatitude: -23.5505,
      technicianLongitude: -46.6333,
    },
  });

  const osAwaiting = await prisma.serviceOrder.create({
    data: {
      code: 'OS-2025-00002',
      propertyId: property.id,
      ownerId: owner.id,
      technicianId: technician.id,
      assetId: assetElevator.id,
      type: ServiceOrderType.PREVENTIVE,
      status: ServiceOrderStatus.AWAITING_APPROVAL,
      priority: ServiceOrderPriority.MEDIUM,
      title: 'Manutenção preventiva trimestral do elevador',
      description:
        'Revisão completa conforme NBR 5674 e NBR 16747. ' +
        'Verificação de cabos, freios, portas, iluminação e sistemas de segurança.',
      applicableNorms: [AbntNorm.NBR_5674, AbntNorm.NBR_16747],
      scheduledDate: new Date('2025-04-20T08:00:00'),
      startedAt: new Date('2025-04-20T08:10:00'),
      completedAt: new Date('2025-04-20T11:30:00'),
      estimatedDurationMinutes: 210,
      actualDurationMinutes: 200,
      estimatedCost: 950.0,
      finalCost: 950.0,
      technicianNotes:
        'Serviço realizado. Cabos em bom estado. Próxima revisão em 90 dias.',
      aiComplianceScore: 92,
      aiRiskLevel: 'LOW',
    },
  });

  const osCompleted = await prisma.serviceOrder.create({
    data: {
      code: 'OS-2025-00003',
      propertyId: property.id,
      ownerId: owner.id,
      technicianId: technician.id,
      assetId: assetGenerator.id,
      type: ServiceOrderType.PREVENTIVE,
      status: ServiceOrderStatus.COMPLETED,
      priority: ServiceOrderPriority.LOW,
      title: 'Revisão semestral do gerador de emergência',
      description:
        'Verificação de óleo, filtros, baterias e teste de carga conforme NBR 9077.',
      applicableNorms: [AbntNorm.NBR_9077],
      scheduledDate: new Date('2025-02-01T07:00:00'),
      startedAt: new Date('2025-02-01T07:05:00'),
      completedAt: new Date('2025-02-01T09:45:00'),
      estimatedDurationMinutes: 150,
      actualDurationMinutes: 160,
      estimatedCost: 600.0,
      finalCost: 680.0,
      technicianNotes:
        'Filtro de óleo substituído. Bateria 70% — substituição recomendada até 2026.',
      rating: 5,
      ratingComment: 'Excelente profissional! Pontual e muito detalhista.',
      ratedAt: new Date('2025-02-02'),
      aiComplianceScore: 98,
      aiRiskLevel: 'LOW',
    },
  });

  const osPending = await prisma.serviceOrder.create({
    data: {
      code: 'OS-2025-00004',
      propertyId: property.id,
      ownerId: owner.id,
      type: ServiceOrderType.INSPECTION,
      status: ServiceOrderStatus.PENDING,
      priority: ServiceOrderPriority.MEDIUM,
      title: 'Inspeção geral da fachada — NBR 15575',
      description:
        'Inspeção visual da fachada completa. Verificar fissuras, ' +
        'infiltrações e destacamento de revestimento.',
      applicableNorms: [AbntNorm.NBR_15575, AbntNorm.NBR_5674],
      scheduledDate: new Date('2025-05-10T09:00:00'),
      estimatedDurationMinutes: 240,
      estimatedCost: 1200.0,
      ownerNotes: 'Manchas de umidade no 3º andar. Urgente.',
    },
  });

  console.log('  ✓ Ordens de serviço criadas (4)');

  // ── Checklist ─────────────────────────────────────────────────────────────────

  await prisma.checklist.create({
    data: {
      serviceOrderId: osAwaiting.id,
      technicianId: technician.id,
      templateName: 'Manutenção Preventiva — Elevador (NBR 5674/16747)',
      completedAt: new Date('2025-04-20T11:00:00'),
      items: {
        create: [
          { description: 'Verificar tensão do cabo de tração', status: ChecklistItemStatus.CONFORMING, notes: 'Tensão: 450N — dentro dos parâmetros', norm: AbntNorm.NBR_16747, order: 1 },
          { description: 'Inspecionar desgaste do cabo de tração', status: ChecklistItemStatus.CONFORMING, notes: 'Desgaste < 5% — tolerável', norm: AbntNorm.NBR_16747, order: 2 },
          { description: 'Testar sistema de freios', status: ChecklistItemStatus.CONFORMING, notes: 'Freio eletromecânico OK', norm: AbntNorm.NBR_5674, order: 3 },
          { description: 'Verificar iluminação da cabine', status: ChecklistItemStatus.CONFORMING, notes: 'Todas as LEDs operacionais', norm: AbntNorm.NBR_5674, order: 4 },
          { description: 'Inspecionar portas e acionamento', status: ChecklistItemStatus.CONFORMING, notes: 'Portas sem atraso', norm: AbntNorm.NBR_16747, order: 5 },
          { description: 'Verificar botoeiras e sinalização', status: ChecklistItemStatus.CONFORMING, notes: 'Todos os botões responsivos', norm: AbntNorm.NBR_5674, order: 6 },
          { description: 'Testar interfone de emergência', status: ChecklistItemStatus.CONFORMING, notes: 'Comunicação clara com portaria', norm: AbntNorm.NBR_9077, order: 7 },
          { description: 'Lubrificar guias e roldanas', status: ChecklistItemStatus.CONFORMING, notes: 'Lubrificação aplicada', norm: AbntNorm.NBR_5674, order: 8 },
          { description: 'Checar dispositivos de segurança (para-quedas)', status: ChecklistItemStatus.CONFORMING, notes: 'Para-quedas em perfeita condição', norm: AbntNorm.NBR_16747, order: 9 },
          { description: 'Verificar nível de óleo do motor', status: ChecklistItemStatus.REQUIRES_MONITORING, notes: 'Nível levemente baixo — monitorar', norm: AbntNorm.NBR_5674, order: 10 },
        ],
      },
    },
  });

  console.log('  ✓ Checklist criado (10 itens)');

  // ── Laudo técnico ─────────────────────────────────────────────────────────────

  await prisma.report.create({
    data: {
      serviceOrderId: osAwaiting.id,
      technicianId: technician.id,
      propertyId: property.id,
      status: ReportStatus.GENERATED,
      title: 'Laudo Técnico — Manutenção Preventiva Elevador OS-2025-00002',
      content: JSON.stringify({
        summary: 'Manutenção preventiva realizada conforme NBR 5674 e NBR 16747.',
        findings: [
          'Sistema de tração em bom estado — vida útil estimada 36 meses',
          'Sistema de freios dentro dos parâmetros de segurança',
          'Nível de óleo do motor levemente abaixo — monitorar',
          'Todos os dispositivos de segurança operacionais',
        ],
        recommendations: [
          'Monitorar nível de óleo nas próximas 2 revisões',
          'Agendar próxima preventiva para julho/2025',
        ],
        complianceScore: 92,
        riskLevel: 'BAIXO',
      }),
      abntScore: 92,
      applicableNorms: [AbntNorm.NBR_5674, AbntNorm.NBR_16747],
      generatedAt: new Date('2025-04-20T12:00:00'),
    },
  });

  console.log('  ✓ Laudo técnico criado');

  // ── Contrato Premium ──────────────────────────────────────────────────────────

  await prisma.contract.create({
    data: {
      propertyId: property.id,
      ownerId: owner.id,
      plan: ContractPlan.PREMIUM,
      status: ContractStatus.ACTIVE,
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31'),
      monthlyValue: 899.0,
      totalValue: 10788.0,
      includedServices: [
        'Manutenção preventiva mensal',
        'Atendimento de emergência 24h',
        'Relatórios técnicos digitais',
        'Score de conformidade ABNT',
        'App para proprietário e técnico',
        'Bodycam em todas as visitas',
      ],
      maxServiceOrders: 24,
      signedAt: new Date('2025-01-01'),
    },
  });

  console.log('  ✓ Contrato criado (Premium anual)');

  // ── Notificações ──────────────────────────────────────────────────────────────

  await prisma.notification.createMany({
    data: [
      {
        userId: owner.id,
        type: NotificationType.TECHNICIAN_ASSIGNED,
        title: 'Técnico atribuído à sua OS',
        body: 'Carlos Eduardo Martins foi atribuído à OS-2025-00001.',
        read: false,
        data: { serviceOrderId: osInProgress.id },
      },
      {
        userId: owner.id,
        type: NotificationType.REPORT_READY,
        title: 'Laudo técnico disponível para aprovação',
        body: 'O laudo da OS-2025-00002 (Elevador) está pronto.',
        read: false,
        data: { serviceOrderId: osAwaiting.id },
      },
      {
        userId: owner.id,
        type: NotificationType.MAINTENANCE_DUE,
        title: 'Manutenção preventiva em 15 dias',
        body: 'O ar-condicionado central vence a próxima manutenção em breve.',
        read: true,
        data: { assetId: assetAc.id },
      },
      {
        userId: technician.id,
        type: NotificationType.SERVICE_ORDER_CREATED,
        title: 'Nova OS atribuída',
        body: 'OS-2025-00001 — Reparo ar-condicionado. Início: hoje às 09h.',
        read: true,
        data: { serviceOrderId: osInProgress.id },
      },
    ],
  });

  console.log('  ✓ Notificações criadas (4)');

  // ── Resumo ────────────────────────────────────────────────────────────────────

  console.log('\n✅ Seed concluído!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  CREDENCIAIS DE ACESSO (senha: Demo@2025!)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  👤 ADMIN      → admin@predial360.com.br');
  console.log('  🏠 PROPRIETÁRIO → joao.silva@email.com');
  console.log('  🔧 TÉCNICO    → carlos.tech@predial360.com.br');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  1 propriedade · 3 ativos · 4 OS · 1 checklist · 1 contrato');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Suprime warnings de variáveis não usadas
  void osCompleted;
  void osPending;
}

main()
  .catch((e) => {
    console.error('❌ Erro no seed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
