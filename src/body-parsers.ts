import type { IncomingHttpHeaders } from 'node:http';
import { Readable } from 'node:stream';
import type { BodyParser } from '@ts-stack/body-parser';
import debugInit from 'debug';

import { hasBody } from './type-is.js';

const debug = debugInit('body-parser:parse');

export class BodyParsers<T extends {} = {}> {
  json: BodyParser<T>;
  text: BodyParser<T>;
  urlencoded: BodyParser<T>;
  raw: BodyParser<T>;

  parse(req: Readable, headers: IncomingHttpHeaders): Promise<T | null | false> {
    if(!hasBody(headers)) {
      debug('skip empty body');
      return Promise.resolve(null);
    }

    debug(`content-type ${headers['content-type']}`);

    if (this.json.shouldParse(headers)) {
      return this.json(req, headers);
    } else if (this.text.shouldParse(headers)) {
      return this.text(req, headers);
    } else if (this.urlencoded.shouldParse(headers)) {
      return this.urlencoded(req, headers);
    } else if (this.raw.shouldParse(headers)) {
      return this.raw(req, headers);
    }

    debug('skip parsing: json, text, urlencoded and raw');
    return Promise.resolve(false);
  }
}
