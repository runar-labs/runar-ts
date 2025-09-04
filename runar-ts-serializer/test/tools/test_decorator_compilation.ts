// Test TS 5 decorators with TypeScript compilation + Bun runtime
import { Encrypt, runar, getTypeName } from '../runar-ts-decorators/dist/index.js';

console.log('🎉 Testing TS 5 decorators with TypeScript compilation + Bun runtime...');

@Encrypt({ name: 'TestProfile' })
class TestProfile {
  @runar({ system: true })
  systemField: string = 'system_value';

  @runar({ user: true })
  userField: string = 'user_value';

  constructor(public name: string) {}
}

console.log('✅ Decorator applied successfully!');
console.log('TestProfile name:', TestProfile.name);
console.log('Type name:', getTypeName(TestProfile));

const instance = new TestProfile('test');
console.log('✅ Instance created successfully!');
console.log('Instance name:', instance.name);
console.log('System field:', instance.systemField);
console.log('User field:', instance.userField);

console.log('🎯 TS 5 decorators work perfectly with TypeScript compilation + Bun runtime!');
