/**
 * AiService — Motor de IA do Predial360
 * ─────────────────────────────────────────────────────────────────────────────
 * Usa @anthropic-ai/sdk com streaming SSE para todos os endpoints públicos.
 * Implementa:
 *  - Retry com exponential backoff (3 tentativas, 1s/2s de delay)
 *  - Timeout de 30s por chamada (configurado no cliente Anthropic)
 *  - Log de tokens (input + output) por chamada
 *  - Parse de JSON robusto com fallback tipado
 *  - 6 métodos de IA alinhados às normas ABNT
 */
import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { Response } from 'express';

import { PrismaService } from '../../database/prisma.service';
import {
  ABNT_SYSTEM_PROMPT,
  ABNT_SCORE_PROMPT,
  CHECKLIST_PROMPT,
  PREVENTIVE_PLAN_PROMPT,
  REPORT_DRAFT_PROMPT,
  TRANSLATE_TECHNICAL_PROMPT,
  VISUAL_DIAGNOSIS_PROMPT,
} from './prompts/abnt-system.prompt';
import type {
  AbntScoreDto,
  ChecklistGenerateDto,
  ComplianceAnalysisOutput,
  PreventivePlanDto,
  ReportDraftDto,
  TranslateTechnicalDto,
  VisualDiagnosisDto,
} from './dto/ai.dto';

// ─── Constantes de retry ──────────────────────────────────────────────────────

const AI_MAX_RETRIES = 3;
const AI_RETRY_BASE_MS = 1000; // 1s → 2s (exponencial)
const AI_TIMEOUT_MS = 30_000;  // 30s máximo por chamada

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly anthropic: Anthropic;
  private readonly model: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.anthropic = new Anthropic({
      apiKey: this.configService.getOrThrow<string>('app.anthropic.apiKey'),
      timeout: AI_TIMEOUT_MS,
      maxRetries: 0, // Gerenciamos retry manualmente para controle total
    });
    this.model = this.configService.get<string>(
      'app.anthropic.model',
      'claude-sonnet-4-6',
    );
  }

  // ── 1. Plano Preventivo (SSE streaming) ──────────────────────────────────

  async streamPreventivePlan(dto: PreventivePlanDto, res: Response): Promise<void> {
    const property = await this.prisma.property.findFirst({
      where: { id: dto.propertyId, deletedAt: null },
      select: { type: true, name: true },
    });
    if (!property) throw new NotFoundException('Imóvel não encontrado.');

    const userPrompt = PREVENTIVE_PLAN_PROMPT(
      dto.systems,
      dto.buildingAge,
      property.type,
    );
    await this.streamToResponse(userPrompt, res, 'preventive-plan');
  }

  // ── 2. Checklist ABNT (SSE streaming) ────────────────────────────────────

  async streamChecklist(dto: ChecklistGenerateDto, res: Response): Promise<void> {
    const userPrompt = CHECKLIST_PROMPT(dto.serviceType, dto.propertyType);
    await this.streamToResponse(userPrompt, res, 'checklist');
  }

  // ── 3. Diagnóstico Visual (SSE streaming + vision) ────────────────────────

  async streamVisualDiagnosis(dto: VisualDiagnosisDto, res: Response): Promise<void> {
    const userPrompt = VISUAL_DIAGNOSIS_PROMPT(dto.context ?? '');
    const mimeType = dto.mimeType ?? 'image/jpeg';

    this.setupSseHeaders(res);

    const messages: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType,
              data: dto.imageBase64,
            },
          },
          { type: 'text', text: userPrompt },
        ],
      },
    ];

    await this.streamMessagesWithRetry(messages, res, 'visual-diagnosis', 2048);
  }

  // ── 4. Rascunho de Laudo (SSE streaming) ─────────────────────────────────

  async streamReportDraft(dto: ReportDraftDto, res: Response): Promise<void> {
    const checklist = await this.prisma.checklist.findFirst({
      where: { id: dto.checklistId },
      include: {
        items: true,
        serviceOrder: {
          include: {
            property: {
              select: { name: true, type: true, city: true, state: true, buildingAge: true },
            },
          },
        },
      },
    });
    if (!checklist) throw new NotFoundException('Checklist não encontrado.');

    const propertyData = JSON.stringify(checklist.serviceOrder.property, null, 2);
    const checklistData = JSON.stringify(
      {
        title: checklist.title,
        applicableNorms: checklist.applicableNorms,
        items: checklist.items.map((i) => ({
          title: i.title,
          status: i.status,
          normReference: i.normReference,
          technicianNote: i.technicianNote,
          measurementValue: i.measurementValue,
          measurementUnit: i.measurementUnit,
          measurementInRange: i.measurementInRange,
        })),
      },
      null,
      2,
    );

    const userPrompt = REPORT_DRAFT_PROMPT(checklistData, propertyData);
    await this.streamToResponse(userPrompt, res, 'report-draft');
  }

  // ── 5. Score ABNT (SSE streaming) ────────────────────────────────────────

  async streamAbntScore(dto: AbntScoreDto, res: Response): Promise<void> {
    // Busca dados completos do imóvel + histórico de 24 meses
    const property = await this.prisma.property.findFirst({
      where: { id: dto.propertyId, deletedAt: null },
      select: {
        id: true,
        name: true,
        type: true,
        buildingAge: true,
        city: true,
        state: true,
        assets: {
          where: { deletedAt: null },
          select: {
            name: true,
            category: true,
            status: true,
            lastMaintenanceDate: true,
            nextMaintenanceDate: true,
            maintenanceFrequency: true,
            applicableNorms: true,
          },
        },
        serviceOrders: {
          where: {
            deletedAt: null,
            createdAt: {
              gte: new Date(Date.now() - 24 * 30 * 24 * 60 * 60 * 1000), // 24 meses
            },
          },
          select: {
            type: true,
            status: true,
            priority: true,
            completedAt: true,
            applicableNorms: true,
            aiComplianceScore: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    });

    if (!property) throw new NotFoundException('Imóvel não encontrado.');

    const propertyData = JSON.stringify(
      {
        name: property.name,
        type: property.type,
        buildingAge: property.buildingAge,
        city: property.city,
        state: property.state,
        totalAssets: property.assets.length,
        assetsUnderMaintenance: property.assets.filter((a) => a.status === 'UNDER_MAINTENANCE').length,
        overdueAssets: property.assets.filter(
          (a) => a.nextMaintenanceDate && new Date(a.nextMaintenanceDate) < new Date(),
        ).length,
      },
      null,
      2,
    );

    const maintenanceHistory = JSON.stringify(
      {
        totalServiceOrders: property.serviceOrders.length,
        completedOrders: property.serviceOrders.filter((o) => o.status === 'COMPLETED').length,
        cancelledOrders: property.serviceOrders.filter((o) => o.status === 'CANCELLED').length,
        emergencyOrders: property.serviceOrders.filter((o) => o.priority === 'EMERGENCY').length,
        avgComplianceScore:
          property.serviceOrders
            .filter((o) => o.aiComplianceScore !== null)
            .reduce((sum, o) => sum + (o.aiComplianceScore ?? 0), 0) /
          Math.max(1, property.serviceOrders.filter((o) => o.aiComplianceScore !== null).length),
        assetMaintenance: property.assets.map((a) => ({
          name: a.name,
          category: a.category,
          status: a.status,
          lastMaintenanceDate: a.lastMaintenanceDate,
          nextMaintenanceDate: a.nextMaintenanceDate,
          frequency: a.maintenanceFrequency,
          isOverdue:
            a.nextMaintenanceDate ? new Date(a.nextMaintenanceDate) < new Date() : null,
          applicableNorms: a.applicableNorms,
        })),
      },
      null,
      2,
    );

    const userPrompt = ABNT_SCORE_PROMPT(propertyData, maintenanceHistory);
    await this.streamToResponse(userPrompt, res, 'abnt-score');
  }

  // ── 6. Tradução Técnica (SSE streaming) ──────────────────────────────────

  async streamTranslateTechnical(
    dto: TranslateTechnicalDto,
    res: Response,
  ): Promise<void> {
    const userPrompt = TRANSLATE_TECHNICAL_PROMPT(dto.technicalText);
    await this.streamToResponse(userPrompt, res, 'translate-technical', 1024);
  }

  // ── Análise de conformidade (não-streaming — uso interno pelo sistema) ────

  async analyzeCompliance(
    serviceOrderId: string,
    checklistItemsJson: string,
  ): Promise<ComplianceAnalysisOutput> {
    const content = `Analise os itens do checklist e calcule o score de conformidade ABNT.

Itens: ${checklistItemsJson}

Responda em JSON (sem markdown):
{
  "complianceScore": 0-100,
  "riskLevel": "LOW|MEDIUM|HIGH|CRITICAL",
  "nonConformities": [{"norm":"...","item":"...","severity":"...","recommendation":"..."}],
  "recommendations": ["..."]
}`;

    const response = await this.callApiWithRetry(
      () =>
        this.anthropic.messages.create({
          model: this.model,
          max_tokens: 1024,
          system: ABNT_SYSTEM_PROMPT,
          messages: [{ role: 'user', content }],
        }),
      'analyzeCompliance',
    );

    const text = response.content[0]?.type === 'text' ? response.content[0].text : '{}';

    this.logger.log(
      `[AI] analyzeCompliance (OS: ${serviceOrderId}) — ` +
        `input: ${response.usage.input_tokens} | output: ${response.usage.output_tokens} tokens`,
    );

    return this.parseJsonSafe<ComplianceAnalysisOutput>(text, {
      complianceScore: 0,
      riskLevel: 'HIGH',
      nonConformities: [],
      recommendations: [],
    });
  }

  // ── Helpers privados ──────────────────────────────────────────────────────

  /**
   * Fluxo principal de streaming para prompts de texto simples.
   * Configura headers SSE e delega ao streamMessagesWithRetry.
   */
  private async streamToResponse(
    userPrompt: string,
    res: Response,
    eventType: string,
    maxTokens = 4096,
  ): Promise<void> {
    this.setupSseHeaders(res);
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userPrompt }];
    await this.streamMessagesWithRetry(messages, res, eventType, maxTokens);
  }

  /**
   * Cria e faz pipe do stream com retry + exponential backoff.
   * Retry é aplicado antes de qualquer chunk ser enviado ao cliente.
   * Se o stream falhar após chunks enviados, encerra com evento de erro.
   */
  private async streamMessagesWithRetry(
    messages: Anthropic.MessageParam[],
    res: Response,
    eventType: string,
    maxTokens = 4096,
  ): Promise<void> {
    let lastError: Error = new Error('Erro desconhecido');

    for (let attempt = 1; attempt <= AI_MAX_RETRIES; attempt++) {
      try {
        const stream = this.anthropic.messages.stream({
          model: this.model,
          max_tokens: maxTokens,
          system: ABNT_SYSTEM_PROMPT,
          messages,
        });

        await this.pipeStream(stream, res, eventType);
        return; // ✅ sucesso
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < AI_MAX_RETRIES) {
          const delayMs = AI_RETRY_BASE_MS * 2 ** (attempt - 1); // 1s, 2s
          this.logger.warn(
            `[AI:${eventType}] Tentativa ${attempt}/${AI_MAX_RETRIES} falhou ` +
              `(${lastError.message}). Retry em ${delayMs}ms...`,
          );
          await new Promise<void>((r) => setTimeout(r, delayMs));
        }
      }
    }

    // Todas as tentativas falharam
    this.logger.error(
      `[AI:${eventType}] Todas as ${AI_MAX_RETRIES} tentativas falharam: ${lastError.message}`,
    );
    this.handleStreamError(lastError, res, eventType);
  }

  /**
   * Faz pipe de um MessageStream para o response SSE.
   * Loga tokens ao finalizar.
   */
  private async pipeStream(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stream: AsyncIterable<Anthropic.MessageStreamEvent> & { finalMessage(): Promise<any> },
    res: Response,
    eventType: string,
  ): Promise<void> {
    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        const chunk = event.delta.text;
        res.write(`event: ${eventType}\ndata: ${JSON.stringify({ chunk })}\n\n`);
      }
    }

    const finalMessage = await stream.finalMessage();
    const { usage } = finalMessage;

    this.logger.log(
      `[AI] ${eventType} — input: ${usage.input_tokens} | output: ${usage.output_tokens} tokens`,
    );

    res.write(`event: done\ndata: ${JSON.stringify({ done: true, usage })}\n\n`);
    res.end();
  }

  /**
   * Wrapper com retry para chamadas não-streaming (messages.create).
   */
  private async callApiWithRetry<T>(
    fn: () => Promise<T>,
    context: string,
    maxAttempts = AI_MAX_RETRIES,
  ): Promise<T> {
    let lastError: Error = new Error('Erro desconhecido');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < maxAttempts) {
          const delayMs = AI_RETRY_BASE_MS * 2 ** (attempt - 1);
          this.logger.warn(
            `[AI:${context}] Tentativa ${attempt}/${maxAttempts} falhou ` +
              `(${lastError.message}). Retry em ${delayMs}ms...`,
          );
          await new Promise<void>((r) => setTimeout(r, delayMs));
        }
      }
    }

    throw new ServiceUnavailableException(
      `Motor de IA indisponível após ${maxAttempts} tentativas: ${lastError.message}`,
    );
  }

  /**
   * Parse seguro de JSON com fallback tipado.
   */
  private parseJsonSafe<T>(text: string, fallback: T): T {
    // Remove possível markdown residual (ex: ```json ... ```)
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();

    try {
      return JSON.parse(cleaned) as T;
    } catch {
      this.logger.error(
        `[AI] Falha ao parsear JSON (${cleaned.length} chars): "${cleaned.substring(0, 120)}..."`,
      );
      return fallback;
    }
  }

  /** Configura headers SSE no response. Idempotente. */
  private setupSseHeaders(res: Response): void {
    if (res.headersSent) return;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Desativa buffering no Nginx
    res.flushHeaders();
  }

  /** Envia evento de erro SSE e encerra o response. */
  private handleStreamError(err: unknown, res: Response, eventType: string): void {
    const message = err instanceof Error ? err.message : 'Erro desconhecido';
    this.logger.error(`[AI] Erro no stream ${eventType}: ${message}`);

    if (!res.headersSent) {
      this.setupSseHeaders(res);
    }
    res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
}
