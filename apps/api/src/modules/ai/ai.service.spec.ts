/**
 * AiService — testes unitários
 * ─────────────────────────────────────────────────────────────────────────────
 * Cobre:
 *  - 6 métodos de streaming (1 por endpoint)
 *  - analyzeCompliance (não-streaming)
 *  - Retry com exponential backoff (3 tentativas)
 *  - Fallback de parse JSON inválido
 *  - NotFoundException para recursos não encontrados
 *  - Envio do evento SSE "error" quando API falha definitivamente
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';

import { AiService } from './ai.service';
import { PrismaService } from '../../database/prisma.service';

// ─── Mock do Anthropic SDK ───────────────────────────────────────────────────

const mockFinalMessage = jest.fn().mockResolvedValue({
  usage: { input_tokens: 100, output_tokens: 80 },
  content: [{ type: 'text', text: '{"result":"ok","score":85}' }],
});

/** Cria um mock de stream SSE com os chunks fornecidos */
function makeStream(chunks: string[] = ['{"result":', '"ok"}']) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const text of chunks) {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text } };
      }
    },
    finalMessage: mockFinalMessage,
  };
}

/** Mock de stream que lança erro na iteração */
function makeFailingStream(errorMessage = 'Network error') {
  return {
    [Symbol.asyncIterator]: async function* (): AsyncGenerator<never> {
      throw new Error(errorMessage);
      // eslint-disable-next-line no-unreachable
      yield {} as never;
    },
    finalMessage: jest.fn(),
  };
}

const mockMessagesStream = jest.fn();
const mockMessagesCreate = jest.fn();

jest.mock('@anthropic-ai/sdk', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      messages: {
        stream: mockMessagesStream,
        create: mockMessagesCreate,
      },
    })),
  };
});

// ─── Mocks de infraestrutura ─────────────────────────────────────────────────

const mockConfigService = {
  getOrThrow: jest.fn((key: string) => {
    if (key === 'app.anthropic.apiKey') return 'sk-ant-test';
    throw new Error(`Config not found: ${key}`);
  }),
  get: jest.fn((key: string, def?: string) => {
    if (key === 'app.anthropic.model') return 'claude-sonnet-4-6';
    return def;
  }),
};

const mockProperty = {
  type: 'RESIDENTIAL',
  name: 'Apto Teste',
  buildingAge: 10,
  city: 'São Paulo',
  state: 'SP',
  id: 'prop-001',
  assets: [],
  serviceOrders: [],
};

const mockChecklist = {
  id: 'check-001',
  title: 'Inspeção Elétrica',
  applicableNorms: ['NBR_5674'],
  items: [
    {
      title: 'Quadro de distribuição',
      status: 'CONFORMING',
      normReference: 'NBR 5410',
      technicianNote: null,
      measurementValue: null,
      measurementUnit: null,
      measurementInRange: null,
    },
  ],
  serviceOrder: {
    property: {
      name: 'Apto Teste',
      type: 'RESIDENTIAL',
      city: 'São Paulo',
      state: 'SP',
      buildingAge: 10,
    },
  },
};

const mockPrisma = {
  property: { findFirst: jest.fn() },
  checklist: { findFirst: jest.fn() },
};

// ─── Mock Response (SSE) ─────────────────────────────────────────────────────

function makeMockRes(headersSent = false) {
  return {
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    headersSent,
  };
}

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('AiService', () => {
  let service: AiService;

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers(); // Controla setTimeout para testar retry sem esperar

    // Defaults
    mockMessagesStream.mockReturnValue(makeStream());
    mockMessagesCreate.mockResolvedValue({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            complianceScore: 85,
            riskLevel: 'LOW',
            nonConformities: [],
            recommendations: ['Manter periodicidade de inspeção.'],
          }),
        },
      ],
      usage: { input_tokens: 80, output_tokens: 40 },
    });

    mockPrisma.property.findFirst.mockResolvedValue(mockProperty);
    mockPrisma.checklist.findFirst.mockResolvedValue(mockChecklist);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AiService>(AiService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── 1. streamPreventivePlan ───────────────────────────────────────────────

  describe('streamPreventivePlan', () => {
    it('deve configurar headers SSE e fazer streaming do plano preventivo', async () => {
      const res = makeMockRes();

      await service.streamPreventivePlan(
        { propertyId: 'prop-001', systems: ['ELECTRICAL', 'HYDRAULIC'], buildingAge: 10 },
        res as never,
      );

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
      expect(res.flushHeaders).toHaveBeenCalled();
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: preventive-plan'));
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: done'));
      expect(res.end).toHaveBeenCalled();
    });

    it('deve incluir token usage no evento done', async () => {
      const res = makeMockRes();
      await service.streamPreventivePlan(
        { propertyId: 'prop-001', systems: ['HVAC'], buildingAge: 5 },
        res as never,
      );

      const doneCall = (res.write as jest.Mock).mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes('event: done'),
      );
      const doneData = JSON.parse((doneCall![0] as string).split('data: ')[1]) as {
        done: boolean;
        usage: { input_tokens: number; output_tokens: number };
      };
      expect(doneData.done).toBe(true);
      expect(doneData.usage.input_tokens).toBe(100);
    });

    it('deve lançar NotFoundException para imóvel inexistente', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(null);
      const res = makeMockRes();

      await expect(
        service.streamPreventivePlan(
          { propertyId: 'nao-existe', systems: [], buildingAge: 0 },
          res as never,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── 2. streamChecklist ────────────────────────────────────────────────────

  describe('streamChecklist', () => {
    it('deve fazer streaming do checklist gerado pela IA', async () => {
      const res = makeMockRes();

      await service.streamChecklist(
        { serviceType: 'PREVENTIVE', propertyType: 'RESIDENTIAL' },
        res as never,
      );

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: checklist'));
      expect(res.end).toHaveBeenCalled();
    });

    it('deve passar serviceType e propertyType corretamente ao prompt', async () => {
      const res = makeMockRes();
      await service.streamChecklist(
        { serviceType: 'EMERGENCY', propertyType: 'CLINIC' },
        res as never,
      );

      const streamCall = mockMessagesStream.mock.calls[0][0] as { messages: Array<{ content: string }> };
      expect(streamCall.messages[0].content).toContain('EMERGENCY');
      expect(streamCall.messages[0].content).toContain('CLINIC');
    });
  });

  // ── 3. streamVisualDiagnosis ──────────────────────────────────────────────

  describe('streamVisualDiagnosis', () => {
    it('deve enviar imagem como content block de visão', async () => {
      const res = makeMockRes();

      await service.streamVisualDiagnosis(
        {
          imageBase64: 'base64encodedimage',
          context: 'Umidade na parede',
          mimeType: 'image/jpeg',
        },
        res as never,
      );

      const streamCall = mockMessagesStream.mock.calls[0][0] as {
        messages: Array<{ content: Array<{ type: string; source?: { type: string; data: string } }> }>;
      };
      const content = streamCall.messages[0].content;
      const imageBlock = content.find((c) => c.type === 'image');

      expect(imageBlock).toBeDefined();
      expect(imageBlock?.source?.type).toBe('base64');
      expect(imageBlock?.source?.data).toBe('base64encodedimage');
    });

    it('deve usar image/jpeg como mimeType padrão quando não informado', async () => {
      const res = makeMockRes();

      await service.streamVisualDiagnosis(
        { imageBase64: 'abc', context: 'teste' },
        res as never,
      );

      const streamCall = mockMessagesStream.mock.calls[0][0] as {
        messages: Array<{ content: Array<{ source?: { media_type: string } }> }>;
      };
      const imageBlock = streamCall.messages[0].content[0];
      expect(imageBlock?.source?.media_type).toBe('image/jpeg');
    });
  });

  // ── 4. streamReportDraft ──────────────────────────────────────────────────

  describe('streamReportDraft', () => {
    it('deve buscar checklist e incluir dados no prompt', async () => {
      const res = makeMockRes();

      await service.streamReportDraft(
        { checklistId: 'check-001', technicianId: 'tech-001' },
        res as never,
      );

      expect(mockPrisma.checklist.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'check-001' } }),
      );
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: report-draft'));
    });

    it('deve lançar NotFoundException para checklist inexistente', async () => {
      mockPrisma.checklist.findFirst.mockResolvedValue(null);
      const res = makeMockRes();

      await expect(
        service.streamReportDraft({ checklistId: 'nao-existe', technicianId: 'tech-001' }, res as never),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── 5. streamAbntScore ────────────────────────────────────────────────────

  describe('streamAbntScore', () => {
    it('deve buscar histórico do imóvel e streamar score ABNT', async () => {
      const res = makeMockRes();

      await service.streamAbntScore({ propertyId: 'prop-001' }, res as never);

      expect(mockPrisma.property.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'prop-001', deletedAt: null },
        }),
      );
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: abnt-score'));
      expect(res.end).toHaveBeenCalled();
    });

    it('deve incluir dados de ativos e OSs no prompt enviado à IA', async () => {
      mockPrisma.property.findFirst.mockResolvedValue({
        ...mockProperty,
        assets: [
          {
            name: 'Ar condicionado sala',
            category: 'HVAC',
            status: 'OPERATIONAL',
            lastMaintenanceDate: new Date('2024-01-01'),
            nextMaintenanceDate: new Date('2024-07-01'),
            maintenanceFrequency: 'SEMIANNUAL',
            applicableNorms: ['NBR_5674'],
          },
        ],
        serviceOrders: [
          {
            type: 'PREVENTIVE',
            status: 'COMPLETED',
            priority: 'MEDIUM',
            completedAt: new Date('2024-03-15'),
            applicableNorms: ['NBR_5674'],
            aiComplianceScore: 90,
          },
        ],
      });

      const res = makeMockRes();
      await service.streamAbntScore({ propertyId: 'prop-001' }, res as never);

      const streamCall = mockMessagesStream.mock.calls[0][0] as { messages: Array<{ content: string }> };
      expect(streamCall.messages[0].content).toContain('HVAC');
      expect(streamCall.messages[0].content).toContain('SEMIANNUAL');
    });

    it('deve lançar NotFoundException para imóvel inexistente', async () => {
      mockPrisma.property.findFirst.mockResolvedValue(null);
      const res = makeMockRes();

      await expect(
        service.streamAbntScore({ propertyId: 'nao-existe' }, res as never),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ── 6. streamTranslateTechnical ───────────────────────────────────────────

  describe('streamTranslateTechnical', () => {
    it('deve fazer streaming da tradução do texto técnico', async () => {
      const res = makeMockRes();

      await service.streamTranslateTechnical(
        {
          technicalText:
            'Constatou-se infiltração por capilaridade ascendente com degradação das argamassas ' +
            'de revestimento conforme NBR 15575:2013 §8.4.',
        },
        res as never,
      );

      expect(res.write).toHaveBeenCalledWith(
        expect.stringContaining('event: translate-technical'),
      );
      expect(res.end).toHaveBeenCalled();
    });

    it('deve incluir o texto técnico original no prompt', async () => {
      const res = makeMockRes();
      const technicalText = 'Texto técnico de engenharia';

      await service.streamTranslateTechnical({ technicalText }, res as never);

      const streamCall = mockMessagesStream.mock.calls[0][0] as { messages: Array<{ content: string }> };
      expect(streamCall.messages[0].content).toContain(technicalText);
    });

    it('deve usar max_tokens 1024 (resposta mais curta que outros endpoints)', async () => {
      const res = makeMockRes();
      await service.streamTranslateTechnical({ technicalText: 'Texto de teste técnico x' }, res as never);

      const streamCall = mockMessagesStream.mock.calls[0][0] as { max_tokens: number };
      expect(streamCall.max_tokens).toBe(1024);
    });
  });

  // ── Retry com exponential backoff ────────────────────────────────────────

  describe('retry com exponential backoff', () => {
    it('deve tentar 3 vezes com backoff e enviar evento error após todas as falhas', async () => {
      // Todas as 3 tentativas falham
      mockMessagesStream
        .mockReturnValueOnce(makeFailingStream('Rate limit exceeded'))
        .mockReturnValueOnce(makeFailingStream('Network timeout'))
        .mockReturnValueOnce(makeFailingStream('Server error'));

      const res = makeMockRes();

      // Avança os timers para o retry não esperar de verdade
      const promise = service.streamChecklist(
        { serviceType: 'PREVENTIVE', propertyType: 'RESIDENTIAL' },
        res as never,
      );
      await jest.runAllTimersAsync();
      await promise;

      // Deve ter tentado 3 vezes
      expect(mockMessagesStream).toHaveBeenCalledTimes(3);

      // Deve emitir evento de erro no SSE
      const errorCall = (res.write as jest.Mock).mock.calls.find((c: unknown[]) =>
        (c[0] as string).includes('event: error'),
      );
      expect(errorCall).toBeDefined();
      expect(res.end).toHaveBeenCalled();
    });

    it('deve ter sucesso na 2ª tentativa após falha na 1ª', async () => {
      mockMessagesStream
        .mockReturnValueOnce(makeFailingStream('Temporary error'))
        .mockReturnValueOnce(makeStream(['{"score":90}']));

      const res = makeMockRes();

      const promise = service.streamChecklist(
        { serviceType: 'INSPECTION', propertyType: 'COMMERCE' },
        res as never,
      );
      await jest.runAllTimersAsync();
      await promise;

      expect(mockMessagesStream).toHaveBeenCalledTimes(2);
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('event: checklist'));
      expect(res.end).toHaveBeenCalled();
    });

    it('deve ter sucesso na 1ª tentativa sem retry', async () => {
      mockMessagesStream.mockReturnValueOnce(makeStream());
      const res = makeMockRes();

      await service.streamChecklist(
        { serviceType: 'CORRECTIVE', propertyType: 'MIXED' },
        res as never,
      );

      expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    });
  });

  // ── analyzeCompliance (não-streaming) ────────────────────────────────────

  describe('analyzeCompliance', () => {
    it('deve retornar score de conformidade parseado da IA', async () => {
      const result = await service.analyzeCompliance('os-001', '[]');

      expect(result).toHaveProperty('complianceScore', 85);
      expect(result).toHaveProperty('riskLevel', 'LOW');
      expect(result.nonConformities).toHaveLength(0);
      expect(result.recommendations).toHaveLength(1);
    });

    it('deve retornar fallback (score=0, riskLevel=HIGH) em caso de JSON inválido', async () => {
      mockMessagesCreate.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'não é um JSON válido ```markdown' }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const result = await service.analyzeCompliance('os-001', '[]');

      expect(result.complianceScore).toBe(0);
      expect(result.riskLevel).toBe('HIGH');
    });

    it('deve fazer retry e lançar ServiceUnavailableException após 3 falhas', async () => {
      const error = new Error('API unavailable');
      mockMessagesCreate
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error)
        .mockRejectedValueOnce(error);

      const promise = service.analyzeCompliance('os-001', '[]');
      await jest.runAllTimersAsync();

      await expect(promise).rejects.toThrow(ServiceUnavailableException);
      expect(mockMessagesCreate).toHaveBeenCalledTimes(3);
    });

    it('deve retornar resultado na 2ª tentativa após 1ª falha', async () => {
      mockMessagesCreate
        .mockRejectedValueOnce(new Error('Transient error'))
        .mockResolvedValueOnce({
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                complianceScore: 72,
                riskLevel: 'MEDIUM',
                nonConformities: [],
                recommendations: [],
              }),
            },
          ],
          usage: { input_tokens: 50, output_tokens: 30 },
        });

      const promise = service.analyzeCompliance('os-002', '[]');
      await jest.runAllTimersAsync();
      const result = await promise;

      expect(result.complianceScore).toBe(72);
      expect(mockMessagesCreate).toHaveBeenCalledTimes(2);
    });
  });

  // ── Parse JSON robusto ────────────────────────────────────────────────────

  describe('parseJsonSafe (via analyzeCompliance)', () => {
    it('deve remover bloco markdown ```json antes de parsear', async () => {
      mockMessagesCreate.mockResolvedValueOnce({
        content: [
          {
            type: 'text',
            text: '```json\n{"complianceScore":95,"riskLevel":"LOW","nonConformities":[],"recommendations":[]}\n```',
          },
        ],
        usage: { input_tokens: 20, output_tokens: 15 },
      });

      const result = await service.analyzeCompliance('os-003', '[]');
      expect(result.complianceScore).toBe(95);
    });

    it('deve usar fallback quando content não é do tipo text', async () => {
      mockMessagesCreate.mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'x', name: 'x', input: {} }],
        usage: { input_tokens: 10, output_tokens: 5 },
      });

      const result = await service.analyzeCompliance('os-004', '[]');
      expect(result.complianceScore).toBe(0);
    });
  });

  // ── System prompt ─────────────────────────────────────────────────────────

  describe('system prompt ABNT', () => {
    it('deve incluir o system prompt em todas as chamadas de streaming', async () => {
      const res = makeMockRes();
      await service.streamChecklist(
        { serviceType: 'PREVENTIVE', propertyType: 'RESIDENTIAL' },
        res as never,
      );

      const streamCall = mockMessagesStream.mock.calls[0][0] as { system: string };
      expect(streamCall.system).toContain('NBR 5674');
      expect(streamCall.system).toContain('JSON válido');
      expect(streamCall.system).toContain('português brasileiro');
    });

    it('deve usar o modelo configurado', async () => {
      const res = makeMockRes();
      await service.streamChecklist(
        { serviceType: 'INSPECTION', propertyType: 'CLINIC' },
        res as never,
      );

      const streamCall = mockMessagesStream.mock.calls[0][0] as { model: string };
      expect(streamCall.model).toBe('claude-sonnet-4-6');
    });
  });
});
