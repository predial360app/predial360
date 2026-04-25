/**
 * Inicializa o banco WatermelonDB com SQLite (react-native).
 * Singleton — uma única instância para todo o app.
 */
import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';

import { dbSchema } from './schema';
import Checklist from './models/Checklist';
import ChecklistItem from './models/ChecklistItem';
import SyncQueue from './models/SyncQueue';

const adapter = new SQLiteAdapter({
  schema: dbSchema,
  // migrations: migrations, // adicionar em versões futuras
  jsi: true,          // usa JSI para performance máxima
  onSetUpError: (error) => {
    console.error('WatermelonDB setup error:', error);
  },
});

export const database = new Database({
  adapter,
  modelClasses: [Checklist, ChecklistItem, SyncQueue],
});

export { Checklist, ChecklistItem, SyncQueue };
