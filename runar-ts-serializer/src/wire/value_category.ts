// Value categories exactly matching Rust runar-serializer
export enum ValueCategory {
  Null = 0,
  Primitive = 1,
  List = 2,
  Map = 3,
  Struct = 4,
  Bytes = 5,
  Json = 6,
}
