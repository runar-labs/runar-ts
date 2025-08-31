import { Result, ok, err } from 'runar-ts-common';
import {
  AnyValue,
  SerializationContext,
  ResolverCache,
  LabelResolverConfig,
} from 'runar-ts-serializer';
import { TopicPath } from 'runar-ts-common';
import { QuicTransport } from './transport';
import { Logger } from 'runar-ts-common';

/**
 * Request context for remote service calls
 */
export interface RequestContext {
  correlationId: string;
  peerNodeId: string;
  userProfilePublicKeys?: Uint8Array[];
  networkPublicKey?: Uint8Array;
  node: {
    getKeysWrapper(): any; // CommonKeysInterface
  };
}

/**
 * RemoteService provides a local proxy for remote services discovered on peers
 */
export class RemoteService {
  constructor(
    private readonly serviceTopic: TopicPath,
    private readonly networkTransport: QuicTransport,
    private readonly labelResolverCache: ResolverCache,
    private readonly labelResolverConfig: LabelResolverConfig,
    private readonly logger: Logger
  ) {}

  /**
   * Make a request to the remote service
   */
  async request(
    actionName: string,
    params: AnyValue,
    req: RequestContext
  ): Promise<Result<AnyValue, string>> {
    try {
      const profilePublicKeys = req.userProfilePublicKeys ?? [];
      const resolverResult = this.labelResolverCache.getOrCreate(
        this.labelResolverConfig,
        profilePublicKeys
      );
      if (!resolverResult.ok) {
        return err(`LabelResolver error: ${resolverResult.error.message}`);
      }

      const networkPk = req.networkPublicKey ?? undefined;
      const ctx: SerializationContext = {
        keystore: req.node.getKeysWrapper(),
        resolver: resolverResult.value,
        networkPublicKey: networkPk!,
        profilePublicKeys,
      };

      const payloadBytes = params.serialize(ctx);
      if (!payloadBytes.ok) {
        return err(`Encrypt params failed: ${payloadBytes.error.message}`);
      }

      const responseBytes = await this.networkTransport.request(
        this.serviceTopic.newActionTopic(actionName).asStr(),
        req.correlationId,
        payloadBytes.value,
        req.peerNodeId,
        networkPk,
        profilePublicKeys
      );

      const av = AnyValue.deserialize(responseBytes, { keystore: req.node.getKeysWrapper() });
      return av.ok ? ok(av.value) : err(av.error.message);
    } catch (e) {
      return err(e instanceof Error ? e.message : String(e));
    }
  }
}
