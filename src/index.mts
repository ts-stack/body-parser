/*!
 * body-parser
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

import { BodyParser } from './types.js';
import json from './types/json.mjs';
import raw from './types/raw.mjs';
import text from './types/text.mjs';
import urlencoded from './types/urlencoded.mjs';
import deprecate from 'depd';
export * from './types/json.mjs';
export * from './types/raw.mjs';
export * from './types/text.mjs';
export * from './types/urlencoded.mjs';

deprecate('body-parser');

// exports = module.exports = deprecate.function(bodyParser, 'bodyParser: use individual json/urlencoded middlewares')


/**
 * Create a middleware to parse json and urlencoded bodies.
 */
export default function bodyParser (options: BodyParser) {
  // use default type for parsers
  const opts = Object.create(options || null, {
    type: {
      configurable: true,
      enumerable: true,
      value: undefined,
      writable: true
    }
  })

  const _urlencoded = urlencoded(opts)
  const _json = json(opts)

  return function bodyParser (req: any, res: any, next: any) {
    _json(req, res, function (err: any) {
      if (err) return next(err)
      _urlencoded(req, res, next)
    })
  }
}

bodyParser.json = json;
bodyParser.raw = raw;
bodyParser.text = text;
bodyParser.urlencoded = urlencoded;
