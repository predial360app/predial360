/**
 * Tela de cadastro de imóvel — Stepper 3 etapas:
 *  1. Tipo e nome
 *  2. Endereço + geolocalização
 *  3. Perfil técnico (área, idade, sistemas)
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import * as Location from 'expo-location';

import { useCreateProperty } from '../../../src/hooks/useProperties';
import type { CreatePropertyPayload } from '../../../src/services/properties.service';

type PropertyType = 'RESIDENTIAL' | 'CLINIC' | 'COMMERCE' | 'MIXED';

const PROPERTY_TYPE_OPTIONS: { value: PropertyType; label: string; emoji: string }[] = [
  { value: 'RESIDENTIAL', label: 'Residência', emoji: '🏠' },
  { value: 'CLINIC', label: 'Clínica', emoji: '🏥' },
  { value: 'COMMERCE', label: 'Comércio', emoji: '🏪' },
  { value: 'MIXED', label: 'Uso Misto', emoji: '🏢' },
];

const TOTAL_STEPS = 3;

export default function RegisterPropertyScreen(): React.ReactElement {
  const [step, setStep] = useState(1);
  const [isGeolocating, setIsGeolocating] = useState(false);

  // ── Form state ────────────────────────────────────────────────────────────
  const [form, setForm] = useState<Partial<CreatePropertyPayload>>({
    type: 'RESIDENTIAL',
    name: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    zipCode: '',
    buildingAge: undefined,
    totalArea: undefined,
    constructionYear: undefined,
  });

  const createMutation = useCreateProperty();

  function updateField<K extends keyof CreatePropertyPayload>(
    key: K,
    value: CreatePropertyPayload[K],
  ): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // ── Geolocalização ────────────────────────────────────────────────────────
  async function fetchLocation(): Promise<void> {
    setIsGeolocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permissão negada', 'Habilite a localização nas configurações.');
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      updateField('latitude', location.coords.latitude);
      updateField('longitude', location.coords.longitude);
    } catch {
      Alert.alert('Erro', 'Não foi possível obter a localização.');
    } finally {
      setIsGeolocating(false);
    }
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit(): Promise<void> {
    const payload = form as CreatePropertyPayload;
    try {
      const property = await createMutation.mutateAsync(payload);
      Alert.alert('✅ Imóvel cadastrado!', `"${property.name}" foi criado com sucesso.`, [
        { text: 'Ver imóvel', onPress: () => router.replace(`/(owner)/property/${property.id}`) },
      ]);
    } catch {
      Alert.alert('Erro', 'Não foi possível cadastrar o imóvel. Tente novamente.');
    }
  }

  // ── Steps ─────────────────────────────────────────────────────────────────
  function renderStep1(): React.ReactElement {
    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Tipo do Imóvel</Text>
        <View style={styles.typeGrid}>
          {PROPERTY_TYPE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.typeCard, form.type === opt.value && styles.typeCardActive]}
              onPress={() => updateField('type', opt.value)}
            >
              <Text style={styles.typeEmoji}>{opt.emoji}</Text>
              <Text style={[styles.typeLabel, form.type === opt.value && styles.typeLabelActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Nome do imóvel *</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex.: Apartamento Vila Madalena"
          value={form.name}
          onChangeText={(v) => updateField('name', v)}
          maxLength={100}
        />

        <Text style={styles.label}>Descrição (opcional)</Text>
        <TextInput
          style={[styles.input, styles.textArea]}
          placeholder="Ex.: Apartamento com 3 quartos, 2 banheiros..."
          value={form.description}
          onChangeText={(v) => updateField('description', v)}
          multiline
          numberOfLines={3}
        />
      </View>
    );
  }

  function renderStep2(): React.ReactElement {
    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Endereço</Text>

        <TouchableOpacity style={styles.geoButton} onPress={fetchLocation} disabled={isGeolocating}>
          {isGeolocating ? (
            <ActivityIndicator color="#1E3A5F" size="small" />
          ) : (
            <Text style={styles.geoButtonText}>
              {form.latitude ? '📍 Localização capturada' : '📍 Usar minha localização atual'}
            </Text>
          )}
        </TouchableOpacity>

        <View style={styles.row}>
          <View style={{ flex: 2 }}>
            <Text style={styles.label}>Rua / Avenida *</Text>
            <TextInput
              style={styles.input}
              placeholder="Rua Harmonia"
              value={form.street}
              onChangeText={(v) => updateField('street', v)}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.label}>Número *</Text>
            <TextInput
              style={styles.input}
              placeholder="500"
              value={form.number}
              onChangeText={(v) => updateField('number', v)}
              keyboardType="numeric"
            />
          </View>
        </View>

        <Text style={styles.label}>Complemento</Text>
        <TextInput
          style={styles.input}
          placeholder="Apto 42, Sala 3..."
          value={form.complement}
          onChangeText={(v) => updateField('complement', v)}
        />

        <Text style={styles.label}>Bairro *</Text>
        <TextInput
          style={styles.input}
          placeholder="Vila Madalena"
          value={form.neighborhood}
          onChangeText={(v) => updateField('neighborhood', v)}
        />

        <View style={styles.row}>
          <View style={{ flex: 2 }}>
            <Text style={styles.label}>Cidade *</Text>
            <TextInput
              style={styles.input}
              placeholder="São Paulo"
              value={form.city}
              onChangeText={(v) => updateField('city', v)}
            />
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.label}>UF *</Text>
            <TextInput
              style={styles.input}
              placeholder="SP"
              value={form.state}
              onChangeText={(v) => updateField('state', v.toUpperCase())}
              maxLength={2}
              autoCapitalize="characters"
            />
          </View>
        </View>

        <Text style={styles.label}>CEP *</Text>
        <TextInput
          style={styles.input}
          placeholder="00000-000"
          value={form.zipCode}
          onChangeText={(v) => updateField('zipCode', v)}
          keyboardType="numeric"
          maxLength={9}
        />
      </View>
    );
  }

  function renderStep3(): React.ReactElement {
    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Perfil Técnico</Text>
        <Text style={styles.stepSubtitle}>
          Estas informações permitem que a IA calcule o score de saúde e gere o plano preventivo
          conforme a NBR 5674.
        </Text>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Idade (anos)</Text>
            <TextInput
              style={styles.input}
              placeholder="15"
              value={form.buildingAge?.toString()}
              onChangeText={(v) => updateField('buildingAge', Number(v) || undefined)}
              keyboardType="numeric"
            />
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.label}>Área total (m²)</Text>
            <TextInput
              style={styles.input}
              placeholder="82,5"
              value={form.totalArea?.toString()}
              onChangeText={(v) => updateField('totalArea', parseFloat(v.replace(',', '.')) || undefined)}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Andares</Text>
            <TextInput
              style={styles.input}
              placeholder="8"
              value={form.floors?.toString()}
              onChangeText={(v) => updateField('floors', Number(v) || undefined)}
              keyboardType="numeric"
            />
          </View>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={styles.label}>Ano de construção</Text>
            <TextInput
              style={styles.input}
              placeholder="2009"
              value={form.constructionYear?.toString()}
              onChangeText={(v) => updateField('constructionYear', Number(v) || undefined)}
              keyboardType="numeric"
              maxLength={4}
            />
          </View>
        </View>

        <Text style={styles.label}>Matrícula do imóvel</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex.: 12.345-678-901"
          value={form.registrationNumber}
          onChangeText={(v) => updateField('registrationNumber', v)}
        />
      </View>
    );
  }

  function canProceed(): boolean {
    if (step === 1) return !!form.name && form.name.length >= 3;
    if (step === 2)
      return !!form.street && !!form.number && !!form.neighborhood &&
        !!form.city && !!form.state && !!form.zipCode;
    return true;
  }

  return (
    <View style={styles.container}>
      {/* Header com stepper */}
      <View style={styles.stepperHeader}>
        {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
          <React.Fragment key={s}>
            <View style={[styles.stepCircle, s <= step && styles.stepCircleActive]}>
              <Text style={[styles.stepNumber, s <= step && styles.stepNumberActive]}>
                {s < step ? '✓' : String(s)}
              </Text>
            </View>
            {s < TOTAL_STEPS && (
              <View style={[styles.stepLine, s < step && styles.stepLineActive]} />
            )}
          </React.Fragment>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
      </ScrollView>

      {/* Botões de navegação */}
      <View style={styles.footer}>
        {step > 1 && (
          <TouchableOpacity style={styles.backButton} onPress={() => setStep((s) => s - 1)}>
            <Text style={styles.backButtonText}>← Voltar</Text>
          </TouchableOpacity>
        )}

        {step < TOTAL_STEPS ? (
          <TouchableOpacity
            style={[styles.nextButton, !canProceed() && styles.buttonDisabled]}
            disabled={!canProceed()}
            onPress={() => setStep((s) => s + 1)}
          >
            <Text style={styles.nextButtonText}>Próximo →</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.nextButton, createMutation.isPending && styles.buttonDisabled]}
            disabled={createMutation.isPending}
            onPress={handleSubmit}
          >
            {createMutation.isPending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.nextButtonText}>Cadastrar Imóvel ✓</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const PRIMARY = '#1E3A5F';
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  stepperHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 40,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  stepCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleActive: { backgroundColor: PRIMARY },
  stepNumber: { fontSize: 14, fontWeight: '700', color: '#6b7280' },
  stepNumberActive: { color: '#fff' },
  stepLine: { flex: 1, height: 2, backgroundColor: '#e5e7eb', marginHorizontal: 4 },
  stepLineActive: { backgroundColor: PRIMARY },
  scroll: { padding: 20, paddingBottom: 40 },
  stepContent: { gap: 4 },
  stepTitle: { fontSize: 22, fontWeight: '800', color: PRIMARY, marginBottom: 16 },
  stepSubtitle: { fontSize: 13, color: '#6b7280', marginBottom: 16, lineHeight: 20 },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 20,
  },
  typeCard: {
    flex: 1,
    minWidth: '44%',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    padding: 16,
    alignItems: 'center',
  },
  typeCardActive: { borderColor: PRIMARY, backgroundColor: '#EEF2FF' },
  typeEmoji: { fontSize: 28, marginBottom: 6 },
  typeLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  typeLabelActive: { color: PRIMARY },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 12, marginBottom: 4 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row' },
  geoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: PRIMARY,
  },
  geoButtonText: { color: PRIMARY, fontWeight: '600', fontSize: 14 },
  footer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  backButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#d1d5db',
    alignItems: 'center',
  },
  backButtonText: { fontSize: 15, fontWeight: '600', color: '#374151' },
  nextButton: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: PRIMARY,
    alignItems: 'center',
  },
  nextButtonText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  buttonDisabled: { opacity: 0.5 },
});
