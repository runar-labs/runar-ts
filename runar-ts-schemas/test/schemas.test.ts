import { describe, it, expect } from 'bun:test';
import { NodeInfo, NodeMetadata, ServiceMetadata, ActionMetadata, FieldSchema } from '../src';

describe('Schemas mirror', () => {
  it('constructs ServiceMetadata shape', () => {
    const svc: ServiceMetadata = {
      network_id: 'net',
      service_path: 'math',
      name: 'Math',
      version: '1.0.0',
      description: 'desc',
      actions: [
        {
          name: 'add',
          description: 'Adds',
          input_schema: { name: 'AddInput', data_type: 'Object' },
          output_schema: { name: 'AddOutput', data_type: 'Double' },
        },
      ],
      registration_time: 1,
      last_start_time: 2,
    };
    expect(svc.actions[0]?.name).toBe('add');
  });
});
