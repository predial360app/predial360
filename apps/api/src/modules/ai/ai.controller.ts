/**
 * AiController — 6 endpoints de IA com streaming SSE.
 * Todos retornam text/event-stream — consumir com EventSource ou fetch+ReadableStream.
 *
 * Eventos SSE emitidos por endpoint:
 *   event: <endpoint-name>   data: { chunk: "..." }    ← streaming
 *   event: done              data: { done: true, usage: { input_tokens, output_tokens } }
 *   event: error             data: { error: "mensagem" }
 */
import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AiService } from './ai.service';
import {
  AbntScoreDto,
  ChecklistGenerateDto,
  PreventivePlanDto,
  ReportDraftDto,
  TranslateTechnicalDto,
  VisualDiagnosisDto,
} from './dto/ai.dto';

const SSE_DESCRIPTION =
  '**Resposta em streaming SSE** (`Content-Type: text/event-stream`).\n\n' +
  'Cada evento carrega um `chunk` do JSON sendo gerado. ' +
  'O evento `done` sinaliza o fim com o consumo de tokens.\n\n' +
  '```js\n' +
  'const es = new EventSource(url, { headers: { Authorization: `Bearer ${token}` } });\n' +
  'es.addEventListener("done", e => console.log(JSON.parse(e.data)));\n' +
  '```';

@ApiTags('ai — Motor IA ABNT')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller({ path: 'ai', version: '1' })
export class AiController {
  constructor(private readonly aiService: AiService) {}

  // ── 1. Plano Preventivo ───────────────────────────────────────────────────

  @Post('preventive-plan')
  @HttpCode(HttpStatus.OK)
  @ApiProduces('text/event-stream')
  @ApiOperation({
    summary: '1. Gerar plano preventivo anual (NBR 5674)',
    description:
      `${SSE_DESCRIPTION}\n\n` +
      '**Evento:** `preventive-plan`\n\n' +
      '**Output JSON acumulado:**\n' +
      '```json\n' +
      '{ "schedule": [...], "nextAlerts": [...], "summary": "...", "normsApplied": [...] }\n' +
      '```\n\n' +
      '**Normas:** NBR 5674:2012, NBR 16747:2020\n\n' +
      '**Retry:** até 3 tentativas com backoff (1s → 2s)',
  })
  @ApiResponse({ status: 200, description: 'Stream SSE com plano preventivo' })
  @ApiResponse({ status: 404, description: 'Imóvel não encontrado' })
  async preventivePlan(
    @Body() dto: PreventivePlanDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.aiService.streamPreventivePlan(dto, res);
  }

  // ── 2. Checklist ABNT ─────────────────────────────────────────────────────

  @Post('checklist')
  @HttpCode(HttpStatus.OK)
  @ApiProduces('text/event-stream')
  @ApiOperation({
    summary: '2. Gerar checklist técnico ABNT por tipo de serviço',
    description:
      `${SSE_DESCRIPTION}\n\n` +
      '**Evento:** `checklist`\n\n' +
      '**Output JSON acumulado:**\n' +
      '```json\n' +
      '{ "title": "...", "items": [...], "mandatory": [...], "applicableNorms": [...], "estimatedMinutes": 60 }\n' +
      '```\n\n' +
      '**Normas:** NBR 5674, NBR 16747, NBR 15575, NBR 9077',
  })
  @ApiResponse({ status: 200, description: 'Stream SSE com checklist' })
  async generateChecklist(
    @Body() dto: ChecklistGenerateDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.aiService.streamChecklist(dto, res);
  }

  // ── 3. Diagnóstico Visual ─────────────────────────────────────────────────

  @Post('visual-diagnosis')
  @HttpCode(HttpStatus.OK)
  @ApiProduces('text/event-stream')
  @ApiOperation({
    summary: '3. Diagnóstico visual de patologia predial (visão computacional)',
    description:
      `${SSE_DESCRIPTION}\n\n` +
      '**Evento:** `visual-diagnosis`\n\n' +
      '**Input:** `imageBase64` (JPEG/PNG/WebP em base64 puro, máx 5 MB) + `context` opcional\n\n' +
      '**Output JSON acumulado:**\n' +
      '```json\n' +
      '{ "pathology": "Umidade por capilaridade", "urgency": "HIGH", "normaRef": "NBR 15575:2013 §8", ... }\n' +
      '```\n\n' +
      '**Normas:** NBR 15575, NBR 16747, NBR 9077',
  })
  @ApiResponse({ status: 200, description: 'Stream SSE com diagnóstico' })
  async visualDiagnosis(
    @Body() dto: VisualDiagnosisDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.aiService.streamVisualDiagnosis(dto, res);
  }

  // ── 4. Rascunho de Laudo ──────────────────────────────────────────────────

  @Post('report-draft')
  @HttpCode(HttpStatus.OK)
  @ApiProduces('text/event-stream')
  @ApiOperation({
    summary: '4. Gerar rascunho de laudo técnico (NBR 16747)',
    description:
      `${SSE_DESCRIPTION}\n\n` +
      '**Evento:** `report-draft`\n\n' +
      '**Requisito:** checklist concluído (`checklistId`)\n\n' +
      '**Output JSON acumulado:**\n' +
      '```json\n' +
      '{ "technicalText": "...", "clientText": "...", "riskLevel": "HIGH", "mainFindings": [...] }\n' +
      '```\n\n' +
      '**Norma base:** NBR 16747:2020',
  })
  @ApiResponse({ status: 200, description: 'Stream SSE com rascunho do laudo' })
  @ApiResponse({ status: 404, description: 'Checklist não encontrado' })
  async reportDraft(
    @Body() dto: ReportDraftDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.aiService.streamReportDraft(dto, res);
  }

  // ── 5. Score ABNT ─────────────────────────────────────────────────────────

  @Post('abnt-score')
  @HttpCode(HttpStatus.OK)
  @ApiProduces('text/event-stream')
  @ApiOperation({
    summary: '5. Calcular score de conformidade ABNT do imóvel (0-100)',
    description:
      `${SSE_DESCRIPTION}\n\n` +
      '**Evento:** `abnt-score`\n\n' +
      'Analisa os últimos **24 meses** de histórico de manutenção automaticamente ' +
      'a partir do `propertyId`.\n\n' +
      '**Output JSON acumulado:**\n' +
      '```json\n' +
      '{ "score": 78, "grade": "B", "byNorm": { "NBR_5674": { "score": 80, "status": "ok", ... }, ... }, "nextActions": [...] }\n' +
      '```\n\n' +
      '**Grades:** A=90-100, B=75-89, C=60-74, D=40-59, F=0-39\n\n' +
      '**Normas avaliadas:** NBR 5674 (35%), NBR 16747 (25%), NBR 14037 (15%), NBR 15575 (15%), NBR 9077 (10%)',
  })
  @ApiResponse({ status: 200, description: 'Stream SSE com score ABNT' })
  @ApiResponse({ status: 404, description: 'Imóvel não encontrado' })
  async abntScore(
    @Body() dto: AbntScoreDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.aiService.streamAbntScore(dto, res);
  }

  // ── 6. Tradução Técnica ───────────────────────────────────────────────────

  @Post('translate-technical')
  @HttpCode(HttpStatus.OK)
  @ApiProduces('text/event-stream')
  @ApiOperation({
    summary: '6. Traduzir texto técnico para linguagem simples (proprietário leigo)',
    description:
      `${SSE_DESCRIPTION}\n\n` +
      '**Evento:** `translate-technical`\n\n' +
      'Converte jargão de engenharia em linguagem cotidiana acessível.\n\n' +
      '**Output JSON acumulado:**\n' +
      '```json\n' +
      '{ "simpleText": "...", "keyPoints": [{ "point": "...", "isAlert": false }], "alertLevel": "warning", "recommendedActions": [...], "timeframe": "30 dias" }\n' +
      '```',
  })
  @ApiResponse({ status: 200, description: 'Stream SSE com tradução simplificada' })
  async translateTechnical(
    @Body() dto: TranslateTechnicalDto,
    @Res() res: Response,
  ): Promise<void> {
    await this.aiService.streamTranslateTechnical(dto, res);
  }
}
