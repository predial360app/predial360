/**
 * System prompt base — injetado em TODAS as chamadas ao Claude.
 * Encapsula o conhecimento das 6 normas ABNT e regras de output.
 *
 * REGRA CARDINAL: Responder SEMPRE em JSON válido, sem markdown,
 * sem texto fora do JSON, sem comentários.
 */
export const ABNT_SYSTEM_PROMPT = `Você é o motor técnico do app Predial360, especializado em engenharia predial e normas ABNT brasileiras.

## Seu papel
Auxiliar técnicos e proprietários a garantir conformidade com as normas ABNT vigentes, gerando planos de manutenção, checklists técnicos, diagnósticos visuais, laudos e scores de conformidade.

## Normas ABNT que você domina

### NBR 5674:2012 — Manutenção de Edificações
- Gestão de manutenção: planejamento, execução, registros
- Periodicidades mínimas por sistema (ex.: elevadores: mensal; fachadas: semestral)
- Critérios de priorização por risco e criticidade
- Documentação obrigatória: plano de manutenção, ordens de serviço, relatórios

### NBR 16747:2020 — Inspeção Predial
- Metodologia de inspeção: visual, instrumental, especializada
- Níveis de complexidade: 1 (residencial simples), 2 (até 5 pavimentos), 3 (acima de 5)
- Graus de risco: crítico, regular, mínimo
- Estrutura do laudo técnico: identificação, metodologia, constatações, recomendações
- Validade do laudo: até 12 meses (nível 1), 6 meses (níveis 2 e 3)

### NBR 14037:2011 — Manual do Proprietário
- Conteúdo obrigatório do manual de uso e manutenção
- Vida útil mínima por sistema (estrutura ≥ 50 anos; instalações hidráulicas ≥ 20 anos)
- Garantias mínimas legais (Código Civil art. 618)
- Procedimentos para reformas e intervenções

### NBR 15575:2013 — Desempenho das Edificações
- Requisitos mínimos de desempenho por sistema construtivo
- Durabilidade e vida útil de projeto (VUP)
- Sistemas: estrutura, pisos, vedações, cobertura, hidrossanitário, elétrico
- Critérios de avaliação: segurança, habitabilidade, sustentabilidade

### NBR 16280:2015 — Reformas em Edificações
- Documentação obrigatória antes de qualquer reforma
- Responsabilidade técnica (ART/RRT)
- Comunicação ao síndico (condomínios) e aprovação municipal
- Impacto em sistemas estruturais e de instalações

### NBR 9077:2001 — Saídas de Emergência
- Dimensionamento de rotas de fuga
- Sinalização de emergência
- Iluminação de segurança
- Acesso para bombeiros e veículos de emergência

## Diretrizes OBRIGATÓRIAS
1. Responda SEMPRE em português brasileiro
2. Output DEVE ser JSON válido — sem markdown, sem texto fora do JSON, sem comentários
3. Sempre cite a norma e o item específico (ex: "NBR 5674:2012 §7.3")
4. Quando houver risco crítico, use urgency/priority: "CRITICAL"
5. Para diagnóstico visual, seja conservador — prefira recomendar inspeção especializada`;

// ─── Prompt 1: Plano Preventivo ──────────────────────────────────────────────

export const PREVENTIVE_PLAN_PROMPT = (
  systems: string[],
  buildingAge: number,
  propertyType: string,
): string => `Com base no perfil técnico a seguir, gere um plano de manutenção preventiva anual conforme a NBR 5674:2012.

Perfil do imóvel:
- Tipo: ${propertyType}
- Idade da edificação: ${buildingAge} anos
- Sistemas presentes: ${systems.join(', ')}

Responda em JSON (sem markdown):
{
  "schedule": [
    {
      "system": "nome do sistema",
      "task": "descrição da tarefa",
      "frequency": "MONTHLY|QUARTERLY|SEMIANNUAL|ANNUAL",
      "months": [1, 4, 7, 10],
      "normaRef": "NBR 5674:2012 §X.X",
      "priority": "HIGH|MEDIUM|LOW",
      "estimatedHours": 2,
      "requiresSpecialist": true
    }
  ],
  "nextAlerts": [
    { "system": "...", "task": "...", "dueDate": "YYYY-MM-DD", "priority": "HIGH" }
  ],
  "summary": "Resumo do plano em 2-3 frases",
  "normsApplied": ["NBR_5674", "NBR_9077"]
}`;

// ─── Prompt 2: Checklist ABNT ────────────────────────────────────────────────

export const CHECKLIST_PROMPT = (serviceType: string, propertyType: string): string =>
  `Gere um checklist técnico de inspeção para o contexto abaixo, conforme as normas ABNT aplicáveis:

Contexto:
- Tipo de serviço: ${serviceType}
- Tipo de imóvel: ${propertyType}

Responda em JSON (sem markdown):
{
  "title": "Título do checklist",
  "items": [
    {
      "order": 1,
      "title": "Descrição do item",
      "normReference": "NBR XXXX:YYYY §X.X",
      "isRequired": true,
      "requiresPhoto": true,
      "requiresMeasurement": false,
      "measurementUnit": null,
      "measurementMin": null,
      "measurementMax": null,
      "severity": "HIGH|MEDIUM|LOW"
    }
  ],
  "mandatory": ["títulos dos itens obrigatórios críticos"],
  "applicableNorms": ["NBR_5674", "NBR_16747"],
  "estimatedMinutes": 60
}`;

// ─── Prompt 3: Diagnóstico Visual ────────────────────────────────────────────

export const VISUAL_DIAGNOSIS_PROMPT = (context: string): string =>
  `Analise a imagem de patologia predial fornecida considerando as normas ABNT.

Contexto adicional: ${context || 'Sem contexto adicional.'}

Responda em JSON (sem markdown):
{
  "pathology": "Nome/tipo da patologia identificada",
  "description": "Descrição técnica detalhada",
  "urgency": "CRITICAL|HIGH|MEDIUM|LOW",
  "normaRef": "Norma ABNT mais relevante (ex: NBR 15575:2013 §8.4)",
  "possibleCauses": ["causa 1", "causa 2"],
  "action": "Ação imediata recomendada",
  "longTermAction": "Ação de longo prazo",
  "requiresSpecialist": true,
  "estimatedCost": "BAIXO|MÉDIO|ALTO",
  "riskToOccupants": "Descrição do risco para os ocupantes",
  "isUrgent": true
}

Se não conseguir identificar com segurança, use "pathology": "Inconclusivo" e recomende inspeção presencial.`;

// ─── Prompt 4: Rascunho de Laudo ─────────────────────────────────────────────

export const REPORT_DRAFT_PROMPT = (
  checklistData: string,
  propertyData: string,
): string => `Com base nos dados de inspeção abaixo, redija um laudo técnico predial conforme a NBR 16747:2020.

Dados do imóvel:
${propertyData}

Resultados do checklist:
${checklistData}

Responda em JSON (sem markdown):
{
  "technicalText": "Laudo técnico formal (linguagem NBR 16747 — para o engenheiro/técnico assinar). Inclua: identificação do imóvel, metodologia, constatações por sistema, grau de risco, recomendações com prazos, referências normativas.",
  "clientText": "Versão simplificada para o proprietário leigo. Inclua: resumo executivo, o que foi encontrado, o que precisa ser feito e quando, próximos passos.",
  "riskLevel": "CRITICAL|HIGH|MEDIUM|LOW",
  "mainFindings": ["achado 1", "achado 2"],
  "urgentItems": ["item urgente 1"],
  "validityMonths": 6,
  "normsApplied": ["NBR_16747", "NBR_5674"]
}`;

// ─── Prompt 5: Score ABNT ────────────────────────────────────────────────────

export const ABNT_SCORE_PROMPT = (
  propertyData: string,
  maintenanceHistory: string,
): string => `Calcule o score de conformidade ABNT deste imóvel com base no histórico de manutenções fornecido.

Dados do imóvel:
${propertyData}

Histórico de manutenções (últimos 24 meses):
${maintenanceHistory}

Critérios de avaliação:
- NBR 5674: periodicidades cumpridas (35% do score)
- NBR 16747: inspeções realizadas dentro do prazo (25% do score)
- NBR 14037: documentação de uso em dia (15% do score)
- NBR 15575: desempenho dos sistemas mantido (15% do score)
- NBR 9077: segurança de emergência verificada (10% do score)

Responda em JSON (sem markdown):
{
  "score": 78,
  "grade": "B",
  "byNorm": {
    "NBR_5674": {
      "score": 80,
      "weight": 35,
      "status": "ok|warning|critical",
      "pendingItems": ["descrição do item pendente"],
      "lastChecked": "YYYY-MM-DD"
    },
    "NBR_16747": { "score": 75, "weight": 25, "status": "warning", "pendingItems": [], "lastChecked": null },
    "NBR_14037": { "score": 90, "weight": 15, "status": "ok", "pendingItems": [], "lastChecked": "YYYY-MM-DD" },
    "NBR_15575": { "score": 70, "weight": 15, "status": "warning", "pendingItems": [], "lastChecked": null },
    "NBR_9077":  { "score": 60, "weight": 10, "status": "critical", "pendingItems": [], "lastChecked": null }
  },
  "nextActions": [
    {
      "action": "Descrição da ação necessária",
      "norm": "NBR 5674",
      "deadline": "YYYY-MM-DD",
      "priority": "HIGH|MEDIUM|LOW",
      "impact": "Impacto no score se realizada"
    }
  ],
  "summary": "Análise geral em 2-3 frases",
  "validUntil": "YYYY-MM-DD"
}

Grades: 90-100=A, 75-89=B, 60-74=C, 40-59=D, 0-39=F`;

// ─── Prompt 6: Tradução Técnica ──────────────────────────────────────────────

export const TRANSLATE_TECHNICAL_PROMPT = (technicalText: string): string =>
  `Traduza o texto técnico de engenharia abaixo para linguagem simples e didática, acessível para um proprietário leigo.

Texto técnico original:
"""
${technicalText}
"""

Diretrizes:
- Substitua jargões técnicos por explicações cotidianas
- Use analogias quando útil (ex.: "como uma torneira pingando")
- Mantenha a precisão técnica sem perder a acessibilidade
- Destaque pontos de atenção com urgência clara
- Evite termos em latim ou abreviações sem explicação
- Máximo de 3 parágrafos curtos para o texto principal

Responda em JSON (sem markdown):
{
  "simpleText": "Texto traduzido em linguagem simples (2-3 parágrafos)",
  "keyPoints": [
    { "point": "ponto principal 1", "isAlert": false },
    { "point": "URGENTE: ponto de atenção", "isAlert": true }
  ],
  "alertLevel": "none|info|warning|critical",
  "recommendedActions": ["ação recomendada 1", "ação recomendada 2"],
  "timeframe": "prazo geral recomendado (ex: '30 dias', 'imediato', '1 ano')"
}`;
