/*!
 * body-parser
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

import bytes from 'bytes';
import createError from 'http-errors';
import debugInit from 'debug';
import type { IncomingHttpHeaders } from 'node:http';
import type { Readable } from 'node:stream';

import read from '../read.js';
import type { JsonOptions } from '../types.js';
import { hasBody } from '../type-is.js';
import { getCharset, typeChecker } from '../utils.js';

const debug = debugInit('body-parser:json');

/**
 * RegExp to match the first non-space in a string.
 *
 * Allowed whitespace is defined in RFC 7159:
 *
 *    ws = *(
 *            %x20 /              ; Space
 *            %x09 /              ; Horizontal tab
 *            %x0A /              ; Line feed or New line
 *            %x0D )              ; Carriage return
 */

const FIRST_CHAR_REGEXP = /^[\x20\x09\x0a\x0d]*([^\x20\x09\x0a\x0d])/; // eslint-disable-line no-control-regex

const JSON_SYNTAX_CHAR = '#';
const JSON_SYNTAX_REGEXP = /#+/g;

/**
 * Returns parser that only parses `json` and only looks at requests where
 * the `Content-Type` header matches the `type` option. This parser accepts any
 * Unicode encoding of the body and supports automatic inflation of `gzip` and
 * `deflate` encodings.
 *
 * A new object containing the parsed data is returned by the parser in Promise style.
 */
export function getJsonParser(options?: JsonOptions) {
  const opts = options || {};

  const limit = typeof opts.limit != 'number' ? bytes.parse(opts.limit || '100kb') : opts.limit;
  const inflate = opts.inflate !== false;
  const reviver = opts.reviver;
  const strict = opts.strict !== false;
  const type = opts.type || 'application/json';
  const verify = opts.verify || false;

  if (verify !== false && typeof verify != 'function') {
    throw new TypeError('option verify must be function');
  }

  // create the appropriate type checking function
  const shouldParse = typeof type != 'function' ? typeChecker(type) : type;

  function parse(body: string) {
    if (body.length === 0) {
      // special-case empty json body, as it's a common client-side mistake
      // TODO: maybe make this configurable or part of "strict" option
      return {};
    }

    if (strict) {
      const first = firstchar(body) as string;

      if (first !== '{' && first !== '[') {
        debug('strict violation');
        throw createStrictSyntaxError(body, first);
      }
    }

    try {
      debug('parse json');
      return JSON.parse(body, reviver);
    } catch (e: any) {
      throw normalizeJsonSyntaxError(e, {
        message: e.message,
        stack: e.stack,
      });
    }
  }

  return async function jsonParser(req: Readable, headers: IncomingHttpHeaders) {
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

    // assert charset per RFC 7159 sec 8.1
    const charset = getCharset(headers) || 'utf-8';
    if (charset.slice(0, 4) !== 'utf-') {
      debug('invalid charset');
      throw createError(415, 'unsupported charset "' + charset.toUpperCase() + '"', {
        charset: charset,
        type: 'charset.unsupported',
      });
    }

    // read
    return read(req, headers, parse, debug, {
      encoding: charset,
      inflate,
      limit,
      verify,
    });
  };
}

/**
 * Create strict violation syntax error matching native error.
 */
function createStrictSyntaxError(str: string, char: string) {
  const index = str.indexOf(char);
  let partial = '';

  if (index !== -1) {
    partial = str.substring(0, index) + JSON_SYNTAX_CHAR;

    for (let i = index + 1; i < str.length; i++) {
      partial += JSON_SYNTAX_CHAR;
    }
  }

  try {
    JSON.parse(partial);
    /* istanbul ignore next */ throw new SyntaxError('strict violation');
  } catch (e: any) {
    return normalizeJsonSyntaxError(e, {
      message: e.message.replace(JSON_SYNTAX_REGEXP, function (placeholder: string) {
        return str.substring(index, index + placeholder.length);
      }),
      stack: e.stack,
    });
  }
}

/**
 * Get the first non-whitespace character in a string.
 */
function firstchar(str: string) {
  const match = FIRST_CHAR_REGEXP.exec(str);

  return match ? match[1] : undefined;
}

/**
 * Normalize a SyntaxError for JSON.parse.
 */
function normalizeJsonSyntaxError(error: any, obj: any) {
  const keys = Object.getOwnPropertyNames(error);

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (key !== 'stack' && key !== 'message') {
      delete error[key];
    }
  }

  // replace stack before message for Node.js 0.10 and below
  error.stack = obj.stack.replace(error.message, obj.message);
  error.message = obj.message;

  return error;
}
