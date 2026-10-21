import type { MetaSpec, Namespace } from '../../types/pointy';

/** Custom MIME so a stray text drop from elsewhere cannot spawn a node. */
export const DRAG_MIME = 'application/x-pointy-event';

export interface PaletteDragPayload {
  name: string;
  namespace: Namespace;
  version?: string;
  meta?: MetaSpec;
}
