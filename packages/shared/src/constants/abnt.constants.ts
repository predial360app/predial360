import { AbntNorm, MaintenanceFrequency } from '../types/enums';

/** Descrições das normas ABNT */
export const ABNT_NORM_DESCRIPTIONS: Record<AbntNorm, string> = {
  [AbntNorm.NBR_5674]: 'NBR 5674:2012 — Manutenção de edificações: Requisitos para o sistema de gestão de manutenção',
  [AbntNorm.NBR_16747]: 'NBR 16747:2020 — Inspeção predial: Diretrizes, conceitos, terminologia e procedimento',
  [AbntNorm.NBR_14037]: 'NBR 14037:2011 — Diretrizes para elaboração de manuais de uso, operação e manutenção das edificações',
  [AbntNorm.NBR_15575]: 'NBR 15575:2013 — Edificações habitacionais: Desempenho',
  [AbntNorm.NBR_16280]: 'NBR 16280:2015 — Reforma em edificações: Sistema de gestão de reformas',
  [AbntNorm.NBR_9077]: 'NBR 9077:2001 — Saídas de emergência em edifícios',
};

/** Periodicidades mínimas por norma (NBR 5674) */
export const NBR_5674_FREQUENCIES: Record<string, MaintenanceFrequency> = {
  'Extintores de incêndio': MaintenanceFrequency.ANNUAL,
  'Sistema de iluminação de emergência': MaintenanceFrequency.MONTHLY,
  'Elevadores': MaintenanceFrequency.MONTHLY,
  'Sistema de alarme de incêndio': MaintenanceFrequency.SEMIANNUAL,
  'Instalações elétricas': MaintenanceFrequency.ANNUAL,
  'Instalações hidráulicas': MaintenanceFrequency.ANNUAL,
  'Cobertura/Telhado': MaintenanceFrequency.SEMIANNUAL,
  'Fachadas': MaintenanceFrequency.ANNUAL,
  'Filtros de ar condicionado': MaintenanceFrequency.QUARTERLY,
  'Caixas d\'água': MaintenanceFrequency.SEMIANNUAL,
  'Para-raios': MaintenanceFrequency.ANNUAL,
  'Gerador': MaintenanceFrequency.MONTHLY,
};

/** Vida útil mínima por sistema (NBR 15575) */
export const NBR_15575_SERVICE_LIFE: Record<string, number> = {
  'Estrutura': 50,        // anos
  'Cobertura': 20,
  'Paredes externas': 40,
  'Paredes internas': 20,
  'Instalações elétricas': 20,
  'Instalações hidráulicas': 20,
  'Revestimento de fachada': 20,
  'Piso': 13,
  'Esquadrias': 25,
};
