import type { IncomingHttpHeaders } from 'node:http';
import { Readable } from 'node:stream';
import { BodyParser, typeIs } from '@ts-stack/body-parser';

export class BodyParsers {
  json: BodyParser;
  text: BodyParser;
  urlencoded: BodyParser;
  raw: BodyParser;

  parse(req: Readable, headers: IncomingHttpHeaders, acceptHeaders: string[]) {
    const parserKey = typeIs(headers, acceptHeaders);
    if (!parserKey) {
      return parserKey;
    }

    if (parserKey == 'application/json') {
      return this.json(req, headers);
    } else if (parserKey == 'text/plain') {
      return this.text(req, headers);
    } else if (parserKey == 'application/x-www-form-urlencoded') {
      return this.urlencoded(req, headers);
    } else if (parserKey == 'application/octet-stream') {
      return this.raw(req, headers);
    }

    return;
  }
}
