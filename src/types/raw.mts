/*!
 * body-parser
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

import bytes from 'bytes';
import debugInit from 'debug';
import typeis from 'type-is';
import { IncomingMessage } from 'node:http';

import read from '../read.mjs';
import type { RawOptions, Req, Res } from '../types.js';

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
export function raw(options: RawOptions) {
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

  return async function rawParser(req: Req, res: Res) {
    const body = {};

    // skip requests without bodies
    if (!typeis.hasBody(req as IncomingMessage)) {
      debug('skip empty body');
      return body;
    }

    debug(`content-type ${req.headers['content-type']}`);

    // determine if request should be parsed
    if (!shouldParse(req)) {
      debug('skip parsing');
      return body;
    }

    // read
    return read(req, res, parse, debug, {
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
  return function checkType(req: Req) {
    return Boolean(typeis(req as IncomingMessage, type as string[]));
  };
}
