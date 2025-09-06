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

// Advanced test class with multiple labels per field
@Encrypt
export class AdvancedTestProfile {
  public id: string; // plain field

  @runar(['system', 'user']) // Multiple labels for same field
  public sharedData: string;

  @runar('system')
  public systemData: string;

  @runar('user')
  public userData: string;

  @runar('search')
  public searchData: string;

  @runar('custom') // Custom label with lowest priority
  public customData: string;

  constructor(
    id: string,
    sharedData: string,
    systemData: string,
    userData: string,
    searchData: string,
    customData: string
  ) {
    this.id = id;
    this.sharedData = sharedData;
    this.systemData = systemData;
    this.userData = userData;
    this.searchData = searchData;
    this.customData = customData;
  }
}

// Nested encrypted object test - follows design document requirements
@Encrypt
export class NestedEncryptedProfile {
  public id: string; // plain field

  @runar('user')
  public profile: TestProfile | null; // Nested encrypted object with label - must be nullable

  @runar('system')
  public metadata: SystemMetadata | null; // Nested encrypted object with label - must be nullable

  @runar('user')
  public userPrivateData: string; // Primitive with label - uses default value when not accessible

  @runar('user')
  public nestedData: TestProfile | null; // Nested encrypted object with label - must be nullable

  constructor(
    id: string,
    profile: TestProfile | null,
    metadata: SystemMetadata | null,
    userPrivateData: string,
    nestedData: TestProfile | null
  ) {
    this.id = id;
    this.profile = profile;
    this.metadata = metadata;
    this.userPrivateData = userPrivateData;
    this.nestedData = nestedData;
  }
}

// Nested encrypted object test
@Encrypt
export class SystemMetadata {
  public id: string; // plain field

  @runar('user')
  public email: string;

  @runar('system')
  public metadata: string;

  constructor(id: string, email: string, metadata: string) {
    this.id = id;
    this.email = email;
    this.metadata = metadata;
  }
}

// Complex test with mixed field types
@Encrypt
export class ComplexPriorityProfile {
  public id: string; // plain field

  @runar('system_only') // System only access
  public criticalData: string;

  @runar('system') // System access
  public systemInfo: string;

  @runar('user') // User access
  public userInfo: string;

  @runar('search') // Search access
  public searchInfo: string;

  @runar('custom') // Custom access
  public customInfo: string;

  @runar(['system', 'user']) // Multiple labels
  public sharedInfo: string;

  constructor(
    id: string,
    criticalData: string,
    systemInfo: string,
    userInfo: string,
    searchInfo: string,
    customInfo: string,
    sharedInfo: string
  ) {
    this.id = id;
    this.criticalData = criticalData;
    this.systemInfo = systemInfo;
    this.userInfo = userInfo;
    this.searchInfo = searchInfo;
    this.customInfo = customInfo;
    this.sharedInfo = sharedInfo;
  }
}
