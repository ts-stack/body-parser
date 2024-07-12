/*!
 * body-parser
 * Copyright(c) 2014-2015 Douglas Christopher Wilson
 * MIT Licensed
 */

export * from './types/json.mjs';
export * from './types/raw.mjs';
export * from './types/text.mjs';
export * from './types/urlencoded.mjs';

import deprecate from 'depd';
deprecate('body-parser');
