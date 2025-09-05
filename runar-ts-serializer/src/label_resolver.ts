import { Result, ok, err } from 'runar-ts-common/src/error/Result';

// ---------------------------------------------------------------------------
// Core Type Definitions
// ---------------------------------------------------------------------------

/**
 * Information required to perform envelope encryption for a label
 */
export interface LabelKeyInfo {
  /** Profile public keys for user-specific encryption */
  profilePublicKeys: Uint8Array[];
  /** Pre-resolved network public key (optional for user-only labels) */
  networkPublicKey?: Uint8Array;
}

/**
 * Value specification for a label
 */
export interface LabelValue {
  /** Optional network public key for this label */
  networkPublicKey?: Uint8Array;
  /** Optional user key specification for dynamic resolution */
  userKeySpec?: LabelKeyword;
}

/**
 * Keywords for dynamic label resolution
 */
export enum LabelKeyword {
  /** Maps to current user's profile public keys from request context */
  CurrentUser = 'CurrentUser',
  /** Reserved for future custom resolution functions */
  Custom = 'Custom',
}

/**
 * Configuration for label resolver system labels
 */
export interface LabelResolverConfig {
  /** Static label mappings for system labels */
  labelMappings: Map<string, LabelValue>;
}

/**
 * Label-to-PublicKey mapping configuration
 */
export interface KeyMappingConfig {
  /** Maps labels to resolved key information */
  labelMappings: Map<string, LabelKeyInfo>;
}

// ---------------------------------------------------------------------------
// LabelResolver Implementation
// ---------------------------------------------------------------------------

/**
 * Label resolver implementation
 */
export class LabelResolver {
  private mapping: Map<string, LabelKeyInfo>;

  constructor(config: KeyMappingConfig) {
    this.mapping = new Map(config.labelMappings);
  }

  /**
   * Resolve a label to key-info (public key + scope)
   */
  resolveLabelInfo(label: string): Result<LabelKeyInfo | undefined> {
    const info = this.mapping.get(label);
    return ok(info);
  }

  /**
   * Get available labels in current context
   */
  availableLabels(): string[] {
    return Array.from(this.mapping.keys());
  }

  /**
   * Check if a label can be resolved
   */
  canResolve(label: string): boolean {
    return this.mapping.has(label);
  }

  /**
   * Creates a label resolver for a specific context
   * REQUIRES: Every label must have either network key OR user keys OR both
   */
  static createContextLabelResolver(
    systemConfig: LabelResolverConfig,
    userProfileKeys: Uint8Array[] // From request context - empty array means no profile keys
  ): Result<LabelResolver> {
    const mappings = new Map<string, LabelKeyInfo>();

    // Process system label mappings
    for (const [label, labelValue] of systemConfig.labelMappings) {
      let profilePublicKeys: Uint8Array[] = [];

      // Get network key if specified, or use empty for user-only labels
      const networkPublicKey = labelValue.networkPublicKey ?? new Uint8Array(0);

      // Process user key specification
      if (labelValue.userKeySpec) {
        switch (labelValue.userKeySpec) {
          case LabelKeyword.CurrentUser:
            // Always extend with user profile keys (empty array is fine)
            profilePublicKeys = [...userProfileKeys];
            break;
          case LabelKeyword.Custom:
            // Future: Call custom resolution function
            // For now, profilePublicKeys remains empty
            break;
        }
      }

      // Validation: Label must have either network key OR user keys OR both
      // Empty network key + empty profile keys = invalid label
      if (networkPublicKey.length === 0 && profilePublicKeys.length === 0) {
        return err(
          new Error(
            `Label '${label}' must specify either network_public_key or user_key_spec (or both)`
          )
        );
      }

      mappings.set(label, {
        networkPublicKey: networkPublicKey.length > 0 ? networkPublicKey : undefined,
        profilePublicKeys,
      });
    }

    return ok(new LabelResolver({ labelMappings: mappings }));
  }

  /**
   * Validate label resolver configuration
   */
  static validateLabelConfig(config: LabelResolverConfig): Result<void> {
    // Ensure config has required label mappings
    if (config.labelMappings.size === 0) {
      return err(new Error('LabelResolverConfig must contain at least one label mapping'));
    }

    // Validate each label mapping
    for (const [label, labelValue] of config.labelMappings) {
      // Check that label has either network key OR user key spec OR both
      const hasNetworkKey = labelValue.networkPublicKey !== undefined;
      const hasUserSpec = labelValue.userKeySpec !== undefined;

      if (!hasNetworkKey && !hasUserSpec) {
        return err(
          new Error(
            `Label '${label}' must specify either network_public_key or user_key_spec (or both)`
          )
        );
      }

      // If network key is provided, validate it's not empty
      if (labelValue.networkPublicKey && labelValue.networkPublicKey.length === 0) {
        return err(
          new Error(
            `Label '${label}' has empty network_public_key - use undefined for user-only labels`
          )
        );
      }

      // Validate user key spec if provided
      if (labelValue.userKeySpec) {
        if (labelValue.userKeySpec === LabelKeyword.Custom) {
          // Future: Could validate that custom resolver exists
          // For now, just ensure it's not empty
        }
      }
    }

    return ok(undefined);
  }
}

// ---------------------------------------------------------------------------
// Convenience Functions
// ---------------------------------------------------------------------------

/**
 * Creates a label resolver for a specific context
 * REQUIRES: Every label must have an explicit network_public_key - no defaults allowed
 */
export function createContextLabelResolver(
  systemConfig: LabelResolverConfig,
  userProfileKeys: Uint8Array[] // From request context - empty array means no profile keys
): Result<LabelResolver> {
  return LabelResolver.createContextLabelResolver(systemConfig, userProfileKeys);
}
