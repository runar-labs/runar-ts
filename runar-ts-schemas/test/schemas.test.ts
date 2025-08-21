import { describe, it, expect } from 'bun:test';
import { ServiceState } from '../src';

describe('Schemas mirror', () => {
  it('constructs ServiceState enum', () => {
    expect(ServiceState.Created).toBe('Created');
    expect(ServiceState.Initialized).toBe('Initialized');
    expect(ServiceState.Running).toBe('Running');
    expect(ServiceState.Stopped).toBe('Stopped');
    expect(ServiceState.Paused).toBe('Paused');
    expect(ServiceState.Error).toBe('Error');
    expect(ServiceState.Unknown).toBe('Unknown');
  });
});
