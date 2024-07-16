/*!
 * unpipe
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */

import { Readable } from 'stream';

/**
 * Determine if there are Node.js pipe-like data listeners.
 */
function hasPipeDataListeners(stream: Readable) {
  const listeners = stream.listeners('data');

  for (let i = 0; i < listeners.length; i++) {
    if (listeners[i].name === 'ondata') {
      return true;
    }
  }

  return false;
}

/**
 * Unpipe a stream from all destinations.
 */
export default function unpipe(stream: Readable) {
  if (!stream) {
    throw new TypeError('argument stream is required');
  }

  if (typeof stream.unpipe == 'function') {
    // new-style
    stream.unpipe();
    return;
  }

  // Node.js 0.8 hack
  if (!hasPipeDataListeners(stream)) {
    return;
  }

  let listener;
  const listeners = stream.listeners('close');

  for (let i = 0; i < listeners.length; i++) {
    listener = listeners[i];

    if (listener.name !== 'cleanup' && listener.name !== 'onclose') {
      continue;
    }

    // invoke the listener
    listener.call(stream);
  }
}
