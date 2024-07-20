import type { IncomingHttpHeaders } from 'node:http';
import { Readable } from 'node:stream';
import { BodyParser, typeIs } from '@ts-stack/body-parser';

export class BodyParsers {
  json: BodyParser;
  text: BodyParser;
  urlencoded: BodyParser;
  raw: BodyParser;

  parse(req: Readable, headers: IncomingHttpHeaders) {
    if (this.json.shouldParse(headers)) {
      return this.json(req, headers);
    } else if (this.text.shouldParse(headers)) {
      return this.text(req, headers);
    } else if (this.urlencoded.shouldParse(headers)) {
      return this.urlencoded(req, headers);
    } else if (this.raw.shouldParse(headers)) {
      return this.raw(req, headers);
    }

    return;
  }
}
