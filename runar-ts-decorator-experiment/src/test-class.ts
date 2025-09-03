/**
 * Test class to demonstrate the build-time generation approach
 */

// This would be our decorator (simplified for the experiment)
export function Encrypt<T extends new (...args: any[]) => any>(
  constructor: T,
  context: ClassDecoratorContext
): void {
  // The decorator would mark the class for type generation
  // The actual type generation would happen during build time
  console.log(`Marking ${context.name} for encrypted type generation`);
}

export function runar(label: string) {
  return function (value: unknown, context: ClassFieldDecoratorContext<any, unknown>): unknown {
    // This would mark the field for encryption with the given label
    console.log(`Marking field ${String(context.name)} for encryption with label: ${label}`);
    return value;
  };
}

// Test class with decorators
@Encrypt
export class TestProfile {
  public id: string; // plain field

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

// What we want to achieve:
// The build script would generate a file like this:

/*
// generated-types.ts
export interface EncryptedTestProfile {
  id: string; // plain field
  system_encrypted: string; // encrypted field
  user_encrypted: string; // encrypted field
  search_encrypted: string; // encrypted field
  system_only_encrypted: string; // encrypted field
}
*/

// Then we could use it like this:
// import { EncryptedTestProfile } from './generated-types';
// const encrypted: EncryptedTestProfile = ...;
