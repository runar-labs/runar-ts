export type CborBytes = Uint8Array;

export interface PeerInfo {
  peerId: string;
  displayName?: string;
}

export interface NodeInfo {
  nodeId: string;
  displayName?: string;
}

export class RunarError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunarError";
  }
}


