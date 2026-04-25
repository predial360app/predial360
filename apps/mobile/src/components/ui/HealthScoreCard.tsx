import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface HealthScoreProps {
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  alerts: string[];
}

const GRADE_COLORS: Record<string, string> = {
  A: '#22c55e',
  B: '#84cc16',
  C: '#f59e0b',
  D: '#f97316',
  F: '#ef4444',
};

const GRADE_LABELS: Record<string, string> = {
  A: 'Excelente',
  B: 'Bom',
  C: 'Regular',
  D: 'Atenção',
  F: 'Crítico',
};

export function HealthScoreCard({ score, grade, alerts }: HealthScoreProps): React.ReactElement {
  const color = GRADE_COLORS[grade] ?? '#6b7280';
  const label = GRADE_LABELS[grade] ?? grade;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Score de Saúde</Text>
        <View style={[styles.gradeBadge, { backgroundColor: color }]}>
          <Text style={styles.gradeText}>{grade}</Text>
        </View>
      </View>

      {/* Barra de progresso */}
      <View style={styles.barContainer}>
        <View style={[styles.barFill, { width: `${score}%`, backgroundColor: color }]} />
      </View>

      <View style={styles.scoreRow}>
        <Text style={[styles.scoreNumber, { color }]}>{score}</Text>
        <Text style={styles.scoreLabel}>/100 — {label}</Text>
      </View>

      {/* Alertas */}
      {alerts.length > 0 && (
        <View style={styles.alertsContainer}>
          {alerts.map((alert, i) => (
            <View key={i} style={styles.alertRow}>
              <Text style={styles.alertDot}>⚠️</Text>
              <Text style={styles.alertText}>{alert}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E3A5F',
  },
  gradeBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
  },
  barContainer: {
    height: 8,
    backgroundColor: '#e5e7eb',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 8,
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 12,
  },
  scoreNumber: {
    fontSize: 32,
    fontWeight: '800',
    marginRight: 4,
  },
  scoreLabel: {
    fontSize: 14,
    color: '#6b7280',
  },
  alertsContainer: {
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
    paddingTop: 12,
    gap: 6,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  alertDot: {
    fontSize: 12,
    marginTop: 1,
  },
  alertText: {
    fontSize: 12,
    color: '#6b7280',
    flex: 1,
    lineHeight: 18,
  },
});
