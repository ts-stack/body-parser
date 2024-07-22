import type { IncomingHttpHeaders } from 'node:http';
import { Readable } from 'node:stream';
import debugInit from 'debug';

import type { BodyParserWithoutCheck, JsonOptions, RawOptions, TextOptions, UrlencodedOptions } from './types.js';
import { hasBody } from './type-is.js';
import { getJsonParser } from './parsers/json.js';
import { getTextParser } from './parsers/text.js';
import { getUrlencodedParser } from './parsers/urlencoded.js';
import { getRawParser } from './parsers/raw.js';

const debug = debugInit('body-parser:group');

export class BodyParserOptions {
  jsonOptions?: JsonOptions = {};
  textOptions?: TextOptions = {};
  urlencodedOptions?: UrlencodedOptions = {};
  rawOptions?: RawOptions = {};
}

/**
 * A helper intended for cases when you do not know which parser should work for a particular route.
 * To initialize it, you can first pass parser options to its constructor,
 * and then you can use the `parse` method:
 * 
 * ```ts
import { BodyParserGroup } from '@ts-stack/body-parser';

const bodyParserGroup = new BodyParserGroup({
  jsonOptions: config.jsonOptions,
  textOptions: config.textOptions,
  urlencodedOptions: config.urlencodedOptions,
  rawOptions: config.rawOptions,
});

const body = await bodyParserGroup.parse(req, req.headers, {});
 * ```
 */
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

  /**
   * This method consistently checks the correspondence between the headers accepted
   * by a certain parser and the header passed to it in the `headers` parameter.
   * When it finds a match, it uses the found parser for the current request.
   *
   * If the request has no body, this method returns `null`. If no matching parser is found,
   * this method returns `false`. But you can change this behavior if you pass
   * a third parameter `defaultValue`, whose value will be returned in these
   * two cases (request with no body, or no matching parser found).
   */
  parse<T = any>(req: Readable, headers: IncomingHttpHeaders, defaultValue?: undefined): Promise<T | null | false>;
  parse<T = any>(req: Readable, headers: IncomingHttpHeaders, defaultValue: T): Promise<T>;
  parse<T = any>(req: Readable, headers: IncomingHttpHeaders, defaultValue?: any): Promise<T | null | false> {
    if (!hasBody(headers)) {
      debug('skip empty body');
      return Promise.resolve(defaultValue !== undefined ? defaultValue : null);
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
    return Promise.resolve(defaultValue !== undefined ? defaultValue : false);
  }
}
