/*!
 * raw-body
 * Copyright(c) 2013-2014 Jonathan Ong
 * Copyright(c) 2014-2022 Douglas Christopher Wilson
 * MIT Licensed
 */

import asyncHooks from 'node:async_hooks';
import type { Readable } from 'stream';
import bytes from 'bytes';
import createError from 'http-errors';
import iconv from 'iconv-lite';

import unpipe from './unpipe.js';
import { Fn } from './types.js';
import { RawBodyEncoding, RawBodyError, RawBodyOptions } from './raw-body-types.js';

const ICONV_ENCODING_MESSAGE_REGEXP = /^Encoding not recognized: /;

/**
 * Gets the entire buffer of a stream either as a `Buffer` or a string.
 * Validates the stream's length against an expected length and maximum
 * limit. Ideal for parsing request bodies.
 */
export function getRawBody(stream: Readable, callback: (err: RawBodyError, body: Buffer) => void): void;

export function getRawBody(
  stream: Readable,
  options: (RawBodyOptions & { encoding: RawBodyEncoding }) | RawBodyEncoding,
  callback: (err: RawBodyError, body: string) => void,
): void;

export function getRawBody(
  stream: Readable,
  options: RawBodyOptions,
  callback: (err: RawBodyError, body: Buffer) => void,
): void;

export function getRawBody(
  stream: Readable,
  options: (RawBodyOptions & { encoding: RawBodyEncoding }) | RawBodyEncoding,
): Promise<string>;

export function getRawBody(stream: Readable, options?: RawBodyOptions): Promise<Buffer>;

export function getRawBody(stream: Readable, callbackOrOptions?: RawBodyOptions | string | Fn | true, callback?: Fn) {
  let done = callback;
  let opts = {} as RawBodyOptions;

  // light validation
  if (stream === undefined) {
    throw new TypeError('argument stream is required');
  } else if (typeof stream != 'object' || stream === null || typeof stream.on != 'function') {
    throw new TypeError('argument stream must be a stream');
  }

  if (callbackOrOptions === true || typeof callbackOrOptions == 'string') {
    // short cut for encoding
    opts = {
      encoding: callbackOrOptions,
    };
  } else if (typeof callbackOrOptions == 'function') {
    done = callbackOrOptions as Fn;
    opts = {};
  } else {
    opts = callbackOrOptions || {};
  }

  // validate callback is a function, if provided
  if (done !== undefined && typeof done != 'function') {
    throw new TypeError('argument callback must be a function');
  }

  // require the callback without promises
  if (!done && !global.Promise) {
    throw new TypeError('argument callback is required');
  }

  // get encoding
  const encoding: RawBodyEncoding | null | undefined = opts.encoding !== true ? opts.encoding : 'utf-8';

  // convert the limit to an integer
  const limit = bytes.parse(opts.limit || '');

  // convert the expected length to an integer
  const length = opts.length != null && !isNaN(opts.length as number) ? parseInt(opts.length as string, 10) : null;

  if (done) {
    // classic callback style
    return readStream(stream, encoding, length, limit, wrap(done));
  }

  return new Promise(function promiseExecutor(resolve, reject) {
    readStream(stream, encoding, length, limit, function onRead(err: null | Error, buf) {
      if (err) return reject(err);
      resolve(buf);
    });
  });
}

/**
 * Read the data from the stream.
 */
function readStream(
  stream: Readable,
  encoding: RawBodyEncoding | null | undefined,
  length: number | null,
  limit: number,
  callback: Fn,
) {
  let complete = false;
  let sync = true;

  // check the length and limit options.
  // note: we intentionally leave the stream paused,
  // so users should handle the stream themselves.
  if (limit !== null && length !== null && length > limit) {
    return done(
      createError(413, 'request entity too large', {
        expected: length,
        length,
        limit,
        type: 'entity.too.large',
      }),
    );
  }

  // streams1: assert request encoding is buffer.
  // streams2+: assert the stream encoding is buffer.
  //   stream._decoder: streams1
  //   state.encoding: streams2
  //   state.decoder: streams2, specifically < 0.10.6
  const state = (stream as any)._readableState;
  if ((stream as any)._decoder || (state && (state.encoding || state.decoder))) {
    // developer error
    return done(
      createError(500, 'stream encoding should not be set', {
        type: 'stream.encoding.set',
      }),
    );
  }

  if (stream.readable !== undefined && !stream.readable) {
    return done(
      createError(500, 'stream is not readable', {
        type: 'stream.not.readable',
      }),
    );
  }

  let received = 0;
  let decoder: any;

  try {
    decoder = getDecoder(encoding as string);
  } catch (err) {
    return done(err);
  }

  var buffer: string | any[] | null = decoder ? '' : [];

  // attach listeners
  stream.on('aborted', onAborted);
  stream.on('close', cleanup);
  stream.on('data', onData);
  stream.on('end', onEnd);
  stream.on('error', onEnd);

  // mark sync section complete
  sync = false;

  function done(...args: any[]) {
    // mark complete
    complete = true;

    if (sync) {
      process.nextTick(invokeCallback);
    } else {
      invokeCallback();
    }

    function invokeCallback() {
      cleanup();

      if (args[0]) {
        // halt the stream on error
        halt(stream);
      }

      callback(...args);
    }
  }

  function onAborted() {
    if (complete) return;

    done(
      createError(400, 'request aborted', {
        code: 'ECONNABORTED',
        expected: length,
        length: length,
        received: received,
        type: 'request.aborted',
      }),
    );
  }

  function onData(chunk: string) {
    if (complete) return;

    received += chunk.length;

    if (limit !== null && received > limit) {
      done(
        createError(413, 'request entity too large', {
          limit: limit,
          received: received,
          type: 'entity.too.large',
        }),
      );
    } else if (decoder) {
      buffer += decoder.write(chunk);
    } else {
      (buffer as any[]).push(chunk);
    }
  }

  function onEnd(err: Error) {
    if (complete) return;
    if (err) return done(err);

    if (length !== null && received !== length) {
      done(
        createError(400, 'request size did not match content length', {
          expected: length,
          length: length,
          received: received,
          type: 'request.size.invalid',
        }),
      );
    } else {
      const string = decoder ? buffer + (decoder.end() || '') : Buffer.concat(buffer as Uint8Array[]);
      done(null, string);
    }
  }

  function cleanup() {
    buffer = null;

    stream.removeListener('aborted', onAborted);
    stream.removeListener('data', onData);
    stream.removeListener('end', onEnd);
    stream.removeListener('error', onEnd);
    stream.removeListener('close', cleanup);
  }
}

/**
 * Wrap function with async resource, if possible.
 * AsyncResource.bind static method backported.
 */
function wrap(fn: Fn) {
  let res;

  // create anonymous resource
  if (asyncHooks.AsyncResource) {
    res = new asyncHooks.AsyncResource(fn.name || 'bound-anonymous-fn');
  }

  // incompatible node.js
  if (!res || !res.runInAsyncScope) {
    return fn;
  }

  // return bound function
  return res.runInAsyncScope.bind(res, fn, null);
}

/**
 * Halt a stream.
 */
function halt(stream: Readable) {
  // unpipe everything from the stream
  unpipe(stream);

  // pause stream
  if (typeof stream.pause == 'function') {
    stream.pause();
  }
}

/**
 * Get the decoder for a given encoding.
 */
function getDecoder(encoding: string) {
  if (!encoding) return null;

  try {
    return iconv.getDecoder(encoding);
  } catch (e: any) {
    // error getting decoder
    if (!ICONV_ENCODING_MESSAGE_REGEXP.test(e.message)) throw e;

    // the encoding was not found
    throw createError(415, 'specified encoding unsupported', {
      encoding: encoding,
      type: 'encoding.unsupported',
    });
  }
}
