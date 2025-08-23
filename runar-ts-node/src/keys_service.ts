import { AbstractService, NodeLifecycleContext, RequestContext, Option } from './core';
import { Result, ok, err } from 'runar-ts-common';
import { AnyValue } from 'runar-ts-serializer';
import type { KeysDelegate } from './keys_delegate';

export class KeysService implements AbstractService {
  private _networkId?: string;
  constructor(private readonly delegate: KeysDelegate) {}

  name(): string {
    return 'runar keys';
  }
  version(): string {
    return '1.0.0';
  }
  path(): string {
    return '$keys';
  }
  description(): string {
    return 'Keys service for key management';
  }
  networkId(): string | undefined {
    return this._networkId;
  }
  setNetworkId(networkId: string): void {
    this._networkId = networkId;
  }

  async init(context: NodeLifecycleContext): Promise<Result<void, string>> {
    const result = await context.registerAction(
      'ensure_symmetric_key',
      async (payload: Option<AnyValue>, context: RequestContext) => {
        // Check if payload exists
        if (!payload) {
          return err('Expected payload for symmetric key label');
        }

        // Expect string input only - no fallbacks
        const stringResult = payload.as<string>();
        if (!stringResult.ok) {
          return err('Expected string payload for symmetric key label');
        }

        const label = stringResult.value;
        const outBytes = await this.delegate.ensureSymmetricKey(label);
        return ok(AnyValue.from(outBytes));
      }
    );

    if (!result.ok) {
      return err(`Failed to register action: ${result.error}`);
    }

    return ok(undefined);
  }

  async start(_context: NodeLifecycleContext): Promise<Result<void, string>> {
    return ok(undefined);
  }

  async stop(_context: NodeLifecycleContext): Promise<Result<void, string>> {
    return ok(undefined);
  }
}
