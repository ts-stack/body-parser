# @ts-stack/body-parser

Node.js body parser writen in TypeScript, in [promise][2] style, in ESM format, without support Node.js version < 20.6.0. This library is a fork of the well-known [ExpressJS body parser library][0] (from [this commit][1]).

**Note** As request body's shape is based on user-controlled input, all properties and values in this object are untrusted and should be validated before trusting. For example, `body.foo.toString()` may fail in multiple ways, for example the `foo` property may not be there or may not be a string, and `toString` may not be a function and instead a string or other user input.

[Learn about the anatomy of an HTTP transaction in Node.js](https://nodejs.org/en/docs/guides/anatomy-of-an-http-transaction/).

_This does not handle multipart bodies_, due to their complex and typically large nature. For multipart bodies, you may be interested in [busboy][3].

This module provides the following parsers: JSON, Raw, Text, URL-encoded body parsers.

## Installation

```sh
npm install @ts-stack/body-parser
```

Please make sure that Node.js (version >= 20.6.0) is installed on your operating system.

## Usage

The `@ts-stack/body-parser` module exposes various factories to create parsers. All parsers return parsed body in [Promise][2] when the `Content-Type` request header matches the `type` option, or an empty object (`{}`) if there was no body to parse, the `Content-Type` was not matched.

The various errors returned by this module are described in the
[errors section](#errors).

```ts
import http from 'http';
import { getJsonParser } from '@ts-stack/body-parser';

import { InterfaceOfBody } from './types.js';

const jsonParser = getJsonParser({ limit: '1kb' });

http.createServer(async function (req, res) {
  try {
    const body = await jsonParser<InterfaceOfBody>(req, req.headers);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain')
    res.write('you posted:\n');
    res.end(JSON.stringify(body));
  } catch (err: any) {
    // handling an error
  }
});
```

Alternatively, you can use the `BodyParserGroup` helper. It is designed for cases when you do not know which parser is needed for a specific route. When creating an instance of the `BodyParserGroup` class, you can pass options for the corresponding parsers, after which you can use the `parse` method as follows:

```ts
import { BodyParserGroup } from '@ts-stack/body-parser';

const bodyParserGroup = new BodyParserGroup({
  jsonOptions: config.jsonOptions,
  textOptions: config.textOptions,
  urlencodedOptions: config.urlencodedOptions,
  rawOptions: config.rawOptions,
});

const body = await bodyParserGroup.parse(req, req.headers, {});
```

### Change accepted type for parsers

All the parser factories accept a `type` option which allows you to change the `Content-Type` that the parser will parse.

```ts
import { getJsonParser, getRawParser, getTextParser } from '@ts-stack/body-parser';

// parse various different custom JSON types as JSON
const jsonParser = getJsonParser({ type: 'application/*+json' });

// parse some custom thing into a Buffer
const rawParser = getRawParser({ type: 'application/vnd.custom-type' });

// parse an HTML body into a string
const textParser = getTextParser({ type: 'text/html' });
```

## Errors

The parsers provided by this module create errors using the
[`http-errors` module](https://www.npmjs.com/package/http-errors). The errors
will typically have a `status`/`statusCode` property that contains the suggested
HTTP response code, an `expose` property to determine if the `message` property
should be displayed to the client, a `type` property to determine the type of
error without matching against the `message`, and a `body` property containing
the read body, if available.

The following are the common errors created, though any error can come through
for various reasons.

### content encoding unsupported

This error will occur when the request had a `Content-Encoding` header that
contained an encoding but the "inflation" option was set to `false`. The
`status` property is set to `415`, the `type` property is set to
`'encoding.unsupported'`, and the `charset` property will be set to the
encoding that is unsupported.

### entity parse failed

This error will occur when the request contained an entity that could not be
parsed by the parser. The `status` property is set to `400`, the `type`
property is set to `'entity.parse.failed'`, and the `body` property is set to
the entity value that failed parsing.

### entity verify failed

This error will occur when the request contained an entity that could not be
failed verification by the defined `verify` option. The `status` property is
set to `403`, the `type` property is set to `'entity.verify.failed'`, and the
`body` property is set to the entity value that failed verification.

### request aborted

This error will occur when the request is aborted by the client before reading
the body has finished. The `received` property will be set to the number of
bytes received before the request was aborted and the `expected` property is
set to the number of expected bytes. The `status` property is set to `400`
and `type` property is set to `'request.aborted'`.

### request entity too large

This error will occur when the request body's size is larger than the "limit"
option. The `limit` property will be set to the byte limit and the `length`
property will be set to the request body's length. The `status` property is
set to `413` and the `type` property is set to `'entity.too.large'`.

### request size did not match content length

This error will occur when the request's length did not match the length from
the `Content-Length` header. This typically occurs when the request is malformed,
typically when the `Content-Length` header was calculated based on characters
instead of bytes. The `status` property is set to `400` and the `type` property
is set to `'request.size.invalid'`.

### stream encoding should not be set

This error will occur when something called the `req.setEncoding` method prior
to this parser. This module operates directly on bytes only and you cannot
call `req.setEncoding` when using this module. The `status` property is set to
`500` and the `type` property is set to `'stream.encoding.set'`.

### stream is not readable

This error will occur when the request is no longer readable when this parser
attempts to read it. This typically means something other than a parser from
this module read the request body already and the parser was also configured to
read the same request. The `status` property is set to `500` and the `type`
property is set to `'stream.not.readable'`.

### too many parameters

This error will occur when the content of the request exceeds the configured
`parameterLimit` for the `urlencoded` parser. The `status` property is set to
`413` and the `type` property is set to `'parameters.too.many'`.

### unsupported charset "BOGUS"

This error will occur when the request had a charset parameter in the
`Content-Type` header, but the `iconv-lite` module does not support it OR the
parser does not support it. The charset is contained in the message as well
as in the `charset` property. The `status` property is set to `415`, the
`type` property is set to `'charset.unsupported'`, and the `charset` property
is set to the charset that is unsupported.

### unsupported content encoding "bogus"

This error will occur when the request had a `Content-Encoding` header that
contained an unsupported encoding. The encoding is contained in the message
as well as in the `encoding` property. The `status` property is set to `415`,
the `type` property is set to `'encoding.unsupported'`, and the `encoding`
property is set to the encoding that is unsupported.

## License

[MIT](LICENSE)


[0]: https://github.com/expressjs/body-parser
[1]: https://github.com/expressjs/body-parser/commit/83db46a1e5512135ce01ed90b9132ee16a2657a8
[2]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise
[3]: https://github.com/mscdex/busboy
