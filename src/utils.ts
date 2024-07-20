import { IncomingHttpHeaders } from 'http';
import contentType from 'content-type';

import { typeIs } from './type-is.js';

/**
 * Get the simple type checker.
 */
export function getTypeChecker(type: string | string[]) {
  type = Array.isArray(type) ? type : [type];
  return function checkType(headers: IncomingHttpHeaders) {
    return Boolean(typeIs(headers, type));
  };
}

/**
 * Get the charset of a request.
 */
export function getCharset(headers: IncomingHttpHeaders) {
  try {
    const parsedMediaType = contentType.parse(headers['content-type'] || '');
    return (parsedMediaType.parameters.charset || '').toLowerCase();
  } catch (e) {
    return undefined;
  }
}
