declare module 'unpipe' {
  export default function unpipe(req: any) {}
}

declare module 'destroy' {
  /// <reference types="node" />
  import { Stream } from 'stream';

  export = destroy;

  declare function destroy<T extends Stream>(stream: T, other: boolean): T;
}
