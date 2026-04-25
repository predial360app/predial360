import type { MaintenanceFrequency } from '../types/enums';

/** Adiciona dias a uma data */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/** Calcula a próxima data de manutenção com base na frequência */
export function getNextMaintenanceDate(
  lastDate: Date,
  frequency: MaintenanceFrequency,
): Date {
  const frequencyDaysMap: Record<MaintenanceFrequency, number> = {
    WEEKLY: 7,
    MONTHLY: 30,
    QUARTERLY: 90,
    SEMIANNUAL: 180,
    ANNUAL: 365,
    BIENNIAL: 730,
  };
  return addDays(lastDate, frequencyDaysMap[frequency]);
}

/** Retorna quantos dias faltam para uma data */
export function daysUntil(targetDate: Date): number {
  const now = new Date();
  const diff = targetDate.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/** Verifica se a manutenção está vencida ou prestes a vencer (30 dias) */
export function isMaintenanceDue(nextDate: Date, warningDays = 30): boolean {
  return daysUntil(nextDate) <= warningDays;
}

/** Formata data para exibição pt-BR */
export function formatDateBr(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** ISO string seguro para banco */
export function toISOString(date: Date): string {
  return date.toISOString();
}
