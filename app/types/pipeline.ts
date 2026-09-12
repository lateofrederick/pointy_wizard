/**
 * @deprecated Superseded by `app/types/pointy.ts`. Do not add to this file.
 *
 * This model cannot represent Pointy: `PipelineEdge` is a bare reactflow edge
 * with no operator field, so `->`, `|->`, `||`, `*n` and `( )` — which are the
 * entire semantics of the language — have nowhere to live. There is also no
 * concept of branch descriptors, namespaces, meta events, directives or
 * attributes.
 *
 * `PipelineConfig.fields` has no equivalent in Pointy at all and appears to
 * predate the language; confirm it can go before deleting.
 *
 * Kept only because the pre-migration components still import it. Delete in
 * phase 3. See docs/ui-migration.md §1 and §4.
 */
import { Node, Edge } from 'reactflow';

export type DataType = 'string' | 'number' | 'boolean' | 'object' | 'array';

export interface PipelineField {
  name: string;
  required: boolean;
  data_type: DataType;
  default?: unknown;
  batch_processor?: boolean;
  batch_size?: number;
}

export interface PipelineConfig {
  name: string;
  fields: PipelineField[];
}

export interface PipelineEvent {
  id: string;
  name: string;
  code: string;
}

export interface PipelineNodeData {
  event: PipelineEvent;
}

export type PipelineNode = Node<PipelineNodeData>;
export type PipelineEdge = Edge;

export interface Pipeline {
  config: PipelineConfig;
  nodes: PipelineNode[];
  edges: PipelineEdge[];
}