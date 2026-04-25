import { Model } from '@nozbe/watermelondb';
import { field, date, relation, readonly } from '@nozbe/watermelondb/decorators';
import type Checklist from './Checklist';

export type ItemStatus =
  | 'PENDING'
  | 'CONFORMING'
  | 'NON_CONFORMING'
  | 'NOT_APPLICABLE'
  | 'REQUIRES_MONITORING';

export default class ChecklistItem extends Model {
  static table = 'checklist_items';
  static associations = {
    checklists: { type: 'belongs_to' as const, key: 'checklist_id' },
  };

  @field('remote_id') remoteId!: string | null;
  @field('checklist_id') checklistId!: string;
  @field('checklist_remote_id') checklistRemoteId!: string | null;
  @field('order_index') orderIndex!: number;
  @field('title') title!: string;
  @field('description') description!: string | null;
  @field('norm_reference') normReference!: string | null;
  @field('status') status!: ItemStatus;
  @field('technician_note') technicianNote!: string | null;
  @field('photo_uris') photoUrisJson!: string;
  @field('photo_s3_urls') photoS3UrlsJson!: string;
  @field('is_required') isRequired!: boolean;
  @field('requires_photo') requiresPhoto!: boolean;
  @field('requires_measurement') requiresMeasurement!: boolean;
  @field('measurement_value') measurementValue!: number | null;
  @field('measurement_unit') measurementUnit!: string | null;
  @field('measurement_min') measurementMin!: number | null;
  @field('measurement_max') measurementMax!: number | null;
  @field('gps_latitude') gpsLatitude!: number | null;
  @field('gps_longitude') gpsLongitude!: number | null;
  @date('completed_at') completedAt!: Date | null;
  @field('is_synced') isSynced!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @relation('checklists', 'checklist_id') checklist!: Checklist;

  get photoUris(): string[] {
    try { return JSON.parse(this.photoUrisJson) as string[]; }
    catch { return []; }
  }

  get photoS3Urls(): string[] {
    try { return JSON.parse(this.photoS3UrlsJson) as string[]; }
    catch { return []; }
  }

  get measurementInRange(): boolean | null {
    if (this.measurementValue === null) return null;
    if (this.measurementMin !== null && this.measurementValue < this.measurementMin) return false;
    if (this.measurementMax !== null && this.measurementValue > this.measurementMax) return false;
    return true;
  }
}
