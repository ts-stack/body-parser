import type { IncomingHttpHeaders } from 'node:http';
import { Readable } from 'node:stream';
import debugInit from 'debug';

import type { BodyParserWithoutCheck, JsonOptions, RawOptions, TextOptions, UrlencodedOptions } from './types.js';
import { hasBody } from './type-is.js';
import { getJsonParser } from './parsers/json.js';
import { getTextParser } from './parsers/text.js';
import { getUrlencodedParser } from './parsers/urlencoded.js';
import { getRawParser } from './parsers/raw.js';

const debug = debugInit('body-parser:parse');

export class BodyParserOptions {
  jsonOptions?: JsonOptions = {};
  textOptions?: TextOptions = {};
  urlencodedOptions?: UrlencodedOptions = {};
  rawOptions?: RawOptions = {};
}

export class BodyParserGroup {
  protected json: BodyParserWithoutCheck<any>;
  protected text: BodyParserWithoutCheck<string | Buffer>;
  protected urlencoded: BodyParserWithoutCheck<any>;
  protected raw: BodyParserWithoutCheck<Buffer>;

  constructor(bodyParsersOptions = new BodyParserOptions()) {
    this.json = getJsonParser<any>(bodyParsersOptions.jsonOptions!, true);
    this.text = getTextParser(bodyParsersOptions.jsonOptions!, true);
    this.urlencoded = getUrlencodedParser<any>(bodyParsersOptions.jsonOptions!, true);
    this.raw = getRawParser(bodyParsersOptions.jsonOptions!, true);
  }

  parse<T = any>(req: Readable, headers: IncomingHttpHeaders): Promise<T | null | false> {
    if(!hasBody(headers)) {
      debug('skip empty body');
      return Promise.resolve(null);
    }

    debug(`content-type ${headers['content-type']}`);

    if (this.json.shouldParse(headers)) {
      return this.json(req, headers);
    } else if (this.text.shouldParse(headers)) {
      return this.text(req, headers) as any;
    } else if (this.urlencoded.shouldParse(headers)) {
      return this.urlencoded(req, headers);
    } else if (this.raw.shouldParse(headers)) {
      return this.raw(req, headers) as any;
    }

    debug('skip parsing: json, text, urlencoded and raw');
    return Promise.resolve(false);
  }
}
