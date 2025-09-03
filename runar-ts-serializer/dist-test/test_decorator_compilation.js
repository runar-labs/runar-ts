var __esDecorate =
  (this && this.__esDecorate) ||
  function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) {
      if (f !== void 0 && typeof f !== 'function') throw new TypeError('Function expected');
      return f;
    }
    var kind = contextIn.kind,
      key = kind === 'getter' ? 'get' : kind === 'setter' ? 'set' : 'value';
    var target = !descriptorIn && ctor ? (contextIn['static'] ? ctor : ctor.prototype) : null;
    var descriptor =
      descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _,
      done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
      var context = {};
      for (var p in contextIn) context[p] = p === 'access' ? {} : contextIn[p];
      for (var p in contextIn.access) context.access[p] = contextIn.access[p];
      context.addInitializer = function (f) {
        if (done) throw new TypeError('Cannot add initializers after decoration has completed');
        extraInitializers.push(accept(f || null));
      };
      var result = (0, decorators[i])(
        kind === 'accessor' ? { get: descriptor.get, set: descriptor.set } : descriptor[key],
        context
      );
      if (kind === 'accessor') {
        if (result === void 0) continue;
        if (result === null || typeof result !== 'object') throw new TypeError('Object expected');
        if ((_ = accept(result.get))) descriptor.get = _;
        if ((_ = accept(result.set))) descriptor.set = _;
        if ((_ = accept(result.init))) initializers.unshift(_);
      } else if ((_ = accept(result))) {
        if (kind === 'field') initializers.unshift(_);
        else descriptor[key] = _;
      }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
  };
var __runInitializers =
  (this && this.__runInitializers) ||
  function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
      value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
  };
// Test TS 5 decorators with TypeScript compilation + Bun runtime
import { Encrypt, runar, getTypeName } from '../../runar-ts-decorators/dist/index.js';
console.log('🎉 Testing TS 5 decorators with TypeScript compilation + Bun runtime...');
let TestProfile = (() => {
  let _classDecorators = [Encrypt({ name: 'TestProfile' })];
  let _classDescriptor;
  let _classExtraInitializers = [];
  let _classThis;
  let _systemField_decorators;
  let _systemField_initializers = [];
  let _systemField_extraInitializers = [];
  let _userField_decorators;
  let _userField_initializers = [];
  let _userField_extraInitializers = [];
  var TestProfile = class {
    static {
      _classThis = this;
    }
    static {
      const _metadata =
        typeof Symbol === 'function' && Symbol.metadata ? Object.create(null) : void 0;
      _systemField_decorators = [runar({ system: true })];
      _userField_decorators = [runar({ user: true })];
      __esDecorate(
        null,
        null,
        _systemField_decorators,
        {
          kind: 'field',
          name: 'systemField',
          static: false,
          private: false,
          access: {
            has: obj => 'systemField' in obj,
            get: obj => obj.systemField,
            set: (obj, value) => {
              obj.systemField = value;
            },
          },
          metadata: _metadata,
        },
        _systemField_initializers,
        _systemField_extraInitializers
      );
      __esDecorate(
        null,
        null,
        _userField_decorators,
        {
          kind: 'field',
          name: 'userField',
          static: false,
          private: false,
          access: {
            has: obj => 'userField' in obj,
            get: obj => obj.userField,
            set: (obj, value) => {
              obj.userField = value;
            },
          },
          metadata: _metadata,
        },
        _userField_initializers,
        _userField_extraInitializers
      );
      __esDecorate(
        null,
        (_classDescriptor = { value: _classThis }),
        _classDecorators,
        { kind: 'class', name: _classThis.name, metadata: _metadata },
        null,
        _classExtraInitializers
      );
      TestProfile = _classThis = _classDescriptor.value;
      if (_metadata)
        Object.defineProperty(_classThis, Symbol.metadata, {
          enumerable: true,
          configurable: true,
          writable: true,
          value: _metadata,
        });
      __runInitializers(_classThis, _classExtraInitializers);
    }
    name;
    systemField = __runInitializers(this, _systemField_initializers, 'system_value');
    userField =
      (__runInitializers(this, _systemField_extraInitializers),
      __runInitializers(this, _userField_initializers, 'user_value'));
    constructor(name) {
      __runInitializers(this, _userField_extraInitializers);
      this.name = name;
    }
  };
  return (TestProfile = _classThis);
})();
console.log('✅ Decorator applied successfully!');
console.log('TestProfile name:', TestProfile.name);
console.log('Type name:', getTypeName(TestProfile));
const instance = new TestProfile('test');
console.log('✅ Instance created successfully!');
console.log('Instance name:', instance.name);
console.log('System field:', instance.systemField);
console.log('User field:', instance.userField);
console.log('🎯 TS 5 decorators work perfectly with TypeScript compilation + Bun runtime!');
