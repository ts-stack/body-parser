import type { IncomingMessage, ServerResponse } from 'http';

export interface RawOptions {
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
   * The type option is used to determine what media type the middleware will parse
   */
  type?: string | string[] | ((req: IncomingMessage) => any);
  /**
   * The verify option, if supplied, is called as verify(req, res, buf, encoding),
   * where buf is a Buffer of the raw request body and encoding is the encoding of the request.
   */
  verify?(req: IncomingMessage, res: ServerResponse, buf: Buffer, encoding: string): void;
}

export interface JsonOptions extends RawOptions {
  /**
   * The `reviver` option is passed directly to `JSON.parse` as the second argument.
   * You can find more information on this argument [in the MDN documentation about JSON.parse][1].
   * 
   * [1]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse#Example.3A_Using_the_reviver_parameter
   */
  reviver?(key: string, value: any): any;
  /**
   * When set to `true`, will only accept arrays and objects;
   * when `false` will accept anything `JSON.parse` accepts. Defaults to `true`.
   */
  strict?: boolean;
}

export interface TextOptions extends RawOptions {
  /**
   * Specify the default character set for the text content if the charset
   * is not specified in the Content-Type header of the request.
   * Defaults to `utf-8`.
   */
  defaultCharset?: string;
}

export interface UrlencodedOptions extends RawOptions {
  /**
   * The extended option allows to choose between parsing the URL-encoded data
   * with the querystring library (when `false`) or the qs library (when `true`).
   */
  extended?: boolean;
  /**
   * The parameterLimit option controls the maximum number of parameters
   * that are allowed in the URL-encoded data. If a request contains more parameters than this value,
   * a 413 will be returned to the client. Defaults to 1000.
   */
  parameterLimit?: number;
}
