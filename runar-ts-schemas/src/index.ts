export interface NodeInfo {
  nodeId: string;
  displayName?: string;
  version?: string;
}

export interface PeerInfo {
  peerId: string;
  displayName?: string;
}

export interface ActionMetadata {
  name: string;
  description?: string;
}

export interface ServiceMetadata {
  name: string;
  path: string;
  version: string;
  description?: string;
  actions?: ActionMetadata[];
}

export interface NodeMetadata {
  services: ServiceMetadata[];
}


