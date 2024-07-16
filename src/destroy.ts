/*!
 * destroy
 * Copyright(c) 2014 Jonathan Ong
 * Copyright(c) 2015-2022 Douglas Christopher Wilson
 * MIT Licensed
 */

import { EventEmitter } from 'node:events';
import { ReadStream } from 'node:fs';
import Stream from 'node:stream';
import Zlib from 'node:zlib';

/**
 * Destroy the given stream, and optionally suppress any future `error` events.
 */
export default function destroy(stream: any, suppress: boolean) {
  if (isFsReadStream(stream)) {
    destroyReadStream(stream);
  } else if (isZlibStream(stream)) {
    destroyZlibStream(stream);
  }

  if (isEventEmitter(stream) && suppress) {
    stream.removeAllListeners('error');
    stream.addListener('error', noop);
  }

  return stream;
}

/**
 * Destroy a ReadStream.
 */
function destroyReadStream(stream: any) {
  stream.destroy();

  if (typeof stream.close == 'function') {
    // node.js core bug work-around
    stream.on('open', onOpenClose);
  }
}

/**
 * Close a Zlib stream.
 *
 * Zlib streams below Node.js 4.5.5 have a buggy implementation
 * of .close() when zlib encountered an error.
 */
function closeZlibStream(stream: any) {
  if (stream._hadError === true) {
    const prop = stream._binding === null ? '_binding' : '_handle';

    stream[prop] = {
      close: function () {
        this[prop] = null;
      },
    };
  }

  stream.close();
}

/**
 * Destroy a Zlib stream.
 *
 * Zlib streams don't have a destroy function in Node.js 6. On top of that
 * simply calling destroy on a zlib stream in Node.js 8+ will result in a
 * memory leak. So until that is fixed, we need to call both close AND destroy.
 *
 * PR to fix memory leak: https://github.com/nodejs/node/pull/23734
 *
 * In Node.js 6+8, it's important that destroy is called before close as the
 * stream would otherwise emit the error 'zlib binding closed'.
 */
function destroyZlibStream(stream: any) {
  if (typeof stream.destroy == 'function') {
    // node.js core bug work-around
    // istanbul ignore if: node.js 0.8
    if (stream._binding) {
      // node.js < 0.10.0
      stream.destroy();
      if (stream._processing) {
        stream._needDrain = true;
        stream.once('drain', onDrainClearBinding);
      } else {
        stream._binding.clear();
      }
    } else if (stream._destroy && stream._destroy !== Stream.Transform.prototype._destroy) {
      // node.js >= 12, ^11.1.0, ^10.15.1
      stream.destroy();
    } else if (stream._destroy && typeof stream.close == 'function') {
      // node.js 7, 8
      stream.destroyed = true;
      stream.close();
    } else {
      // fallback
      // istanbul ignore next
      stream.destroy();
    }
  } else if (typeof stream.close == 'function') {
    // node.js < 8 fallback
    closeZlibStream(stream);
  }
}

/**
 * Determine if val is EventEmitter.
 */
function isEventEmitter(val: any) {
  return val instanceof EventEmitter;
}

/**
 * Determine if stream is fs.ReadStream stream.
 * @private
 */

function isFsReadStream(stream: any) {
  return stream instanceof ReadStream;
}

/**
 * Determine if stream is Zlib stream.
 */
function isZlibStream(stream: any) {
  return (
    stream instanceof (Zlib as any).Gzip ||
    stream instanceof (Zlib as any).Gunzip ||
    stream instanceof (Zlib as any).Deflate ||
    stream instanceof (Zlib as any).DeflateRaw ||
    stream instanceof (Zlib as any).Inflate ||
    stream instanceof (Zlib as any).InflateRaw ||
    stream instanceof (Zlib as any).Unzip
  );
}

/**
 * No-op function.
 */
function noop() {}

/**
 * On drain handler to clear binding.
 */
// istanbul ignore next: node.js 0.8
function onDrainClearBinding(this: any) {
  this._binding.clear();
}

/**
 * On open handler to close stream.
 */
function onOpenClose(this: any) {
  if (typeof this.fd == 'number') {
    // actually close down the fd
    this.close();
  }
}
