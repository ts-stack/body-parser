/*!
 * body-parser
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

import bytes from 'bytes';
import contentType from 'content-type';
import debugInit from 'debug';
import typeis from 'type-is';
import { IncomingMessage } from 'node:http';

import read from '../read.mjs';
import { Req, Res, TextOptions } from '../types.js';

const debug = debugInit('body-parser:text');

/**
 * Returns middleware that parses all bodies as a string and only looks at
 * requests where the `Content-Type` header matches the `type` option. This
 * parser supports automatic inflation of `gzip` and `deflate` encodings.
 * 
 * A new `body` string containing the parsed data is populated on the `request`
 * object after the middleware (i.e. `req.body`). This will be a string of the
 * body.
 */
export function text(options: TextOptions) {
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
  const shouldParse = typeof type != 'function' ? typeChecker(type) : type;

  function parse(buf: any) {
    return buf;
  }

  return async function textParser(req: Req, res: Res) {
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

    // get charset
    const charset = getCharset(req) || defaultCharset;

    // read
    return read(req, res, parse, debug, {
      encoding: charset,
      inflate: inflate,
      limit: limit,
      verify: verify,
    });
  };
}

/**
 * Get the charset of a request.
 *
 * @param {object} req
 * @api private
 */

function getCharset(req: Req) {
  try {
    return (contentType.parse(req).parameters.charset || '').toLowerCase();
  } catch (e) {
    return undefined;
  }
}

/**
 * Get the simple type checker.
 *
 * @param {string} type
 * @return {function}
 */

function typeChecker(type: any) {
  return function checkType(req: Req) {
    return Boolean(typeis(req as IncomingMessage, type));
  };
}
