import type { IncomingMessage } from 'node:http';
import type { AsyncResource } from 'node:async_hooks';

export type Req = {
  headers: IncomingMessage['headers'];
  pipe: IncomingMessage['pipe'];
  resume: IncomingMessage['resume'];
};
export type Res = { runInAsyncScope?: AsyncResource['runInAsyncScope'] };
export type Fn = (...args: any[]) => any;
export type ParseFn = ((body: string) => object) | ((body: Buffer) => object);
export type VerifyFn = (req: Req, res: Res, buf: Buffer, encoding: string | null) => void;
export interface ReadOptions {
  encoding: string | null;
  inflate?: boolean;
  limit?: number | string;
  verify?: VerifyFn | false;
  debug?: Fn;
  length?: string;
}

export interface BaseOptions {
  /**
   * When set to `true`, then deflated (compressed) bodies will be inflated;
   * when `false`, deflated bodies are rejected. Defaults to `true`.
   */
  inflate?: boolean;
  /**
   * Controls the maximum request body size. If this is a number, then the value
   * specifies the number of bytes; if it is a string, the value is passed to the
   * [bytes](https://www.npmjs.com/package/bytes) library for parsing. Defaults to `'100kb'`.
   */
  limit?: number | string;
  /**
   * The `verify` option, if supplied, is called as `verify(req, res, buf, encoding)`,
   * where `buf` is a `Buffer` of the raw request body and `encoding` is the
   * encoding of the request. The parsing can be aborted by throwing an error.
   */
  verify?: VerifyFn;
}

export interface RawOptions extends BaseOptions {
  /**
   * The `type` option is used to determine what media type the middleware will
   * parse. This option can be a string, array of strings, or a function.
   * If not a function, `type` option is passed directly to the
   * [type-is](https://www.npmjs.org/package/type-is#readme) library and this
   * can be an extension name (like `bin`), a mime type (like
   * `application/octet-stream`), or a mime type with a wildcard (like `* /*` or
   * `application/*`). If a function, the `type` option is called as `fn(req)`
   * and the request is parsed if it returns a truthy value. Defaults to
   * `application/octet-stream`.
   */
  type?: string | string[] | ((req: Req) => any);
}

export interface JsonOptions extends BaseOptions {
  /**
   * The `reviver` option is passed directly to `JSON.parse` as the second argument.
   * You can find more information on this argument [in the MDN documentation about JSON.parse][1].
   *
   * [1]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse#Example.3A_Using_the_reviver_parameter
   */
  reviver?(key: string, value: any): any;
  /**
   * When set to `true`, will only accept arrays and objects; when `false` will
   * accept anything `JSON.parse` accepts. Defaults to `true`.
   */
  strict?: boolean;
  /**
   * The `type` option is used to determine what media type the middleware will
   * parse. This option can be a string, array of strings, or a function. If not a
   * function, `type` option is passed directly to the
   * [type-is](https://www.npmjs.org/package/type-is#readme) library and this can
   * be an extension name (like `json`), a mime type (like `application/json`), or
   * a mime type with a wildcard (like `* /*` or `* /json`). If a function, the `type`
   * option is called as `fn(req)` and the request is parsed if it returns a truthy
   * value. Defaults to `application/json`.
   */
  type?: string | string[] | ((req: Req) => any);
}

export interface TextOptions extends BaseOptions {
  /**
   * Specify the default character set for the text content if the charset is not
   * specified in the `Content-Type` header of the request. Defaults to `utf-8`.
   */
  defaultCharset?: string;
  /**
   * The `type` option is used to determine what media type the middleware will
   * parse. This option can be a string, array of strings, or a function. If not
   * a function, `type` option is passed directly to the
   * [type-is](https://www.npmjs.org/package/type-is#readme) library and this can
   * be an extension name (like `txt`), a mime type (like `text/plain`), or a mime
   * type with a wildcard (like `* /*` or `text/*`). If a function, the `type`
   * option is called as `fn(req)` and the request is parsed if it returns a
   * truthy value. Defaults to `text/plain`.
   */
  type?: string | string[] | ((req: Req) => any);
}

export interface UrlencodedOptions extends BaseOptions {
  /**
   * The `extended` option allows to choose between parsing the URL-encoded data
   * with the `querystring` library (when `false`) or the `qs` library (when
   * `true`). The "extended" syntax allows for rich objects and arrays to be
   * encoded into the URL-encoded format, allowing for a JSON-like experience
   * with URL-encoded. For more information, please
   * [see the qs library](https://www.npmjs.org/package/qs#readme).
   *
   * Defaults to `false`.
   */
  extended?: boolean;
  /**
   * The `parameterLimit` option controls the maximum number of parameters that
   * are allowed in the URL-encoded data. If a request contains more parameters
   * than this value, a 413 will be returned to the client. Defaults to `1000`.
   */
  parameterLimit?: number;
  /**
   * The `type` option is used to determine what media type the middleware will
   * parse. This option can be a string, array of strings, or a function. If not
   * a function, `type` option is passed directly to the
   * [type-is](https://www.npmjs.org/package/type-is#readme) library and this can
   * be an extension name (like `urlencoded`), a mime type (like
   * `application/x-www-form-urlencoded`), or a mime type with a wildcard (like
   * `* /x-www-form-urlencoded`). If a function, the `type` option is called as
   * `fn(req)` and the request is parsed if it returns a truthy value. Defaults
   * to `application/x-www-form-urlencoded`.
   */
  type?: string | string[] | ((req: Req) => any);
}
