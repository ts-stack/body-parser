/*!
 * body-parser
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

import createError from 'http-errors';
import iconv from 'iconv-lite';
import onFinished from 'on-finished';
import zlib from 'node:zlib';
import type { ServerResponse } from 'node:http';

import { getRawBody } from './raw-body.mjs';
import destroy from './destroy.mjs';
import unpipe from './unpipe.mjs';
import type { Fn, ParseFn, ReadOptions, Req } from './types.js';

type ReqWithLength = Req & { length?: string };
export type ContentStream = zlib.Inflate | zlib.Gunzip | ReqWithLength;

/**
 * Read a request into a buffer and parse.
 */
export default async function read(
  req: Req,
  res: ServerResponse,
  parse: ParseFn,
  debug: Fn,
  opts: ReadOptions,
): Promise<object | undefined> {
  let stream: ContentStream;
  let length: string | undefined;

  // flag as parsed
  req._body = true;

  // read options
  const encoding = opts.encoding !== null ? opts.encoding : null;
  const verify = opts.verify;

  stream = getContentStream(req, debug, opts.inflate);
  length = (stream as ReqWithLength).length;
  (stream as ReqWithLength).length = undefined;

  // set raw-body options
  opts.length = length;
  opts.encoding = verify ? null : encoding;

  // assert charset is supported
  if (opts.encoding === null && encoding !== null && !iconv.encodingExists(encoding)) {
    throw createError(415, 'unsupported charset "' + encoding.toUpperCase() + '"', {
      charset: encoding.toLowerCase(),
      type: 'charset.unsupported',
    });
  }

  // read body
  debug('read body');
  try {
    const buff = await getRawBody(stream, opts);
    return cb(buff);
  } catch (error: any) {
    return new Promise((resolve, reject) => {
      let _error: any;

      if (error.type === 'encoding.unsupported') {
        // echo back charset
        _error = createError(415, 'unsupported charset "' + encoding?.toUpperCase() + '"', {
          charset: encoding?.toLowerCase(),
          type: 'charset.unsupported',
        });
      } else {
        // set status code on error
        _error = createError(400, error);
      }

      // unpipe from stream and destroy
      if (stream !== req) {
        unpipe(req);
        destroy(stream, true);
      }

      // read off entire request
      dump(req, function onfinished() {
        const err = createError(400, _error);
        reject(err);
      });
    });
  }

  function cb(body: Buffer) {
    // verify
    if (verify) {
      try {
        debug('verify body');
        verify(req, res, body, encoding);
      } catch (err: any) {
        throw createError(403, err, {
          body: body,
          type: err.type || 'entity.verify.failed',
        });
      }
    }

    // parse
    let strOrBuffer: string | Buffer = body;
    try {
      debug('parse body');
      strOrBuffer = typeof body != 'string' && encoding !== null ? iconv.decode(body, encoding) : body;
      return parse(strOrBuffer as any);
    } catch (err: any) {
      throw createError(400, err, {
        body: strOrBuffer,
        type: err.type || 'entity.parse.failed',
      });
    }
  }
}

/**
 * Get the content stream of the request.
 */
function getContentStream(req: Req, debug: Fn, inflate?: boolean): ContentStream {
  const encoding = (req.headers['content-encoding'] || 'identity').toLowerCase();
  const length = req.headers['content-length'];
  let stream: ContentStream;

  debug('content-encoding "%s"', encoding);

  if (inflate === false && encoding !== 'identity') {
    throw createError(415, 'content encoding unsupported', {
      encoding: encoding,
      type: 'encoding.unsupported',
    });
  }

  switch (encoding) {
    case 'deflate':
      stream = zlib.createInflate();
      debug('inflate body');
      req.pipe(stream);
      break;
    case 'gzip':
      stream = zlib.createGunzip();
      debug('gunzip body');
      req.pipe(stream);
      break;
    case 'identity':
      stream = req;
      stream.length = length;
      break;
    default:
      throw createError(415, `unsupported content encoding "${encoding}"`, {
        encoding,
        type: 'encoding.unsupported',
      });
  }

  return stream;
}

/**
 * Dump the contents of a request.
 */
function dump(req: Req, callback: Fn) {
  if (onFinished.isFinished(req)) {
    callback(null);
  } else {
    onFinished(req, callback);
    req.resume();
  }
}
