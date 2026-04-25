/**
 * location.gateway.spec.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests para LocationGateway.
 * Socket, Redis, Prisma e NotificationsService são todos mockados.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WsException } from '@nestjs/websockets';

import { LocationGateway } from './location.gateway';
import { RedisService } from '../database/redis.service';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../modules/notifications/notifications.service';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const ORDER_ID = 'order-aaaa-bbbb-cccc';
const TECH_ID = 'tech-1111-2222-3333';
const OWNER_ID = 'owner-aaaa-bbbb';

const makeClient = (userId: string, role = 'TECHNICIAN') =>
  ({
    id: `socket-${userId}`,
    data: { userId, role },
    handshake: {
      auth: { token: 'valid-jwt' },
      headers: {},
    },
    emit: jest.fn(),
    join: jest.fn(),
    leave: jest.fn(),
    disconnect: jest.fn(),
  }) as unknown as import('socket.io').Socket;

const mockOrder = {
  id: ORDER_ID,
  ownerId: OWNER_ID,
  property: { latitude: -23.5, longitude: -46.6, address: 'Rua Teste, 123' },
};

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('LocationGateway', () => {
  let gateway: LocationGateway;
  let prisma: jest.Mocked<PrismaService>;
  let redis: jest.Mocked<RedisService>;
  let notifications: jest.Mocked<NotificationsService>;
  let jwtService: jest.Mocked<JwtService>;

  // Mock do servidor WebSocket
  const mockServer = { to: jest.fn().mockReturnThis(), emit: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationGateway,
        {
          provide: PrismaService,
          useValue: {
            serviceOrder: { findFirst: jest.fn(), update: jest.fn() },
            user: { findUnique: jest.fn() },
          },
        },
        {
          provide: RedisService,
          useValue: {
            setJson: jest.fn().mockResolvedValue(undefined),
            getJson: jest.fn().mockResolvedValue(null),
            get: jest.fn().mockResolvedValue(null),
            set: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: JwtService,
          useValue: {
            verify: jest.fn().mockReturnValue({ sub: TECH_ID, role: 'TECHNICIAN' }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('test-jwt-secret'),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            sendPush: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    gateway = module.get(LocationGateway);
    prisma = module.get(PrismaService) as jest.Mocked<PrismaService>;
    redis = module.get(RedisService) as jest.Mocked<RedisService>;
    notifications = module.get(NotificationsService) as jest.Mocked<NotificationsService>;
    jwtService = module.get(JwtService) as jest.Mocked<JwtService>;

    // Injeta mock do servidor WebSocket
    (gateway as unknown as { server: typeof mockServer }).server = mockServer;
  });

  // ── afterInit ─────────────────────────────────────────────────────────────

  describe('afterInit()', () => {
    it('deve logar inicialização sem lançar erro', () => {
      expect(() => gateway.afterInit()).not.toThrow();
    });
  });

  // ── handleConnection ──────────────────────────────────────────────────────

  describe('handleConnection()', () => {
    it('deve aceitar conexão com token válido', async () => {
      const client = makeClient(TECH_ID);
      await gateway.handleConnection(client);
      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.data.userId).toBe(TECH_ID);
    });

    it('deve rejeitar conexão com token inválido', async () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid token');
      });
      const client = makeClient(TECH_ID);
      await gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('deve rejeitar conexão sem token', async () => {
      const client = {
        ...makeClient(TECH_ID),
        handshake: { auth: {}, headers: {} },
      } as unknown as import('socket.io').Socket;
      await gateway.handleConnection(client);
      expect(client.disconnect).toHaveBeenCalled();
    });
  });

  // ── handleDisconnect ──────────────────────────────────────────────────────

  describe('handleDisconnect()', () => {
    it('deve remover técnico do mapa de conectados', () => {
      const client = makeClient(TECH_ID);
      // Simula que o técnico estava registrado
      const internalMap = (gateway as unknown as { connectedTechnicians: Map<string, string> }).connectedTechnicians;
      internalMap.set(client.id, TECH_ID);

      gateway.handleDisconnect(client);
      expect(internalMap.has(client.id)).toBe(false);
    });
  });

  // ── handleLocationUpdate ──────────────────────────────────────────────────

  describe('handleLocationUpdate()', () => {
    const basePayload = {
      serviceOrderId: ORDER_ID,
      latitude: -23.55,
      longitude: -46.63,
    };

    it('deve salvar no Redis e emitir location:updated + order:location', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.serviceOrder.update as jest.Mock).mockResolvedValue({});

      const client = makeClient(TECH_ID);
      await gateway.handleLocationUpdate(client, basePayload);

      expect(redis.setJson).toHaveBeenCalledWith(
        expect.stringContaining('location:technician'),
        expect.objectContaining({ latitude: -23.55, longitude: -46.63 }),
        90,
      );
      expect(redis.setJson).toHaveBeenCalledWith(
        `location:${TECH_ID}`,
        expect.any(Object),
        90,
      );
      expect(mockServer.to).toHaveBeenCalledWith(`order:${ORDER_ID}`);
      expect(mockServer.emit).toHaveBeenCalledWith('location:updated', expect.any(Object));
      expect(mockServer.emit).toHaveBeenCalledWith('order:location', expect.objectContaining({
        lat: -23.55,
        lng: -46.63,
      }));
    });

    it('deve emitir erro se OS não atribuída ao técnico', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue(null);

      const client = makeClient(TECH_ID);
      await gateway.handleLocationUpdate(client, basePayload);

      expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('OS não encontrada'),
      }));
      expect(redis.setJson).not.toHaveBeenCalled();
    });

    it('deve persistir lat/lng no banco via serviceOrder.update', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.serviceOrder.update as jest.Mock).mockResolvedValue({});

      const client = makeClient(TECH_ID);
      await gateway.handleLocationUpdate(client, basePayload);

      expect(prisma.serviceOrder.update).toHaveBeenCalledWith({
        where: { id: ORDER_ID },
        data: {
          technicianLatitude: -23.55,
          technicianLongitude: -46.63,
        },
      });
    });

    it('deve registrar técnico no mapa connectedTechnicians', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue(mockOrder);
      (prisma.serviceOrder.update as jest.Mock).mockResolvedValue({});

      const client = makeClient(TECH_ID);
      await gateway.handleLocationUpdate(client, basePayload);

      const internalMap = (gateway as unknown as { connectedTechnicians: Map<string, string> }).connectedTechnicians;
      expect(internalMap.get(client.id)).toBe(TECH_ID);
    });
  });

  // ── tech:location alias ───────────────────────────────────────────────────

  describe('handleTechLocation()', () => {
    it('deve delegar para handleLocationUpdate', async () => {
      const spy = jest.spyOn(gateway, 'handleLocationUpdate').mockResolvedValue();
      const client = makeClient(TECH_ID);
      await gateway.handleTechLocation(client, { serviceOrderId: ORDER_ID, latitude: 0, longitude: 0 });
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  // ── handleSubscribe ───────────────────────────────────────────────────────

  describe('handleSubscribe()', () => {
    it('deve entrar na room e emitir location:subscribed', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue({
        id: ORDER_ID,
        technicianId: TECH_ID,
      });
      (redis.getJson as jest.Mock).mockResolvedValue(null);

      const client = makeClient(OWNER_ID, 'OWNER');
      await gateway.handleSubscribe(client, { serviceOrderId: ORDER_ID });

      expect(client.join).toHaveBeenCalledWith(`order:${ORDER_ID}`);
      expect(client.emit).toHaveBeenCalledWith('location:subscribed', {
        serviceOrderId: ORDER_ID,
      });
    });

    it('deve enviar lastLocation do Redis ao fazer subscribe', async () => {
      const cachedLocation = { latitude: -23.5, longitude: -46.6 };
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue({
        id: ORDER_ID,
        technicianId: TECH_ID,
      });
      (redis.getJson as jest.Mock).mockResolvedValue(cachedLocation);

      const client = makeClient(OWNER_ID, 'OWNER');
      await gateway.handleSubscribe(client, { serviceOrderId: ORDER_ID });

      expect(client.emit).toHaveBeenCalledWith('location:updated', cachedLocation);
    });

    it('deve emitir erro se OS não encontrada / acesso negado', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue(null);

      const client = makeClient('random-user', 'OWNER');
      await gateway.handleSubscribe(client, { serviceOrderId: ORDER_ID });

      expect(client.emit).toHaveBeenCalledWith('error', expect.objectContaining({
        message: expect.stringContaining('Acesso negado'),
      }));
      expect(client.join).not.toHaveBeenCalled();
    });
  });

  // ── handleUnsubscribe ─────────────────────────────────────────────────────

  describe('handleUnsubscribe()', () => {
    it('deve sair da room e emitir location:unsubscribed', async () => {
      const client = makeClient(OWNER_ID, 'OWNER');
      await gateway.handleUnsubscribe(client, { serviceOrderId: ORDER_ID });

      expect(client.leave).toHaveBeenCalledWith(`order:${ORDER_ID}`);
      expect(client.emit).toHaveBeenCalledWith('location:unsubscribed', {
        serviceOrderId: ORDER_ID,
      });
    });
  });

  // ── Alerta de proximidade 500m ────────────────────────────────────────────

  describe('checkProximityAlert() (via handleLocationUpdate)', () => {
    // mockOrder já inclui owner.fcmTokens — ver fixture no topo do arquivo
    const FCM_TOKENS = ['fcm-token-abc', 'fcm-token-xyz'];

    // Posição a ~400m do mockOrder.property (-23.5, -46.6)
    const nearPayload = {
      serviceOrderId: ORDER_ID,
      latitude: -23.496,    // ~400m de -23.5
      longitude: -46.6,
    };

    // Posição a ~2km de distância
    const farPayload = {
      serviceOrderId: ORDER_ID,
      latitude: -23.52,    // ~2km de -23.5
      longitude: -46.6,
    };

    it('deve enviar push quando técnico está a < 500m', async () => {
      // ISSUE #8: tokens vêm do join com owner — sem user.findUnique
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue({
        ...mockOrder,
        owner: { fcmTokens: FCM_TOKENS },
      });
      (prisma.serviceOrder.update as jest.Mock).mockResolvedValue({});
      (redis.get as jest.Mock).mockResolvedValue(null);

      const client = makeClient(TECH_ID);
      await gateway.handleLocationUpdate(client, nearPayload);

      expect(notifications.sendPush).toHaveBeenCalledWith(
        FCM_TOKENS,
        expect.stringContaining('Técnico'),
        expect.stringContaining('500m'),
        expect.objectContaining({
          type: 'TECHNICIAN_NEARBY',
          serviceOrderId: ORDER_ID,
        }),
      );
      // Garantia do N+1 fix: user.findUnique NÃO deve ser chamado
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('não deve enviar push quando técnico está a > 500m', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue({
        ...mockOrder,
        owner: { fcmTokens: FCM_TOKENS },
      });
      (prisma.serviceOrder.update as jest.Mock).mockResolvedValue({});

      const client = makeClient(TECH_ID);
      await gateway.handleLocationUpdate(client, farPayload);

      expect(notifications.sendPush).not.toHaveBeenCalled();
    });

    it('não deve enviar push duplicado (dedup Redis ativo)', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue({
        ...mockOrder,
        owner: { fcmTokens: FCM_TOKENS },
      });
      (prisma.serviceOrder.update as jest.Mock).mockResolvedValue({});
      (redis.get as jest.Mock).mockResolvedValue('1'); // flag de dedup ativo

      const client = makeClient(TECH_ID);
      await gateway.handleLocationUpdate(client, nearPayload);

      expect(notifications.sendPush).not.toHaveBeenCalled();
    });

    it('deve gravar flag de dedup no Redis após enviar push', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue({
        ...mockOrder,
        owner: { fcmTokens: FCM_TOKENS },
      });
      (prisma.serviceOrder.update as jest.Mock).mockResolvedValue({});
      (redis.get as jest.Mock).mockResolvedValue(null);

      const client = makeClient(TECH_ID);
      await gateway.handleLocationUpdate(client, nearPayload);

      expect(redis.set).toHaveBeenCalledWith(
        `proximity:alert:${ORDER_ID}`,
        '1',
        600, // PROXIMITY_ALERT_DEDUP_TTL_S
      );
    });

    it('não deve enviar push se proprietário não tem fcmTokens', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue({
        ...mockOrder,
        owner: { fcmTokens: [] }, // lista vazia
      });
      (prisma.serviceOrder.update as jest.Mock).mockResolvedValue({});
      (redis.get as jest.Mock).mockResolvedValue(null);

      const client = makeClient(TECH_ID);
      await gateway.handleLocationUpdate(client, nearPayload);

      expect(notifications.sendPush).not.toHaveBeenCalled();
    });

    it('não deve verificar proximidade se property não tem coordenadas', async () => {
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue({
        ...mockOrder,
        property: { latitude: null, longitude: null, address: null },
        owner: { fcmTokens: FCM_TOKENS },
      });
      (prisma.serviceOrder.update as jest.Mock).mockResolvedValue({});

      const client = makeClient(TECH_ID);
      await gateway.handleLocationUpdate(client, nearPayload);

      expect(notifications.sendPush).not.toHaveBeenCalled();
    });
  });

  // ── haversineMeters (via checkProximityAlert) ─────────────────────────────

  describe('haversineMeters() (método privado — testado indiretamente)', () => {
    it('distância entre dois pontos iguais deve ser ~0m', async () => {
      const order = {
        ...mockOrder,
        property: { latitude: -23.5, longitude: -46.6, address: 'X' },
      };
      (prisma.serviceOrder.findFirst as jest.Mock).mockResolvedValue(order);
      (prisma.serviceOrder.update as jest.Mock).mockResolvedValue({});
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ fcmTokens: ['t'], name: 'A' });
      (redis.get as jest.Mock).mockResolvedValue(null);

      const client = makeClient(TECH_ID);
      // Mesma coordenada da propriedade → deve enviar push (distância ≈ 0m < 500m)
      await gateway.handleLocationUpdate(client, {
        serviceOrderId: ORDER_ID,
        latitude: -23.5,
        longitude: -46.6,
      });

      expect(notifications.sendPush).toHaveBeenCalled();
    });
  });
});
