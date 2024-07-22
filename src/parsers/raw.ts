/*!
 * body-parser
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

import bytes from 'bytes';
import debugInit from 'debug';
import type { IncomingHttpHeaders } from 'node:http';
import type { Readable } from 'node:stream';

import read from '../read.js';
import type { RawOptions, BodyParser, BodyParserWithoutCheck } from '../types.js';
import { hasBody } from '../type-is.js';
import { getTypeChecker } from '../utils.js';

const debug = debugInit('body-parser:raw');

/**
 * Returns parser that parses all bodies as a `Buffer` and only looks at
 * requests where the `Content-Type` header matches the `type` option. This
 * parser supports automatic inflation of `gzip` and `deflate` encodings.
 *
 * The parser returns the request body in a Promise, that will be a `Buffer` object of the body.
 *
 * @param withoutCheck If you set this parameter to `true`, the presence
 * of the request body and the matching of headers will not be checked.
 */
export function getRawParser(options?: RawOptions, withoutCheck?: false | undefined): BodyParser<Buffer>;
export function getRawParser(options: RawOptions, withoutCheck: true): BodyParserWithoutCheck<Buffer>;
export function getRawParser(
  options?: RawOptions,
  withoutCheck?: boolean,
): BodyParser<Buffer> | BodyParserWithoutCheck<Buffer> {
  const opts = options || {};

  const inflate = opts.inflate !== false;
  const limit = typeof opts.limit != 'number' ? bytes.parse(opts.limit || '100kb') : opts.limit;
  const type = opts.type || 'application/octet-stream';
  const verify = opts.verify || false;

  if (verify !== false && typeof verify != 'function') {
    throw new TypeError('option verify must be function');
  }

  // create the appropriate type checking function
  const shouldParse = typeof type != 'function' ? getTypeChecker(type) : type;

  function parse(buf: Buffer) {
    return buf;
  }

  function rawParserWithoutCheck(req: Readable, headers: IncomingHttpHeaders) {
    return read(req, headers, parse, debug, {
      encoding: null,
      inflate: inflate,
      limit: limit,
      verify: verify,
    });
  }

  if (withoutCheck) {
    rawParserWithoutCheck.shouldParse = shouldParse;
    return rawParserWithoutCheck;
  } else {
    return function rawParser(req: Readable, headers: IncomingHttpHeaders) {
      // skip requests without bodies
      if (!hasBody(headers)) {
        debug('skip empty body');
        return Promise.resolve({} as any);
      }

      debug(`content-type ${headers['content-type']}`);

      // determine if request should be parsed
      if (!shouldParse(headers)) {
        debug('skip parsing');
        return Promise.resolve({} as any);
      }

      return rawParserWithoutCheck(req, headers);
    };
  }
}
