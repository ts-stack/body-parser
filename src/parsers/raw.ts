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
import type { RawOptions } from '../types.js';
import { hasBody, typeOfRequest } from '../type-is.js';

const debug = debugInit('body-parser:raw');

/**
 * Returns middleware that parses all bodies as a `Buffer` and only looks at
 * requests where the `Content-Type` header matches the `type` option. This
 * parser supports automatic inflation of `gzip` and `deflate` encodings.
 *
 * A new `body` object containing the parsed data is populated on the `request`
 * object after the middleware (i.e. `req.body`). This will be a `Buffer` object
 * of the body.
 */
export function getRawParser(options?: RawOptions) {
  const opts = options || {};

  const inflate = opts.inflate !== false;
  const limit = typeof opts.limit != 'number' ? bytes.parse(opts.limit || '100kb') : opts.limit;
  const type = opts.type || 'application/octet-stream';
  const verify = opts.verify || false;

  if (verify !== false && typeof verify != 'function') {
    throw new TypeError('option verify must be function');
  }

  // create the appropriate type checking function
  const shouldParse = typeof type !== 'function' ? typeChecker(type) : type;

  function parse(buf: Buffer) {
    return buf;
  }

  return async function rawParser(req: Readable, headers: IncomingHttpHeaders) {
    const body = {};

    // skip requests without bodies
    if (!hasBody(headers)) {
      debug('skip empty body');
      return body;
    }

    debug(`content-type ${headers['content-type']}`);

    // determine if request should be parsed
    if (!shouldParse(headers)) {
      debug('skip parsing');
      return body;
    }

    // read
    return read(req, headers, parse, debug, {
      encoding: null,
      inflate: inflate,
      limit: limit,
      verify: verify,
    });
  };
}

/**
 * Get the simple type checker.
 */
function typeChecker(type: string | string[]) {
  type = Array.isArray(type) ? type : [type];
  return function checkType(headers: IncomingHttpHeaders) {
    return Boolean(typeOfRequest(headers, ...type));
  };
}
