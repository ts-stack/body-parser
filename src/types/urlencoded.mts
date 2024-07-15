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
import deprecate from 'depd';
import typeis from 'type-is';
import qs from 'qs';
import querystring from 'node:querystring';
import { IncomingMessage } from 'node:http';

import read from '../read.mjs';
import { Req, Res, UrlencodedOptions } from '../types.js';

const debug = debugInit('body-parser:urlencoded');
deprecate('body-parser');

/**
 * Cache of parser modules.
 */

const parsers = Object.create(null);

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
export function urlencoded(options: UrlencodedOptions) {
  const opts = options || {};

  // notice because option default will flip in next major
  if (opts.extended === undefined) {
    deprecate('undefined extended: provide extended option');
  }

  const extended = opts.extended !== false;
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

  function parse(body: any) {
    return body.length ? queryparse(body) : {};
  }

  return async function urlencodedParser(req: Req, res: Res) {
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

    // assert charset
    const charset = getCharset(req) || 'utf-8';
    if (charset !== 'utf-8') {
      debug('invalid charset');
      throw createError(415, 'unsupported charset "' + charset.toUpperCase() + '"', {
        charset: charset,
        type: 'charset.unsupported',
      });
    }

    // read
    return read(req, res, parse, debug, {
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
  const parse = parser('qs');

  if (isNaN(parameterLimit) || parameterLimit < 1) {
    throw new TypeError('option parameterLimit must be a positive number');
  }

  if (isFinite(parameterLimit)) {
    parameterLimit = parameterLimit | 0;
  }

  return function queryparse(body: any) {
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
 * Count the number of parameters, stopping once limit reached
 *
 * @param {string} body
 * @param {number} limit
 * @api private
 */

function parameterCount(body: any, limit: any) {
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
 * Get parser for module name dynamically.
 *
 * @param {string} name
 * @return {function}
 * @api private
 */

function parser(name: string) {
  let mod = parsers[name];

  if (mod !== undefined) {
    return mod.parse;
  }

  // this uses a switch for static require analysis
  switch (name) {
    case 'qs':
      mod = qs;
      break;
    case 'querystring':
      mod = querystring;
      break;
  }

  // store to prevent invoking require()
  parsers[name] = mod;

  return mod.parse;
}

/**
 * Get the simple query parser.
 */
function simpleparser(options: UrlencodedOptions) {
  let parameterLimit = options.parameterLimit !== undefined ? options.parameterLimit : 1000;
  const parse = parser('querystring');

  if (isNaN(parameterLimit) || parameterLimit < 1) {
    throw new TypeError('option parameterLimit must be a positive number');
  }

  if (isFinite(parameterLimit)) {
    parameterLimit = parameterLimit | 0;
  }

  return function queryparse(body: any) {
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
 *
 * @param {string} type
 * @return {function}
 */

function typeChecker(type: any) {
  return function checkType(req: Req) {
    return Boolean(typeis(req as IncomingMessage, type));
  };
}
