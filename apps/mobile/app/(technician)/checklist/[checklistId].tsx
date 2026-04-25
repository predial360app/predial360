/**
 * Tela de execução do checklist — 100% funcional offline.
 * Cada item: status enum + foto (câmera) + GPS + medição opcional.
 * Dados salvos no WatermelonDB; sync automático ao reconectar.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { withObservables } from '@nozbe/watermelondb/react';
import { Q } from '@nozbe/watermelondb';

import { database } from '../../../src/database';
import type Checklist from '../../../src/database/models/Checklist';
import type ChecklistItem from '../../../src/database/models/ChecklistItem';
import type { ItemStatus } from '../../../src/database/models/ChecklistItem';
import { OfflineBanner } from '../../../src/components/ui/OfflineBanner';

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: ItemStatus; label: string; color: string }[] = [
  { value: 'CONFORMING', label: '✅ Conforme', color: '#22c55e' },
  { value: 'NON_CONFORMING', label: '❌ Não conforme', color: '#ef4444' },
  { value: 'NOT_APPLICABLE', label: '➖ N/A', color: '#9ca3af' },
  { value: 'REQUIRES_MONITORING', label: '👁️ Monitorar', color: '#f59e0b' },
];

// ── Componente de um item do checklist ────────────────────────────────────────

interface ItemCardProps {
  item: ChecklistItem;
  isExpanded: boolean;
  onToggle: () => void;
}

function ItemCard({ item, isExpanded, onToggle }: ItemCardProps): React.ReactElement {
  const [note, setNote] = useState(item.technicianNote ?? '');
  const [measurement, setMeasurement] = useState(
    item.measurementValue !== null ? String(item.measurementValue) : '',
  );
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);

  const isDone = item.status !== 'PENDING';
  const statusConfig = STATUS_OPTIONS.find((s) => s.value === item.status);

  async function handleStatusChange(status: ItemStatus): Promise<void> {
    let gpsLatitude: number | null = null;
    let gpsLongitude: number | null = null;

    // Capturar GPS ao responder
    try {
      const { status: perm } = await Location.requestForegroundPermissionsAsync();
      if (perm === 'granted') {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        gpsLatitude = loc.coords.latitude;
        gpsLongitude = loc.coords.longitude;
      }
    } catch { /* GPS não essencial */ }

    await database.write(async () => {
      await item.update((i) => {
        i.status = status;
        i.gpsLatitude = gpsLatitude;
        i.gpsLongitude = gpsLongitude;
        i.completedAt = new Date();
        i.isSynced = false;
      });
    });
  }

  async function handleSaveNote(): Promise<void> {
    await database.write(async () => {
      await item.update((i) => {
        i.technicianNote = note || null;
        i.isSynced = false;
      });
    });
  }

  async function handleSaveMeasurement(): Promise<void> {
    const val = parseFloat(measurement);
    if (isNaN(val)) return;
    await database.write(async () => {
      await item.update((i) => {
        i.measurementValue = val;
        i.isSynced = false;
      });
    });
  }

  async function handleTakePhoto(): Promise<void> {
    setIsCapturingPhoto(true);
    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão negada', 'Habilite a câmera nas configurações.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 0.7,
        allowsEditing: false,
        exif: false,
      });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        const current = item.photoUris;
        await database.write(async () => {
          await item.update((i) => {
            i.photoUrisJson = JSON.stringify([...current, uri]);
            i.isSynced = false;
          });
        });
      }
    } finally {
      setIsCapturingPhoto(false);
    }
  }

  async function handleRemovePhoto(uri: string): Promise<void> {
    const updated = item.photoUris.filter((u) => u !== uri);
    await database.write(async () => {
      await item.update((i) => {
        i.photoUrisJson = JSON.stringify(updated);
        i.isSynced = false;
      });
    });
  }

  return (
    <TouchableOpacity
      style={[styles.itemCard, isDone && styles.itemCardDone]}
      onPress={onToggle}
      activeOpacity={0.85}
    >
      {/* Header do item */}
      <View style={styles.itemHeader}>
        <View style={styles.itemHeaderLeft}>
          <View
            style={[
              styles.statusIndicator,
              { backgroundColor: statusConfig?.color ?? '#e5e7eb' },
            ]}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.itemTitle}>
              {item.orderIndex}. {item.title}
              {item.isRequired && <Text style={styles.required}> *</Text>}
            </Text>
            {item.normReference && (
              <Text style={styles.normRef}>{item.normReference}</Text>
            )}
          </View>
        </View>
        <Text style={styles.chevron}>{isExpanded ? '▲' : '▼'}</Text>
      </View>

      {/* Conteúdo expandido */}
      {isExpanded && (
        <View style={styles.itemBody}>
          {/* Botões de status */}
          <Text style={styles.sectionLabel}>Resultado *</Text>
          <View style={styles.statusButtons}>
            {STATUS_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.statusBtn,
                  item.status === opt.value && { backgroundColor: opt.color },
                ]}
                onPress={() => handleStatusChange(opt.value)}
              >
                <Text
                  style={[
                    styles.statusBtnText,
                    item.status === opt.value && styles.statusBtnTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Medição */}
          {item.requiresMeasurement && (
            <View>
              <Text style={styles.sectionLabel}>
                Medição ({item.measurementUnit ?? 'unidade'})
                {item.measurementMin !== null && item.measurementMax !== null && (
                  <Text style={styles.measureRange}>
                    {' '}— aceito: {item.measurementMin}–{item.measurementMax}
                  </Text>
                )}
              </Text>
              <View style={styles.measureRow}>
                <TextInput
                  style={[
                    styles.measureInput,
                    item.measurementInRange === false && styles.measureInputError,
                    item.measurementInRange === true && styles.measureInputOk,
                  ]}
                  value={measurement}
                  onChangeText={setMeasurement}
                  keyboardType="decimal-pad"
                  placeholder="0.00"
                  onBlur={handleSaveMeasurement}
                />
                {item.measurementInRange !== null && (
                  <Text style={styles.measureStatus}>
                    {item.measurementInRange ? '✅' : '❌'}
                  </Text>
                )}
              </View>
            </View>
          )}

          {/* Nota do técnico */}
          <Text style={styles.sectionLabel}>Observação</Text>
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            onBlur={handleSaveNote}
            placeholder="Descreva o que foi encontrado..."
            multiline
            numberOfLines={3}
          />

          {/* Fotos */}
          <Text style={styles.sectionLabel}>
            Fotos {item.requiresPhoto ? '(obrigatório)' : '(opcional)'}
          </Text>
          <View style={styles.photosRow}>
            {item.photoUris.map((uri) => (
              <TouchableOpacity
                key={uri}
                onLongPress={() =>
                  Alert.alert('Remover foto?', '', [
                    { text: 'Cancelar' },
                    { text: 'Remover', style: 'destructive', onPress: () => handleRemovePhoto(uri) },
                  ])
                }
              >
                <Image source={{ uri }} style={styles.photoThumb} />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={styles.addPhotoBtn}
              onPress={handleTakePhoto}
              disabled={isCapturingPhoto}
            >
              {isCapturingPhoto ? (
                <ActivityIndicator color="#1E3A5F" />
              ) : (
                <Text style={styles.addPhotoText}>📷</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Tela principal ────────────────────────────────────────────────────────────

interface ChecklistScreenProps {
  checklist: Checklist;
  items: ChecklistItem[];
}

function ChecklistScreen({ checklist, items }: ChecklistScreenProps): React.ReactElement {
  const [expandedId, setExpandedId] = useState<string | null>(items[0]?.id ?? null);
  const [isCompleting, setIsCompleting] = useState(false);

  const completed = items.filter((i) => i.status !== 'PENDING').length;
  const progress = items.length > 0 ? completed / items.length : 0;
  const canComplete =
    items.every(
      (i) => !i.isRequired || i.status !== 'PENDING',
    ) && items.length > 0;

  async function handleComplete(): Promise<void> {
    if (!canComplete) {
      Alert.alert('Itens obrigatórios pendentes', 'Preencha todos os itens obrigatórios antes de concluir.');
      return;
    }

    Alert.alert(
      'Concluir checklist?',
      'Após concluir, o checklist será enviado para revisão do laudo.',
      [
        { text: 'Cancelar' },
        {
          text: 'Concluir',
          onPress: async () => {
            setIsCompleting(true);
            try {
              await database.write(async () => {
                await checklist.update((c) => {
                  c.completedAt = new Date();
                  c.isSynced = false;
                });
              });
              router.back();
            } finally {
              setIsCompleting(false);
            }
          },
        },
      ],
    );
  }

  return (
    <View style={styles.container}>
      <OfflineBanner />

      {/* Barra de progresso */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
        </View>
        <Text style={styles.progressText}>
          {completed}/{items.length} itens — {Math.round(progress * 100)}%
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.checklistTitle}>{checklist.title}</Text>

        {items.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            isExpanded={expandedId === item.id}
            onToggle={() => setExpandedId(expandedId === item.id ? null : item.id)}
          />
        ))}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Botão concluir */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.completeBtn, !canComplete && styles.completeBtnDisabled]}
          onPress={handleComplete}
          disabled={!canComplete || isCompleting}
        >
          {isCompleting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.completeBtnText}>
              {canComplete ? '✅ Concluir Checklist' : `Faltam itens obrigatórios`}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── withObservables — re-renderiza ao mudar dados no WatermelonDB ─────────────

const enhance = withObservables(['checklistId'], ({ checklistId }: { checklistId: string }) => ({
  checklist: database.collections.get<Checklist>('checklists').findAndObserve(checklistId),
  items: database.collections
    .get<ChecklistItem>('checklist_items')
    .query(Q.where('checklist_id', checklistId), Q.sortBy('order_index', Q.asc))
    .observe(),
}));

const EnhancedChecklistScreen = enhance(ChecklistScreen);

export default function ChecklistRoute(): React.ReactElement {
  const { checklistId } = useLocalSearchParams<{ checklistId: string }>();
  return <EnhancedChecklistScreen checklistId={checklistId} />;
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  progressContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    gap: 6,
  },
  progressBar: {
    height: 6,
    backgroundColor: '#e5e7eb',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: '#22c55e', borderRadius: 3 },
  progressText: { fontSize: 12, color: '#6b7280', textAlign: 'right' },
  scroll: { padding: 12, gap: 8 },
  checklistTitle: { fontSize: 18, fontWeight: '800', color: '#1E3A5F', marginBottom: 8 },
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  itemCardDone: { borderColor: '#d1fae5' },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  itemHeaderLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  statusIndicator: { width: 12, height: 12, borderRadius: 6, marginTop: 3 },
  itemTitle: { fontSize: 14, fontWeight: '600', color: '#111827', lineHeight: 20 },
  required: { color: '#ef4444' },
  normRef: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  chevron: { fontSize: 12, color: '#9ca3af' },
  itemBody: { marginTop: 14, gap: 10 },
  sectionLabel: { fontSize: 12, fontWeight: '700', color: '#374151', textTransform: 'uppercase', letterSpacing: 0.5 },
  statusButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  statusBtnText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  statusBtnTextActive: { color: '#fff' },
  measureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  measureInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: '#fff',
  },
  measureInputError: { borderColor: '#ef4444' },
  measureInputOk: { borderColor: '#22c55e' },
  measureStatus: { fontSize: 20 },
  measureRange: { fontSize: 11, color: '#9ca3af' },
  noteInput: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
    textAlignVertical: 'top',
    minHeight: 72,
  },
  photosRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photoThumb: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#e5e7eb' },
  addPhotoBtn: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoText: { fontSize: 24 },
  footer: {
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  completeBtn: {
    backgroundColor: '#1E3A5F',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  completeBtnDisabled: { backgroundColor: '#9ca3af' },
  completeBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
