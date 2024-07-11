/*!
 * body-parser
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

import bytes from 'bytes';
import debug from 'debug';
debug('body-parser:raw');
import read from '../read.mjs';
import typeis from 'type-is';

/**
 * Create a middleware to parse raw bodies.
 *
 * @param {object} [options]
 * @return {function}
 * @api public
 */

export default function raw (options: any) {
  const opts = options || {}

  const inflate = opts.inflate !== false
  const limit = typeof opts.limit !== 'number'
    ? bytes.parse(opts.limit || '100kb')
    : opts.limit
  const type = opts.type || 'application/octet-stream'
  const verify = opts.verify || false

  if (verify !== false && typeof verify !== 'function') {
    throw new TypeError('option verify must be function')
  }

  // create the appropriate type checking function
  const shouldParse = typeof type !== 'function'
    ? typeChecker(type)
    : type

  function parse (buf: any) {
    return buf
  }

  return function rawParser (req: any, res: any, next: any) {
    if (req._body) {
      debug('body already parsed')
      next()
      return
    }

    req.body = req.body || {}

    // skip requests without bodies
    if (!typeis.hasBody(req)) {
      debug('skip empty body')
      next()
      return
    }

    debug(`content-type ${req.headers['content-type']}`)

    // determine if request should be parsed
    if (!shouldParse(req)) {
      debug('skip parsing')
      next()
      return
    }

    // read
    read(req, res, next, parse, debug, {
      encoding: null,
      inflate: inflate,
      limit: limit,
      verify: verify
    })
  }
}

/**
 * Get the simple type checker.
 *
 * @param {string} type
 * @return {function}
 */

function typeChecker (type: any) {
  return function checkType (req: any) {
    return Boolean(typeis(req, type))
  }
}
