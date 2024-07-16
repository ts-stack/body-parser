/*!
 * unpipe
 * Copyright(c) 2015 Douglas Christopher Wilson
 * MIT Licensed
 */

import { Readable } from 'stream';

/**
 * Unpipe a stream from all destinations.
 */
export default function unpipe(stream: Readable) {
  if (!stream) {
    throw new TypeError('argument stream is required');
  }

  stream.unpipe();

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
