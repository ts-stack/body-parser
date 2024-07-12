/*!
 * body-parser
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

import bytes from 'bytes';
import contentType from 'content-type';
import debug from 'debug';
import typeis from 'type-is';

import read from '../read.mjs';
import { OptionsText } from '../types.js';

debug('body-parser:text');

/**
 * Create a middleware to parse text bodies.
 */

export function text(options: OptionsText) {
  const opts = options || {};

  const defaultCharset = opts.defaultCharset || 'utf-8';
  const inflate = opts.inflate !== false;
  const limit = typeof opts.limit !== 'number' ? bytes.parse(opts.limit || '100kb') : opts.limit;
  const type = opts.type || 'text/plain';
  const verify = opts.verify || false;

  if (verify !== false && typeof verify !== 'function') {
    throw new TypeError('option verify must be function');
  }

  // create the appropriate type checking function
  const shouldParse = typeof type !== 'function' ? typeChecker(type) : type;

  function parse(buf: any) {
    return buf;
  }

  return function textParser(req: any, res: any, next: any) {
    if (req._body) {
      debug('body already parsed');
      next();
      return;
    }

    req.body = req.body || {};

    // skip requests without bodies
    if (!typeis.hasBody(req)) {
      debug('skip empty body');
      next();
      return;
    }

    debug(`content-type ${req.headers['content-type']}`);

    // determine if request should be parsed
    if (!shouldParse(req)) {
      debug('skip parsing');
      next();
      return;
    }

    // get charset
    const charset = getCharset(req) || defaultCharset;

    // read
    read(req, res, next, parse, debug, {
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

function getCharset(req: any) {
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
  return function checkType(req: any) {
    return Boolean(typeis(req, type));
  };
}
