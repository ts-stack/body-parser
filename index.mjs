/*!
 * body-parser
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

'use strict'

import json from './dist/types/json.mjs';
import raw from './dist/types/raw.mjs';
import text from './dist/types/text.mjs';
import urlencoded from './dist/types/urlencoded.mjs';
import deprecate from 'depd';
export * from './dist/types/json.mjs';
export * from './dist/types/raw.mjs';
export * from './dist/types/text.mjs';
export * from './dist/types/urlencoded.mjs';

deprecate('body-parser');

// exports = module.exports = deprecate.function(bodyParser, 'bodyParser: use individual json/urlencoded middlewares')


/**
 * Create a middleware to parse json and urlencoded bodies.
 *
 * @param {object} [options]
 * @return {function}
 * @deprecated
 * @public
 */

export default function bodyParser (options) {
  // use default type for parsers
  var opts = Object.create(options || null, {
    type: {
      configurable: true,
      enumerable: true,
      value: undefined,
      writable: true
    }
  })

  var _urlencoded = urlencoded(opts)
  var _json = json(opts)

  return function bodyParser (req, res, next) {
    _json(req, res, function (err) {
      if (err) return next(err)
      _urlencoded(req, res, next)
    })
  }
}

bodyParser.json = json;
bodyParser.raw = raw;
bodyParser.text = text;
bodyParser.urlencoded = urlencoded;
