import { Model } from '@nozbe/watermelondb';
import { field, date, children, readonly } from '@nozbe/watermelondb/decorators';
import type { Query } from '@nozbe/watermelondb';
import type ChecklistItem from './ChecklistItem';

export default class Checklist extends Model {
  static table = 'checklists';
  static associations = {
    checklist_items: { type: 'has_many' as const, foreignKey: 'checklist_id' },
  };

  @field('remote_id') remoteId!: string | null;
  @field('service_order_id') serviceOrderId!: string;
  @field('technician_id') technicianId!: string;
  @field('title') title!: string;
  @field('applicable_norms') applicableNormsJson!: string;
  @date('completed_at') completedAt!: Date | null;
  @field('is_synced') isSynced!: boolean;
  @readonly @date('created_at') createdAt!: Date;
  @readonly @date('updated_at') updatedAt!: Date;

  @children('checklist_items') items!: Query<ChecklistItem>;

  get applicableNorms(): string[] {
    try {
      return JSON.parse(this.applicableNormsJson) as string[];
    } catch {
      return [];
    }
  }
}
