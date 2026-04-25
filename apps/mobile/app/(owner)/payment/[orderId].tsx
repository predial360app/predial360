/**
 * Tela de Pagamento Pix — MÓDULO 7
 * ───────────────────────────────────────────────────────────────────────────
 * Fluxo do proprietário:
 *  1. Abre tela com detalhes da OS aguardando aprovação
 *  2. Toca em "Gerar Pix" → app cria cobrança via POST /payments/pix
 *  3. QR Code exibido (base64 PNG) + botão copiar código
 *  4. Status atualizado em tempo real via polling (React Query refetch)
 *     ou WebSocket (evento payment:confirmed emitido pelo backend)
 *  5. Ao confirmar → navega para tela da OS aprovada
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  ScrollView,
  Alert,
  ActivityIndicator,
  Clipboard,
  StyleSheet,
  Animated,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { io, type Socket } from 'socket.io-client';

import { apiClient } from '../../../src/lib/api-client';
import { tokenStorage } from '../../../src/lib/api-client';

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface ServiceOrderSummary {
  id: string;
  code: string;
  title: string;
  status: string;
  finalCost: number | null;
  technician: { name: string; rating: string | null } | null;
}

interface PixData {
  paymentId: string;
  amountCents: number;
  amountFormatted: string;
  status: string;
  dueDate: string;
  pix: {
    qrCodeBase64: string;
    copyPaste: string;
    expiresAt: string;
  };
}

interface ExistingPayment {
  id: string;
  status: string;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  pixQrCode: string | null;
  pixCopyPaste: string | null;
}

// ─── Hook: buscar OS ──────────────────────────────────────────────────────────

function useServiceOrder(orderId: string) {
  return useQuery({
    queryKey: ['service-order', orderId],
    queryFn: async () => {
      const { data } = await apiClient.get<ServiceOrderSummary>(`/service-orders/${orderId}`);
      return data;
    },
    staleTime: 30_000,
  });
}

// ─── Hook: buscar pagamento existente ─────────────────────────────────────────

function usePayment(orderId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['payment', orderId],
    queryFn: async () => {
      const { data } = await apiClient.get<ExistingPayment>(
        `/payments/service-order/${orderId}`,
      );
      return data;
    },
    enabled,
    refetchInterval: (query) => {
      // Polling de 5s enquanto status for PENDING
      const status = query.state.data?.status;
      return status === 'PENDING' ? 5000 : false;
    },
    retry: false,
  });
}

// ─── Hook: criar cobrança Pix ─────────────────────────────────────────────────

function useCreatePix(orderId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (amountCents: number): Promise<PixData> => {
      const { data } = await apiClient.post<PixData>('/payments/pix', {
        serviceOrderId: orderId,
        amountCents,
        description: `Serviço Predial360 — OS #${orderId.slice(0, 8)}`,
      });
      return data;
    },
    onSuccess: (data) => {
      // Injeta no cache do React Query
      queryClient.setQueryData(['payment', orderId], {
        id: data.paymentId,
        status: data.status,
        amount: data.amountCents,
        dueDate: data.dueDate,
        paidAt: null,
        pixQrCode: data.pix.qrCodeBase64,
        pixCopyPaste: data.pix.copyPaste,
      } satisfies ExistingPayment);
    },
  });
}

// ─── Componente de status ─────────────────────────────────────────────────────

function PaymentStatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; bg: string; text: string }> = {
    PENDING: { label: 'Aguardando pagamento', bg: '#FEF9C3', text: '#854D0E' },
    CONFIRMED: { label: 'Pagamento confirmado ✅', bg: '#DCFCE7', text: '#166534' },
    RECEIVED: { label: 'Pagamento recebido ✅', bg: '#DCFCE7', text: '#166534' },
    OVERDUE: { label: 'Vencido ⚠️', bg: '#FEE2E2', text: '#991B1B' },
    CANCELLED: { label: 'Cancelado', bg: '#F1F5F9', text: '#475569' },
    REFUNDED: { label: 'Estornado', bg: '#F1F5F9', text: '#475569' },
  };

  const c = config[status] ?? config['PENDING']!;

  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <Text style={[styles.badgeText, { color: c.text }]}>{c.label}</Text>
    </View>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────

const API_URL = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000';
const WS_URL = API_URL.replace('/api/v1', '');

export default function PaymentScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [pixData, setPixData] = useState<PixData | null>(null);
  const [copied, setCopied] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const orderQuery = useServiceOrder(orderId);
  const paymentQuery = usePayment(orderId, !pixData);
  const createPix = useCreatePix(orderId);

  // Determinar custo da OS para o valor da cobrança
  const order = orderQuery.data;
  const payment = paymentQuery.data;
  const finalCostCents = order?.finalCost ? Math.round(order.finalCost * 100) : 0;

  // ── WebSocket: escuta confirmação de pagamento ──────────────────────────

  useEffect(() => {
    const token = tokenStorage.getString('accessToken');
    if (!token) return;

    const socket: Socket = io(`${WS_URL}/payments`, {
      auth: { token },
      transports: ['websocket'],
    });

    socket.emit('payment:subscribe', { serviceOrderId: orderId });

    socket.on('payment:confirmed', (data: { serviceOrderId: string; paymentId: string }) => {
      if (data.serviceOrderId === orderId) {
        // Invalida os caches para refetch imediato
        void queryClient.invalidateQueries({ queryKey: ['payment', orderId] });
        void queryClient.invalidateQueries({ queryKey: ['service-order', orderId] });

        Alert.alert(
          '🎉 Pagamento confirmado!',
          'Seu pagamento via Pix foi recebido. A OS foi aprovada e o serviço será iniciado em breve.',
          [
            {
              text: 'Ver OS',
              onPress: () => router.replace(`/(owner)/orders/${orderId}`),
            },
          ],
        );
      }
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [orderId, queryClient, router]);

  // ── Animação de pulso enquanto aguarda ─────────────────────────────────

  useEffect(() => {
    const isPending = payment?.status === 'PENDING' || pixData?.status === 'PENDING';
    if (!isPending) return;

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.05, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [payment?.status, pixData?.status, pulseAnim]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleGeneratePix = useCallback(async () => {
    if (!finalCostCents) {
      Alert.alert(
        'Valor não definido',
        'O técnico ainda não informou o custo final da OS.',
      );
      return;
    }

    try {
      const data = await createPix.mutateAsync(finalCostCents);
      setPixData(data);
    } catch {
      Alert.alert(
        'Erro ao gerar cobrança',
        'Não foi possível criar a cobrança Pix. Tente novamente.',
      );
    }
  }, [finalCostCents, createPix]);

  const handleCopyCopyPaste = useCallback(() => {
    const code = pixData?.pix.copyPaste ?? payment?.pixCopyPaste;
    if (!code) return;

    Clipboard.setString(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }, [pixData, payment]);

  // ── Determinar o QR Code e status a exibir ─────────────────────────────

  const displayStatus = pixData?.status ?? payment?.status;
  const qrCodeBase64 = pixData?.pix.qrCodeBase64 ?? payment?.pixQrCode;
  const isConfirmed = displayStatus === 'CONFIRMED' || displayStatus === 'RECEIVED';
  const hasPix = !!qrCodeBase64;

  // ── Render ─────────────────────────────────────────────────────────────

  if (orderQuery.isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1E3A5F" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Cabeçalho da OS */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Ordem de Serviço</Text>
        <Text style={styles.osCode}>{order?.code ?? '—'}</Text>
        <Text style={styles.osTitle}>{order?.title}</Text>
        {order?.technician && (
          <Text style={styles.techName}>
            Técnico: {order.technician.name}
            {order.technician.rating ? ` ⭐ ${order.technician.rating}` : ''}
          </Text>
        )}
      </View>

      {/* Valor e status */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Valor do Serviço</Text>
        <Text style={styles.amount}>
          {finalCostCents
            ? `R$ ${(finalCostCents / 100).toFixed(2).replace('.', ',')}`
            : 'Aguardando custo final'}
        </Text>

        {displayStatus && <PaymentStatusBadge status={displayStatus} />}

        {payment?.paidAt && (
          <Text style={styles.paidAt}>
            Pago em {new Date(payment.paidAt).toLocaleDateString('pt-BR')}
          </Text>
        )}
      </View>

      {/* QR Code Pix */}
      {hasPix && !isConfirmed && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>QR Code Pix</Text>
          <Text style={styles.qrInstructions}>
            Abra o app do seu banco e escaneie o código abaixo ou copie o código Pix Copia e Cola.
          </Text>

          <Animated.View style={[styles.qrWrapper, { transform: [{ scale: pulseAnim }] }]}>
            <Image
              source={{ uri: `data:image/png;base64,${qrCodeBase64}` }}
              style={styles.qrImage}
              resizeMode="contain"
            />
          </Animated.View>

          <TouchableOpacity style={styles.copyBtn} onPress={handleCopyCopyPaste}>
            <Text style={styles.copyBtnText}>
              {copied ? '✅ Código copiado!' : '📋 Copiar Pix Copia e Cola'}
            </Text>
          </TouchableOpacity>

          <Text style={styles.expiry}>
            ⏳ Válido até{' '}
            {pixData?.pix.expiresAt
              ? new Date(pixData.pix.expiresAt).toLocaleString('pt-BR')
              : '—'}
          </Text>
        </View>
      )}

      {/* Confirmação */}
      {isConfirmed && (
        <View style={[styles.card, styles.confirmedCard]}>
          <Text style={styles.confirmedEmoji}>✅</Text>
          <Text style={styles.confirmedTitle}>Pagamento confirmado!</Text>
          <Text style={styles.confirmedText}>
            O serviço foi aprovado. Acompanhe o andamento na tela da OS.
          </Text>
          <TouchableOpacity
            style={styles.btnPrimary}
            onPress={() => router.replace(`/(owner)/orders/${orderId}`)}
          >
            <Text style={styles.btnPrimaryText}>Ver OS aprovada</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Botão gerar Pix */}
      {!hasPix && !isConfirmed && (
        <View style={styles.generateSection}>
          <Text style={styles.generateInfo}>
            Ao confirmar o pagamento Pix, a OS será aprovada automaticamente e o técnico será
            notificado para iniciar o serviço.
          </Text>

          <TouchableOpacity
            style={[
              styles.btnPrimary,
              (!finalCostCents || createPix.isPending) && styles.btnDisabled,
            ]}
            onPress={handleGeneratePix}
            disabled={!finalCostCents || createPix.isPending}
          >
            {createPix.isPending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.btnPrimaryText}>
                💰 Gerar QR Code Pix
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 40,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Card
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    gap: 8,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // OS info
  osCode: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1E3A5F',
  },
  osTitle: {
    fontSize: 14,
    color: '#475569',
  },
  techName: {
    fontSize: 13,
    color: '#64748B',
  },

  // Valor
  amount: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1E3A5F',
  },
  paidAt: {
    fontSize: 12,
    color: '#64748B',
  },

  // Badge status
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
  },

  // QR Code
  qrInstructions: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  qrWrapper: {
    alignItems: 'center',
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  qrImage: {
    width: 220,
    height: 220,
  },
  copyBtn: {
    backgroundColor: '#EFF6FF',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  copyBtnText: {
    color: '#1D4ED8',
    fontWeight: '600',
    fontSize: 14,
  },
  expiry: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
  },

  // Confirmação
  confirmedCard: {
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#86EFAC',
    gap: 12,
    paddingVertical: 24,
  },
  confirmedEmoji: {
    fontSize: 48,
  },
  confirmedTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#166534',
  },
  confirmedText: {
    fontSize: 14,
    color: '#166534',
    textAlign: 'center',
    lineHeight: 20,
  },

  // Seção gerar Pix
  generateSection: {
    gap: 16,
  },
  generateInfo: {
    fontSize: 13,
    color: '#64748B',
    lineHeight: 20,
    textAlign: 'center',
  },

  // Botão principal
  btnPrimary: {
    backgroundColor: '#1E3A5F',
    padding: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.5,
  },
});
