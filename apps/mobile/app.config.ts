/**
 * app.config.ts — Configuração dinâmica do Expo (substitui app.json em builds EAS)
 * ─────────────────────────────────────────────────────────────────────────────
 * Permite injetar variáveis de ambiente em tempo de build (EAS) e desenvolvimento.
 *
 * EAS Preview: defina EXPO_PUBLIC_API_URL nas "env" do perfil em eas.json
 *              ou via: eas env:create --scope project --name EXPO_PUBLIC_API_URL
 */
import type { ExpoConfig, ConfigContext } from 'expo/config';
import { existsSync } from 'fs';
import { join } from 'path';

export default ({ config }: ConfigContext): ExpoConfig => {
  const apiUrl =
    process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000/api/v1';

  const isDev = process.env['APP_VARIANT'] === 'development';
  const isPreview = process.env['APP_VARIANT'] === 'preview';

  return {
    ...config,
    name: isDev ? 'Predial360 (Dev)' : isPreview ? 'Predial360 Preview' : 'Predial360',
    slug: 'predial360',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    scheme: 'predial360',
    userInterfaceStyle: 'automatic',

    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#1E3A5F',
    },

    assetBundlePatterns: ['**/*'],

    ios: {
      supportsTablet: false,
      bundleIdentifier: isDev
        ? 'com.predial360.app.dev'
        : isPreview
          ? 'com.predial360.app.preview'
          : 'com.predial360.app',
      buildNumber: '1',
      infoPlist: {
        NSCameraUsageDescription:
          'Necessário para fotografar equipamentos e registrar inspeções.',
        NSMicrophoneUsageDescription:
          'Necessário para gravação de vídeo durante inspeções com body cam.',
        NSLocationWhenInUseUsageDescription:
          'Necessário para rastreamento do técnico durante ordens de serviço.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'Necessário para rastreamento em tempo real durante ordens de serviço.',
        NSFaceIDUsageDescription:
          'Para autenticação biométrica segura no aplicativo.',
      },
    },

    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#1E3A5F',
      },
      package: isDev
        ? 'com.predial360.app.dev'
        : isPreview
          ? 'com.predial360.app.preview'
          : 'com.predial360.app',
      versionCode: 1,
      permissions: [
        'CAMERA',
        'RECORD_AUDIO',
        'ACCESS_FINE_LOCATION',
        'ACCESS_COARSE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
        'READ_EXTERNAL_STORAGE',
        'WRITE_EXTERNAL_STORAGE',
        'VIBRATE',
        'RECEIVE_BOOT_COMPLETED',
      ],
      // google-services.json é opcional no Expo Go; obrigatório para builds EAS
      ...(existsSync(join(__dirname, 'google-services.json'))
        ? { googleServicesFile: './google-services.json' }
        : {}),
    },

    plugins: [
      'expo-router',
      'expo-camera',
      'expo-location',
      [
        'expo-notifications',
        {
          icon: './assets/notification-icon.png',
          color: '#1E3A5F',
        },
      ],
      [
        'expo-local-authentication',
        {
          faceIDPermission: 'Permite autenticação biométrica segura.',
        },
      ],
    ],

    experiments: {
      typedRoutes: true,
    },

    extra: {
      apiUrl,
      eas: {
        projectId: process.env['EAS_PROJECT_ID'] ?? 'b1ff34fe-d7b3-4096-a2b8-28326b30da00',
      },
    },

    updates: {
      url: `https://u.expo.dev/${process.env['EAS_PROJECT_ID'] ?? 'b1ff34fe-d7b3-4096-a2b8-28326b30da00'}`,
    },

    runtimeVersion: {
      policy: 'appVersion',
    },
  };
};
