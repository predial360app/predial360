import { registerAs } from '@nestjs/config';
import * as Joi from 'joi';

export const appConfig = registerAs('app', () => ({
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  port: parseInt(process.env['APP_PORT'] ?? '3000', 10),
  appUrl: process.env['APP_URL'] ?? 'http://localhost:3000',
  frontendUrl: process.env['FRONTEND_URL'] ?? 'http://localhost:3001',

  database: {
    url: process.env['DATABASE_URL'],
  },

  redis: {
    url: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    password: process.env['REDIS_PASSWORD'],
  },

  jwt: {
    accessSecret: process.env['JWT_ACCESS_SECRET'],
    accessExpiresIn: process.env['JWT_ACCESS_EXPIRES_IN'] ?? '15m',
    refreshSecret: process.env['JWT_REFRESH_SECRET'],
    refreshExpiresIn: process.env['JWT_REFRESH_EXPIRES_IN'] ?? '30d',
  },

  totp: {
    appName: process.env['TOTP_APP_NAME'] ?? 'Predial360',
  },

  anthropic: {
    apiKey: process.env['ANTHROPIC_API_KEY'],
    model: process.env['ANTHROPIC_MODEL'] ?? 'claude-sonnet-4-6',
  },

  aws: {
    region: process.env['AWS_REGION'] ?? 'us-east-1',
    accessKeyId: process.env['AWS_ACCESS_KEY_ID'],
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'],
    s3Bucket: process.env['AWS_S3_BUCKET'] ?? 'predial360-dev',
    s3Endpoint: process.env['AWS_ENDPOINT_URL'],       // LocalStack: http://localhost:4566
    cdnBaseUrl: process.env['AWS_CDN_BASE_URL'] ?? '', // CloudFront em produção
    iotEndpoint: process.env['AWS_IOT_ENDPOINT'],
  },

  firebase: {
    projectId: process.env['FIREBASE_PROJECT_ID'],
    clientEmail: process.env['FIREBASE_CLIENT_EMAIL'],
    privateKey: process.env['FIREBASE_PRIVATE_KEY']?.replace(/\\n/g, '\n'),
  },

  google: {
    mapsApiKey: process.env['GOOGLE_MAPS_API_KEY'],
    oauthClientId: process.env['GOOGLE_OAUTH_CLIENT_ID'],
    oauthClientSecret: process.env['GOOGLE_OAUTH_CLIENT_SECRET'],
  },

  asaas: {
    apiKey: process.env['ASAAS_API_KEY'],
    baseUrl: process.env['ASAAS_BASE_URL'] ?? 'https://sandbox.asaas.com/api/v3',
    webhookToken: process.env['ASAAS_WEBHOOK_TOKEN'],
  },

  encryption: {
    key: process.env['ENCRYPTION_KEY'],
  },
}));

export const appConfigSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  APP_PORT: Joi.number().default(3000),
  APP_URL: Joi.string().uri().default('http://localhost:3000'),
  FRONTEND_URL: Joi.string().uri().default('http://localhost:3001'),

  DATABASE_URL: Joi.string().required(),
  REDIS_URL: Joi.string().default('redis://localhost:6379'),
  REDIS_PASSWORD: Joi.string().allow('').optional(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),

  TOTP_APP_NAME: Joi.string().default('Predial360'),

  ANTHROPIC_API_KEY: Joi.string().required(),
  ANTHROPIC_MODEL: Joi.string().default('claude-sonnet-4-6'),

  AWS_REGION: Joi.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: Joi.string().required(),
  AWS_SECRET_ACCESS_KEY: Joi.string().required(),
  AWS_S3_BUCKET: Joi.string().required(),
  AWS_IOT_ENDPOINT: Joi.string().optional(),
  AWS_ENDPOINT_URL: Joi.string().uri().optional(),     // LocalStack
  AWS_CDN_BASE_URL: Joi.string().uri().optional(),     // CloudFront

  FIREBASE_PROJECT_ID: Joi.string().required(),
  FIREBASE_CLIENT_EMAIL: Joi.string().email().required(),
  FIREBASE_PRIVATE_KEY: Joi.string().required(),

  GOOGLE_MAPS_API_KEY: Joi.string().required(),
  GOOGLE_OAUTH_CLIENT_ID: Joi.string().required(),
  GOOGLE_OAUTH_CLIENT_SECRET: Joi.string().required(),

  ASAAS_API_KEY: Joi.string().required(),
  ASAAS_BASE_URL: Joi.string().uri().default('https://sandbox.asaas.com/api/v3'),
  ASAAS_WEBHOOK_TOKEN: Joi.string().required(),

  ENCRYPTION_KEY: Joi.string().length(64).required(),
});
