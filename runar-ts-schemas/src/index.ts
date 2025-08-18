export type SchemaDataType =
  | 'String'
  | 'Int32'
  | 'Int64'
  | 'Float'
  | 'Double'
  | 'Boolean'
  | 'Timestamp'
  | 'Binary'
  | 'Object'
  | 'Array'
  | { Reference: string }
  | { Union: SchemaDataType[] }
  | 'Any';

export interface FieldSchema {
  name: string;
  data_type: SchemaDataType;
  description?: string | null;
  nullable?: boolean | null;
  default_value?: string | null;
  properties?: Record<string, FieldSchema> | null;
  required?: string[] | null;
  items?: FieldSchema | null;
  pattern?: string | null;
  enum_values?: string[] | null;
  minimum?: number | null;
  maximum?: number | null;
  exclusive_minimum?: boolean | null;
  exclusive_maximum?: boolean | null;
  min_length?: number | null;
  max_length?: number | null;
  min_items?: number | null;
  max_items?: number | null;
  example?: string | null;
}

export interface ActionMetadata {
  name: string;
  description: string;
  input_schema?: FieldSchema | null;
  output_schema?: FieldSchema | null;
}

export interface SubscriptionMetadata {
  path: string;
}

export interface ServiceMetadata {
  network_id: string;
  service_path: string;
  name: string;
  version: string;
  description: string;
  actions: ActionMetadata[];
  registration_time: number;
  last_start_time?: number | null;
}

export interface NodeMetadata {
  services: ServiceMetadata[];
  subscriptions: SubscriptionMetadata[];
}

export interface NodeInfo {
  node_public_key: Uint8Array;
  network_ids: string[];
  addresses: string[];
  node_metadata: NodeMetadata;
  version: number;
}


