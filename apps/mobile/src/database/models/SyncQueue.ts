import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';

export type SyncOperation = 'CREATE' | 'UPDATE';
export type SyncEntityType = 'checklist' | 'checklist_item' | 'photo' | 'signature';

export default class SyncQueue extends Model {
  static table = 'sync_queue';

  @field('entity_type') entityType!: SyncEntityType;
  @field('entity_id') entityId!: string;
  @field('operation') operation!: SyncOperation;
  @field('payload') payloadJson!: string;
  @field('retry_count') retryCount!: number;
  @field('last_error') lastError!: string | null;
  @readonly @date('created_at') createdAt!: Date;

  get payload(): Record<string, unknown> {
    try { return JSON.parse(this.payloadJson) as Record<string, unknown>; }
    catch { return {}; }
  }
}
