import { Encrypt, runar } from '../src/index';

// Test data structure for encryption testing - using proper TS 5 decorators with string labels
// This matches the Rust TestProfile struct exactly
@Encrypt
export class TestProfile {
  public id: string; // plain field (no decorator)

  @runar('system')
  public name: string;

  @runar('user')
  public privateData: string;

  @runar('search')
  public email: string;

  @runar('system_only')
  public systemMetadata: string;

  constructor(
    id: string,
    name: string,
    privateData: string,
    email: string,
    systemMetadata: string
  ) {
    this.id = id;
    this.name = name;
    this.privateData = privateData;
    this.email = email;
    this.systemMetadata = systemMetadata;
  }
}
