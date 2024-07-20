/*!
 * type-is
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

import { IncomingHttpHeaders } from 'node:http';
import contentType from 'content-type';
import mime from 'mime-types';

/**
 * Compare a `actual` content-type with `expected`.
 * Each `expected` can be an extension like `html`,
 * a special shortcut like `multipart` or `urlencoded`,
 * or a mime type.
 *
 * If no types match, `false` is returned.
 * Otherwise, the first `type` that matches is returned.
 */
export function is(actual?: any, ...expected: string[]): string | false;
export function is(actual?: any, expected?: string[]): string | false;
export function is(actual_?: string | null, expected?: string | string[]): string | false {
  // remove parameters and normalize
  const actual = tryNormalizeType(actual_);

  // no type or invalid
  if (!actual) {
    return false;
  }

  // support flattened arguments
  if (!Array.isArray(expected)) {
    expected = new Array(arguments.length - 1);
    for (let i = 0; i < expected.length; i++) {
      expected[i] = arguments[i + 1];
    }
  }

  // no types, return the content type
  if (!expected || !expected.length) {
    return actual;
  }

  let type;
  for (let i = 0; i < expected.length; i++) {
    const normalized = normalize((type = expected[i])) ?? false;
    if (mimeMatch(normalized, actual)) {
      return type[0] === '+' || type.indexOf('*') !== -1 ? actual : type;
    }
  }

  // no matches
  return false;
}

/**
 * Check if a request has a request body.
 * A request with a body __must__ either have `transfer-encoding`
 * or `content-length` headers set.
 * http://www.w3.org/Protocols/rfc2616/rfc2616-sec4.html#sec4.3
 */
export function hasBody(headers: IncomingHttpHeaders) {
  return headers['transfer-encoding'] !== undefined || !isNaN(headers['content-length'] as unknown as number);
}

/**
 * Check if the `headers` contains the "Content-Type"
 * field, and it contains any of the give mime `expected` types.
 * If there is no request body, `null` is returned.
 * If there is no content type, `false` is returned.
 * Otherwise, it returns the first `type` that matches.
 *
 * Examples:
 *
 *     // With Content-Type: text/html; charset=utf-8
 *     typeIs(headers, 'html'); // => 'html'
 *     typeIs(headers, 'text/html'); // => 'text/html'
 *     typeIs(headers, 'text/*', 'application/json'); // => 'text/html'
 *
 *     // When Content-Type is application/json
 *     typeIs(headers, 'json', 'urlencoded'); // => 'json'
 *     typeIs(headers, 'application/json'); // => 'application/json'
 *     typeIs(headers, 'html', 'application/*'); // => 'application/json'
 *
 *     typeIs(headers, 'html'); // => false
 */
export function typeIs(headers: IncomingHttpHeaders, ...expected: string[]): string | false | null;
export function typeIs(headers: IncomingHttpHeaders, expected?: string[]): string | false | null;
export function typeIs(headers: IncomingHttpHeaders, expected?: string | string[]): string | false | null {
  // no body
  if (!hasBody(headers)) {
    return null;
  }

  // support flattened arguments
  if (!Array.isArray(expected)) {
    expected = new Array(arguments.length - 1);
    for (let i = 0; i < expected.length; i++) {
      expected[i] = arguments[i + 1];
    }
  }

  // request content type
  const value = headers['content-type'];

  return is(value, expected);
}

/**
 * Normalize a mime type.
 * If it's a shorthand, expand it to a valid mime type.
 *
 * In general, you probably want:
 *
 *   const type = is(headers, ['urlencoded', 'json', 'multipart']);
 *
 * Then use the appropriate body parsers.
 * These three are the most common request body types
 * and are thus ensured to work.
 */
export function normalize(type: string): string | false | null {
  if (typeof type !== 'string') {
    // invalid type
    return false;
  }

  switch (type) {
    case 'urlencoded':
      return 'application/x-www-form-urlencoded';
    case 'multipart':
      return 'multipart/*';
  }

  if (type[0] === '+') {
    // "+json" -> "*/*+json" expando
    return '*/*' + type;
  }

  return type.indexOf('/') === -1 ? mime.lookup(type) : type;
}

/**
 * Check if `expected` mime type
 * matches `actual` mime type with
 * wildcard and +suffix support.
 */
export function mimeMatch(expected: string | false, actual: string): boolean {
  // invalid type
  if (expected === false) {
    return false;
  }

  // split types
  const actualParts = actual.split('/');
  const expectedParts = expected.split('/');

  // invalid format
  if (actualParts.length !== 2 || expectedParts.length !== 2) {
    return false;
  }

  // validate type
  if (expectedParts[0] !== '*' && expectedParts[0] !== actualParts[0]) {
    return false;
  }

  // validate suffix wildcard
  if (expectedParts[1].slice(0, 2) === '*+') {
    return (
      expectedParts[1].length <= actualParts[1].length + 1 &&
      expectedParts[1].slice(1) === actualParts[1].slice(1 - expectedParts[1].length)
    );
  }

  // validate subtype
  if (expectedParts[1] !== '*' && expectedParts[1] !== actualParts[1]) {
    return false;
  }

  return true;
}

/**
 * Normalize a type and remove parameters.
 */
function normalizeType(value: string): string {
  // parse the type
  const type = contentType.parse(value);

  // remove the parameters
  type.parameters = {};

  // reformat it
  return contentType.format(type);
}

/**
 * Try to normalize a type and remove parameters.
 */
function tryNormalizeType(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  try {
    return normalizeType(value);
  } catch (err) {
    return null;
  }
}
