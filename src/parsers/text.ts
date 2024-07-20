/*!
 * body-parser
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

import bytes from 'bytes';
import debugInit from 'debug';
import type { IncomingHttpHeaders } from 'node:http';
import type { Readable } from 'node:stream';

import { hasBody } from '../type-is.js';
import read from '../read.js';
import { TextOptions } from '../types.js';
import { getCharset, getTypeChecker } from '../utils.js';

const debug = debugInit('body-parser:text');

/**
 * Returns parser that parses all bodies as a string and only looks at
 * requests where the `Content-Type` header matches the `type` option. This
 * parser supports automatic inflation of `gzip` and `deflate` encodings.
 *
 * The parser returns the request body in a Promise, that will be a string of the body.
 */
export function getTextParser(options?: TextOptions) {
  const opts = options || {};

  const defaultCharset = opts.defaultCharset || 'utf-8';
  const inflate = opts.inflate !== false;
  const limit = typeof opts.limit != 'number' ? bytes.parse(opts.limit || '100kb') : opts.limit;
  const type = opts.type || 'text/plain';
  const verify = opts.verify || false;

  if (verify !== false && typeof verify != 'function') {
    throw new TypeError('option verify must be function');
  }

  // create the appropriate type checking function
  const shouldParse = typeof type != 'function' ? getTypeChecker(type) : type;

  function parse(buf: Buffer) {
    return buf;
  }

  return async function textParser(req: Readable, headers: IncomingHttpHeaders) {
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

    // get charset
    const charset = getCharset(headers) || defaultCharset;

    // read
    return read(req, headers, parse, debug, {
      encoding: charset,
      inflate: inflate,
      limit: limit,
      verify: verify,
    });
  };
}
