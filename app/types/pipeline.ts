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