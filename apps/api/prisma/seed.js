/**
 * Predial360 — Seed de demo (vanilla JS, roda no runner Alpine sem ts-node)
 * Credenciais: admin@predial360.com.br / Demo@2025!
 *              joao.silva@email.com    / Demo@2025!
 *              carlos.tech@...        / Demo@2025!
 */
'use strict';

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();
const hash = (pw) => bcrypt.hashSync(pw, 10);
const PASS = 'Demo@2025!';

async function main() {
  console.log('🌱 Seed de demonstração iniciando...');

  // ── Usuários (upsert idempotente) ─────────────────────────────────────────

  const admin = await prisma.user.upsert({
    where: { email: 'admin@predial360.com.br' },
    update: {},
    create: {
      email: 'admin@predial360.com.br',
      passwordHash: hash(PASS),
      name: 'Administrador Predial360',
      phone: '(11) 99999-0000',
      role: 'ADMIN',
      status: 'ACTIVE',
      consentGivenAt: new Date(),
    },
  });

  const owner = await prisma.user.upsert({
    where: { email: 'joao.silva@email.com' },
    update: {},
    create: {
      email: 'joao.silva@email.com',
      passwordHash: hash(PASS),
      name: 'João Silva',
      phone: '(11) 91234-5678',
      cpf: '123.456.789-00',
      role: 'OWNER',
      status: 'ACTIVE',
      consentGivenAt: new Date(),
    },
  });

  const technician = await prisma.user.upsert({
    where: { email: 'carlos.tech@predial360.com.br' },
    update: {},
    create: {
      email: 'carlos.tech@predial360.com.br',
      passwordHash: hash(PASS),
      name: 'Carlos Eduardo Técnico',
      phone: '(11) 98765-4321',
      crea: 'CREA-SP 123456-D',
      role: 'TECHNICIAN',
      status: 'ACTIVE',
      rating: 4.8,
      consentGivenAt: new Date(),
    },
  });

  // ── Imóvel (idempotente por nome+owner) ───────────────────────────────────

  let property = await prisma.property.findFirst({
    where: { ownerId: owner.id, name: 'Edifício Paulista Premium' },
  });

  if (!property) {
    property = await prisma.property.create({
      data: {
        ownerId: owner.id,
        name: 'Edifício Paulista Premium',
        type: 'COMMERCE',
        description: 'Edifício comercial de alto padrão com 15 andares na Av. Paulista',
        street: 'Av. Paulista',
        number: '1578',
        neighborhood: 'Bela Vista',
        city: 'São Paulo',
        state: 'SP',
        zipCode: '01310-200',
        latitude: -23.5614,
        longitude: -46.6557,
        totalArea: 4500,
        floors: 15,
        units: 120,
        constructionYear: 2005,
        registrationNumber: 'SP-12345-67',
      },
    });
    console.log('  ✓ Imóvel criado:', property.name);
  } else {
    console.log('  ℹ️  Imóvel já existe:', property.name);
  }

  // ── Ativo (idempotente por serialNumber) ──────────────────────────────────

  let asset = await prisma.asset.findFirst({
    where: { propertyId: property.id, serialNumber: 'TK-EV-2005-001' },
  });

  if (!asset) {
    asset = await prisma.asset.create({
      data: {
        propertyId: property.id,
        name: 'Sistema de Elevadores — Bloco A',
        category: 'ELEVATOR',
        brand: 'Thyssenkrupp',
        model: 'Evolution 200',
        serialNumber: 'TK-EV-2005-001',
        installationDate: new Date('2005-06-15'),
        warrantyExpiration: new Date('2015-06-15'),
        maintenanceFrequency: 'MONTHLY',
        applicableNorms: ['NBR_5674'],
        notes: 'Revisão semestral obrigatória — ABNT NBR 5674',
      },
    });
    console.log('  ✓ Ativo criado:', asset.name);
  } else {
    console.log('  ℹ️  Ativo já existe:', asset.name);
  }

  // ── Ordem de Serviço (idempotente por code) ───────────────────────────────

  const currentYear = new Date().getFullYear();
  const osCode = `OS-${currentYear}-00001`;

  let order = await prisma.serviceOrder.findFirst({
    where: { propertyId: property.id, code: osCode },
  });

  if (!order) {
    order = await prisma.serviceOrder.create({
      data: {
        code: osCode,
        propertyId: property.id,
        ownerId: owner.id,
        technicianId: technician.id,
        assetId: asset.id,
        type: 'PREVENTIVE',
        status: 'ASSIGNED',
        priority: 'HIGH',
        title: 'Manutenção Preventiva — Elevadores (NBR 5674)',
        description:
          'Inspeção completa dos sistemas de elevação conforme ABNT NBR 5674. ' +
          'Verificar cabos, freios, painéis de controle e sistemas de segurança.',
        scheduledDate: new Date(Date.now() + 2 * 24 * 3600 * 1000),
        estimatedDurationMinutes: 240,
        estimatedCost: 280000,
        applicableNorms: ['NBR_5674'],
      },
    });
    console.log('  ✓ OS criada:', order.code);
  } else {
    console.log('  ℹ️  OS já existe:', order.code);
  }

  // ── Contrato (idempotente por owner+property) ─────────────────────────────

  const existingContract = await prisma.contract.findFirst({
    where: { ownerId: owner.id, propertyId: property.id },
  });

  if (!existingContract) {
    await prisma.contract.create({
      data: {
        ownerId: owner.id,
        propertyId: property.id,
        plan: 'PROFESSIONAL',
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: new Date(Date.now() + 365 * 24 * 3600 * 1000),
        monthlyAmount: 299,
        autoRenew: true,
      },
    });
    console.log('  ✓ Contrato criado: PROFESSIONAL');
  } else {
    console.log('  ℹ️  Contrato já existe');
  }

  console.log('\n✅ Seed de demonstração concluído!');
  console.log('   Admin:     admin@predial360.com.br / Demo@2025!');
  console.log('   Owner:     joao.silva@email.com / Demo@2025!');
  console.log('   Técnico:   carlos.tech@predial360.com.br / Demo@2025!');
  console.log('   Admin:', admin.email, '| Owner:', owner.email, '| Técnico:', technician.email);
}

main()
  .catch((e) => { console.error('Seed error:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
