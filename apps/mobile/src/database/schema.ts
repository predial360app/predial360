/**
 * WatermelonDB Schema — banco local para funcionamento offline.
 * Tabelas espelham as entidades críticas que precisam funcionar sem internet.
 */
import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const dbSchema = appSchema({
  version: 1,
  tables: [
    // ── Checklists ──────────────────────────────────────────────────────────
    tableSchema({
      name: 'checklists',
      columns: [
        { name: 'remote_id', type: 'string', isOptional: true },
        { name: 'service_order_id', type: 'string' },
        { name: 'technician_id', type: 'string' },
        { name: 'title', type: 'string' },
        { name: 'applicable_norms', type: 'string' }, // JSON array
        { name: 'completed_at', type: 'number', isOptional: true },
        { name: 'is_synced', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── Checklist Items ─────────────────────────────────────────────────────
    tableSchema({
      name: 'checklist_items',
      columns: [
        { name: 'remote_id', type: 'string', isOptional: true },
        { name: 'checklist_id', type: 'string' },       // WatermelonDB local ID
        { name: 'checklist_remote_id', type: 'string', isOptional: true },
        { name: 'order_index', type: 'number' },
        { name: 'title', type: 'string' },
        { name: 'description', type: 'string', isOptional: true },
        { name: 'norm_reference', type: 'string', isOptional: true },
        { name: 'status', type: 'string' },             // ChecklistItemStatus
        { name: 'technician_note', type: 'string', isOptional: true },
        { name: 'photo_uris', type: 'string' },         // JSON array de URIs locais
        { name: 'photo_s3_urls', type: 'string' },      // JSON array de URLs S3 pós-sync
        { name: 'is_required', type: 'boolean' },
        { name: 'requires_photo', type: 'boolean' },
        { name: 'requires_measurement', type: 'boolean' },
        { name: 'measurement_value', type: 'number', isOptional: true },
        { name: 'measurement_unit', type: 'string', isOptional: true },
        { name: 'measurement_min', type: 'number', isOptional: true },
        { name: 'measurement_max', type: 'number', isOptional: true },
        { name: 'gps_latitude', type: 'number', isOptional: true },
        { name: 'gps_longitude', type: 'number', isOptional: true },
        { name: 'completed_at', type: 'number', isOptional: true },
        { name: 'is_synced', type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // ── Sync Queue — operações pendentes de upload ──────────────────────────
    tableSchema({
      name: 'sync_queue',
      columns: [
        { name: 'entity_type', type: 'string' },   // 'checklist' | 'checklist_item' | 'photo'
        { name: 'entity_id', type: 'string' },      // local WatermelonDB ID
        { name: 'operation', type: 'string' },      // 'CREATE' | 'UPDATE'
        { name: 'payload', type: 'string' },        // JSON serializado
        { name: 'retry_count', type: 'number' },
        { name: 'last_error', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
      ],
    }),
  ],
});
