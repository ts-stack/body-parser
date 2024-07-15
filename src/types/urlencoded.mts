/*!
 * body-parser
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

import bytes from 'bytes';
import contentType from 'content-type';
import createError from 'http-errors';
import debugInit from 'debug';
import typeis from 'type-is';
import qs from 'qs';
import querystring from 'node:querystring';
import type { IncomingHttpHeaders, IncomingMessage } from 'node:http';
import type { Readable } from 'node:stream';

import read from '../read.mjs';
import type { UrlencodedOptions } from '../types.mjs';

const debug = debugInit('body-parser:urlencoded');

/**
 * Returns middleware that only parses `urlencoded` bodies and only looks at
 * requests where the `Content-Type` header matches the `type` option. This
 * parser accepts only UTF-8 encoding of the body and supports automatic
 * inflation of `gzip` and `deflate` encodings.
 *
 * A new `body` object containing the parsed data is populated on the `request`
 * object after the middleware (i.e. `req.body`). This object will contain
 * key-value pairs, where the value can be a string or array (when `extended` is
 * `false`), or any type (when `extended` is `true`).
 */
export function urlencoded(options?: UrlencodedOptions) {
  const opts = options || {};

  const extended = opts.extended || false;
  const inflate = opts.inflate !== false;
  const limit = typeof opts.limit != 'number' ? bytes.parse(opts.limit || '100kb') : opts.limit;
  const type = opts.type || 'application/x-www-form-urlencoded';
  const verify = opts.verify || false;

  if (verify !== false && typeof verify != 'function') {
    throw new TypeError('option verify must be function');
  }

  // create the appropriate query parser
  const queryparse = extended ? extendedparser(opts) : simpleparser(opts);

  // create the appropriate type checking function
  const shouldParse = typeof type != 'function' ? typeChecker(type) : type;

  function parse(body: string) {
    return body.length ? queryparse(body) : {};
  }

  return async function urlencodedParser(req: Readable, headers: IncomingHttpHeaders) {
    const body = {};

    // skip requests without bodies
    if (!typeis.hasBody(req as IncomingMessage)) {
      debug('skip empty body');
      return body;
    }

    debug(`content-type ${headers['content-type']}`);

    // determine if request should be parsed
    if (!shouldParse(req)) {
      debug('skip parsing');
      return body;
    }

    // assert charset
    let charset = 'utf-8';
    try {
      charset = (contentType.parse(req as IncomingMessage).parameters.charset || '').toLowerCase() || 'utf-8';
    } catch (e) {}

    if (charset !== 'utf-8') {
      debug('invalid charset');
      throw createError(415, 'unsupported charset "' + charset.toUpperCase() + '"', {
        charset: charset,
        type: 'charset.unsupported',
      });
    }

    // read
    return read(req, headers, parse, debug, {
      debug,
      encoding: charset,
      inflate,
      limit,
      verify,
    });
  };
}

/**
 * Get the extended query parser.
 */
function extendedparser(options: UrlencodedOptions) {
  let parameterLimit = options.parameterLimit !== undefined ? options.parameterLimit : 1000;
  const parse = qs.parse;

  if (isNaN(parameterLimit) || parameterLimit < 1) {
    throw new TypeError('option parameterLimit must be a positive number');
  }

  if (isFinite(parameterLimit)) {
    parameterLimit = parameterLimit | 0;
  }

  return function queryparse(body: string) {
    const paramCount = parameterCount(body, parameterLimit);

    if (paramCount === undefined) {
      debug('too many parameters');
      throw createError(413, 'too many parameters', {
        type: 'parameters.too.many',
      });
    }

    const arrayLimit = Math.max(100, paramCount);

    debug('parse extended urlencoding');
    return parse(body, {
      allowPrototypes: true,
      arrayLimit: arrayLimit,
      depth: Infinity,
      parameterLimit: parameterLimit,
    });
  };
}

/**
 * Count the number of parameters, stopping once limit reached.
 */
function parameterCount(body: string, limit: number) {
  let count = 0;
  let index = 0;

  while ((index = body.indexOf('&', index)) !== -1) {
    count++;
    index++;

    if (count === limit) {
      return undefined;
    }
  }

  return count;
}

/**
 * Get the simple query parser.
 */
function simpleparser(options: UrlencodedOptions) {
  let parameterLimit = options.parameterLimit !== undefined ? options.parameterLimit : 1000;
  const parse = querystring.parse;

  if (isNaN(parameterLimit) || parameterLimit < 1) {
    throw new TypeError('option parameterLimit must be a positive number');
  }

  if (isFinite(parameterLimit)) {
    parameterLimit = parameterLimit | 0;
  }

  return function queryparse(body: string) {
    const paramCount = parameterCount(body, parameterLimit);

    if (paramCount === undefined) {
      debug('too many parameters');
      throw createError(413, 'too many parameters', {
        type: 'parameters.too.many',
      });
    }

    debug('parse urlencoding');
    return parse(body, undefined, undefined, { maxKeys: parameterLimit });
  };
}

/**
 * Get the simple type checker.
 */
function typeChecker(type: string | string[]) {
  return function checkType(req: Readable) {
    return Boolean(typeis(req as IncomingMessage, type as string[]));
  };
}
