import assert from 'node:assert';
import asyncHooks from 'node:async_hooks';
import http, { IncomingHttpHeaders, Server } from 'node:http';
import { Buffer } from 'safe-buffer';
import request from 'supertest';

import { getJsonParser } from './json.js';
import type { JsonOptions } from '../types.js';

describe('json()', function () {
  let server: Server;
  it('should parse JSON', function (done) {
    request(createServer())
      .post('/')
      .set('Content-Type', 'application/json')
      .send('{"user":"tobi"}')
      .expect(200, '{"user":"tobi"}', done);
  });

  it('should handle Content-Length: 0', function (done) {
    request(createServer())
      .get('/')
      .set('Content-Type', 'application/json')
      .set('Content-Length', '0')
      .expect(200, '{}', done);
  });

  it('should handle empty message-body', function (done) {
    request(createServer())
      .get('/')
      .set('Content-Type', 'application/json')
      .set('Transfer-Encoding', 'chunked')
      .expect(200, '{}', done);
  });

  it('should handle no message-body', function (done) {
    request(createServer())
      .get('/')
      .set('Content-Type', 'application/json')
      .unset('Transfer-Encoding')
      .expect(200, '{}', done);
  });

  it('should 400 when only whitespace', function (done) {
    request(createServer())
      .post('/')
      .set('Content-Type', 'application/json')
      .send('  \n')
      .expect(400, '[entity.parse.failed] ' + parseError(' '), done);
  });

  it('should 400 when invalid content-length', function (done) {
    const jsonParser = getJsonParser();
    const server = createServer(function (req: any, headers: any) {
      headers['content-length'] = '20'; // bad length
      return jsonParser(req, headers);
    });

    request(server)
      .post('/')
      .set('Content-Type', 'application/json')
      .send('{"str":')
      .expect(400, /content length/, done);
  });

  it('should 500 if stream not readable', function (done) {
    const jsonParser = getJsonParser();
    const server = createServer(function (req: any, headers: any) {
      return new Promise((resolve, reject) => {
        req.on('end', async function () {
          try {
            const body = await jsonParser(req, headers);
            resolve(body);
          } catch (error) {
            reject(error);
          }
        });
        req.resume();
      });
    });

    request(server)
      .post('/')
      .set('Content-Type', 'application/json')
      .send('{"user":"tobi"}')
      .expect(500, '[stream.not.readable] stream is not readable', done);
  });

  describe('when JSON is invalid', function () {
    beforeAll(function () {
      server = createServer();
    });

    it('should 400 for bad token', function (done) {
      request(server)
        .post('/')
        .set('Content-Type', 'application/json')
        .send('{:')
        .expect(400, '[entity.parse.failed] ' + parseError('{:'), done);
    });

    it('should 400 for incomplete', function (done) {
      request(server)
        .post('/')
        .set('Content-Type', 'application/json')
        .send('{"user"')
        .expect(400, '[entity.parse.failed] ' + parseError('{"user"'), done);
    });

    it('should include original body on error object', function (done) {
      request(server)
        .post('/')
        .set('Content-Type', 'application/json')
        .set('X-Error-Property', 'body')
        .send(' {"user"')
        .expect(400, ' {"user"', done);
    });
  });

  describe('with limit option', function () {
    it('should 413 when over limit with Content-Length', function (done) {
      const buf = Buffer.alloc(1024, '.');
      request(createServer({ limit: '1kb' }))
        .post('/')
        .set('Content-Type', 'application/json')
        .set('Content-Length', '1034')
        .send(JSON.stringify({ str: buf.toString() }))
        .expect(413, '[entity.too.large] request entity too large', done);
    });

    it('should 413 when over limit with chunked encoding', function (done) {
      const buf = Buffer.alloc(1024, '.');
      const server = createServer({ limit: '1kb' });
      const test = request(server).post('/');
      test.set('Content-Type', 'application/json');
      test.set('Transfer-Encoding', 'chunked');
      test.write('{"str":');
      test.write('"' + buf.toString() + '"}');
      test.expect(413, done);
    });

    it('should 413 when inflated body over limit', function (done) {
      const server = createServer({ limit: '1kb' });
      const test = request(server).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'application/json');
      test.write(Buffer.from('1f8b080000000000000aab562a2e2952b252d21b05a360148c58a0540b0066f7ce1e0a040000', 'hex') as any as any);
      test.expect(413, done);
    });

    it('should accept number of bytes', function (done) {
      const buf = Buffer.alloc(1024, '.');
      request(createServer({ limit: 1024 }))
        .post('/')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ str: buf.toString() }))
        .expect(413, done);
    });

    it('should not change when options altered', function (done) {
      const buf = Buffer.alloc(1024, '.');
      const options = { limit: '1kb' };
      const server = createServer(options);

      options.limit = '100kb';

      request(server)
        .post('/')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({ str: buf.toString() }))
        .expect(413, done);
    });

    it('should not hang response', function (done) {
      const buf: any = Buffer.alloc(10240, '.');
      const server = createServer({ limit: '8kb' });
      const test = request(server).post('/');
      test.set('Content-Type', 'application/json');
      test.write(buf);
      test.write(buf);
      test.write(buf);
      test.expect(413, done);
    });

    it('should not error when inflating', function (done) {
      const server = createServer({ limit: '1kb' });
      const test = request(server).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'application/json');
      test.write(Buffer.from('1f8b080000000000000aab562a2e2952b252d21b05a360148c58a0540b0066f7ce1e0a0400', 'hex') as any as any);
      test.expect(413, done);
    });
  });

  describe('with inflate option', function () {
    describe('when false', function () {
      beforeAll(function () {
        server = createServer({ inflate: false });
      });

      it('should not accept content-encoding', function (done) {
        const test = request(server).post('/');
        test.set('Content-Encoding', 'gzip');
        test.set('Content-Type', 'application/json');
        test.write(Buffer.from('1f8b080000000000000bab56ca4bcc4d55b2527ab16e97522d00515be1cc0e000000', 'hex') as any as any);
        test.expect(415, '[encoding.unsupported] content encoding unsupported', done);
      });
    });

    describe('when true', function () {
      beforeAll(function () {
        server = createServer({ inflate: true });
      });

      it('should accept content-encoding', function (done) {
        const test = request(server).post('/');
        test.set('Content-Encoding', 'gzip');
        test.set('Content-Type', 'application/json');
        test.write(Buffer.from('1f8b080000000000000bab56ca4bcc4d55b2527ab16e97522d00515be1cc0e000000', 'hex') as any as any);
        test.expect(200, '{"name":"论"}', done);
      });
    });
  });

  describe('with strict option', function () {
    describe('when undefined', function () {
      beforeAll(function () {
        server = createServer();
      });

      it('should 400 on primitives', function (done) {
        request(server)
          .post('/')
          .set('Content-Type', 'application/json')
          .send('true')
          .expect(400, '[entity.parse.failed] ' + parseError('#rue').replace(/#/g, 't'), done);
      });
    });

    describe('when false', function () {
      beforeAll(function () {
        server = createServer({ strict: false });
      });

      it('should parse primitives', function (done) {
        request(server).post('/').set('Content-Type', 'application/json').send('true').expect(200, 'true', done);
      });
    });

    describe('when true', function () {
      beforeAll(function () {
        server = createServer({ strict: true });
      });

      it('should not parse primitives', function (done) {
        request(server)
          .post('/')
          .set('Content-Type', 'application/json')
          .send('true')
          .expect(400, '[entity.parse.failed] ' + parseError('#rue').replace(/#/g, 't'), done);
      });

      it('should not parse primitives with leading whitespaces', function (done) {
        request(server)
          .post('/')
          .set('Content-Type', 'application/json')
          .send('    true')
          .expect(400, '[entity.parse.failed] ' + parseError('    #rue').replace(/#/g, 't'), done);
      });

      it('should allow leading whitespaces in JSON', function (done) {
        request(server)
          .post('/')
          .set('Content-Type', 'application/json')
          .send('   { "user": "tobi" }')
          .expect(200, '{"user":"tobi"}', done);
      });

      it('should include correct message in stack trace', function (done) {
        request(server)
          .post('/')
          .set('Content-Type', 'application/json')
          .set('X-Error-Property', 'stack')
          .send('true')
          .expect(400)
          .expect(shouldContainInBody(parseError('#rue').replace(/#/g, 't')))
          .end(done);
      });
    });
  });

  describe('with type option', function () {
    describe('when "application/vnd.api+json"', function () {
      beforeAll(function () {
        server = createServer({ type: 'application/vnd.api+json' });
      });

      it('should parse JSON for custom type', function (done) {
        request(server)
          .post('/')
          .set('Content-Type', 'application/vnd.api+json')
          .send('{"user":"tobi"}')
          .expect(200, '{"user":"tobi"}', done);
      });

      it('should ignore standard type', function (done) {
        request(server)
          .post('/')
          .set('Content-Type', 'application/json')
          .send('{"user":"tobi"}')
          .expect(200, '{}', done);
      });
    });

    describe('when ["application/json", "application/vnd.api+json"]', function () {
      beforeAll(function () {
        server = createServer({
          type: ['application/json', 'application/vnd.api+json'],
        });
      });

      it('should parse JSON for "application/json"', function (done) {
        request(server)
          .post('/')
          .set('Content-Type', 'application/json')
          .send('{"user":"tobi"}')
          .expect(200, '{"user":"tobi"}', done);
      });

      it('should parse JSON for "application/vnd.api+json"', function (done) {
        request(server)
          .post('/')
          .set('Content-Type', 'application/vnd.api+json')
          .send('{"user":"tobi"}')
          .expect(200, '{"user":"tobi"}', done);
      });

      it('should ignore "application/x-json"', function (done) {
        request(server)
          .post('/')
          .set('Content-Type', 'application/x-json')
          .send('{"user":"tobi"}')
          .expect(200, '{}', done);
      });
    });

    describe('when a function', function () {
      it('should parse when truthy value returned', function (done) {
        const server = createServer({ type: accept });

        function accept(headers: IncomingHttpHeaders) {
          return headers['content-type'] === 'application/vnd.api+json';
        }

        request(server)
          .post('/')
          .set('Content-Type', 'application/vnd.api+json')
          .send('{"user":"tobi"}')
          .expect(200, '{"user":"tobi"}', done);
      });

      it('should work without content-type', function (done) {
        const server = createServer({ type: accept });

        function accept(headers: IncomingHttpHeaders) {
          return true;
        }

        const test = request(server).post('/');
        test.write('{"user":"tobi"}');
        test.expect(200, '{"user":"tobi"}', done);
      });

      it('should not invoke without a body', function (done) {
        const server = createServer({ type: accept });

        function accept(headers: IncomingHttpHeaders) {
          throw new Error('oops!');
        }

        request(server).get('/').expect(200, done);
      });
    });
  });

  describe('with verify option', function () {
    it('should assert value if function', function () {
      assert.throws(createServer.bind(null, { verify: 'lol' as any }), /TypeError: option verify must be function/);
    });

    it('should error from verify', function (done) {
      const server = createServer({
        verify: function (req, buf) {
          if (buf[0] === 0x5b) throw new Error('no arrays');
        },
      });

      request(server)
        .post('/')
        .set('Content-Type', 'application/json')
        .send('["tobi"]')
        .expect(403, '[entity.verify.failed] no arrays', done);
    });

    it('should allow custom codes', function (done) {
      const server = createServer({
        verify: function (req, buf) {
          if (buf[0] !== 0x5b) return;
          const err = new Error('no arrays');
          (err as any).status = 400;
          throw err;
        },
      });

      request(server)
        .post('/')
        .set('Content-Type', 'application/json')
        .send('["tobi"]')
        .expect(400, '[entity.verify.failed] no arrays', done);
    });

    it('should allow custom type', function (done) {
      const server = createServer({
        verify: function (req, buf) {
          if (buf[0] !== 0x5b) return;
          const err: any = new Error('no arrays');
          err.type = 'foo.bar';
          throw err;
        },
      });

      request(server)
        .post('/')
        .set('Content-Type', 'application/json')
        .send('["tobi"]')
        .expect(403, '[foo.bar] no arrays', done);
    });

    it('should include original body on error object', function (done) {
      const server = createServer({
        verify: function (req, buf) {
          if (buf[0] === 0x5b) throw new Error('no arrays');
        },
      });

      request(server)
        .post('/')
        .set('Content-Type', 'application/json')
        .set('X-Error-Property', 'body')
        .send('["tobi"]')
        .expect(403, '["tobi"]', done);
    });

    it('should allow pass-through', function (done) {
      const server = createServer({
        verify: function (req, buf) {
          if (buf[0] === 0x5b) throw new Error('no arrays');
        },
      });

      request(server)
        .post('/')
        .set('Content-Type', 'application/json')
        .send('{"user":"tobi"}')
        .expect(200, '{"user":"tobi"}', done);
    });

    it('should work with different charsets', function (done) {
      const server = createServer({
        verify: function (req, buf) {
          if (buf[0] === 0x5b) throw new Error('no arrays');
        },
      });

      const test = request(server).post('/');
      test.set('Content-Type', 'application/json; charset=utf-16');
      test.write(Buffer.from('feff007b0022006e0061006d00650022003a00228bba0022007d', 'hex') as any as any);
      test.expect(200, '{"name":"论"}', done);
    });

    it('should 415 on unknown charset prior to verify', function (done) {
      const server = createServer({
        verify: function (req, buf) {
          throw new Error('unexpected verify call');
        },
      });

      const test = request(server).post('/');
      test.set('Content-Type', 'application/json; charset=x-bogus');
      test.write(Buffer.from('00000000', 'hex') as any as any);
      test.expect(415, '[charset.unsupported] unsupported charset "X-BOGUS"', done);
    });
  });

  describe('async local storage', function () {
    beforeAll(function () {
      const jsonParser = getJsonParser();
      const store = { foo: 'bar' };

      server = createServer(function (req: any, headers: any, res: any) {
        const asyncLocalStorage = new asyncHooks.AsyncLocalStorage();

        return asyncLocalStorage.run(store, async function () {
          const local: any = asyncLocalStorage.getStore();
          if (local) {
            res.setHeader('x-store-foo', String(local.foo));
          }
          return jsonParser(req, headers);
        });
      });
    });

    it('should presist store', function (done) {
      request(server)
        .post('/')
        .set('Content-Type', 'application/json')
        .send('{"user":"tobi"}')
        .expect(200)
        .expect('x-store-foo', 'bar')
        .expect('{"user":"tobi"}')
        .end(done);
    });

    it('should presist store when unmatched content-type', function (done) {
      request(server)
        .post('/')
        .set('Content-Type', 'application/fizzbuzz')
        .send('buzz')
        .expect(200)
        .expect('x-store-foo', 'bar')
        .expect('{}')
        .end(done);
    });

    it('should presist store when inflated', function (done) {
      const test = request(server).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'application/json');
      test.write(Buffer.from('1f8b080000000000000bab56ca4bcc4d55b2527ab16e97522d00515be1cc0e000000', 'hex') as any as any);
      test.expect(200);
      test.expect('x-store-foo', 'bar');
      test.expect('{"name":"论"}');
      test.end(done);
    });

    it('should presist store when inflate error', function (done) {
      const test = request(server).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'application/json');
      test.write(Buffer.from('1f8b080000000000000bab56cc4d55b2527ab16e97522d00515be1cc0e000000', 'hex') as any as any);
      test.expect(400);
      test.expect('x-store-foo', 'bar');
      test.end(done);
    });

    it('should presist store when parse error', function (done) {
      request(server)
        .post('/')
        .set('Content-Type', 'application/json')
        .send('{"user":')
        .expect(400)
        .expect('x-store-foo', 'bar')
        .end(done);
    });

    it('should presist store when limit exceeded', function (done) {
      request(server)
        .post('/')
        .set('Content-Type', 'application/json')
        .send('{"user":"' + Buffer.alloc(1024 * 100, '.').toString() + '"}')
        .expect(413)
        .expect('x-store-foo', 'bar')
        .end(done);
    });
  });

  describe('charset', function () {
    beforeAll(function () {
      server = createServer();
    });

    it('should parse utf-8', function (done) {
      const test = request(server).post('/');
      test.set('Content-Type', 'application/json; charset=utf-8');
      test.write(Buffer.from('7b226e616d65223a22e8aeba227d', 'hex') as any as any);
      test.expect(200, '{"name":"论"}', done);
    });

    it('should parse utf-16', function (done) {
      const test = request(server).post('/');
      test.set('Content-Type', 'application/json; charset=utf-16');
      test.write(Buffer.from('feff007b0022006e0061006d00650022003a00228bba0022007d', 'hex') as any);
      test.expect(200, '{"name":"论"}', done);
    });

    it('should parse when content-length != char length', function (done) {
      const test = request(server).post('/');
      test.set('Content-Type', 'application/json; charset=utf-8');
      test.set('Content-Length', '13');
      test.write(Buffer.from('7b2274657374223a22c3a5227d', 'hex') as any);
      test.expect(200, '{"test":"å"}', done);
    });

    it('should default to utf-8', function (done) {
      const test = request(server).post('/');
      test.set('Content-Type', 'application/json');
      test.write(Buffer.from('7b226e616d65223a22e8aeba227d', 'hex') as any);
      test.expect(200, '{"name":"论"}', done);
    });

    it('should fail on unknown charset', function (done) {
      const test = request(server).post('/');
      test.set('Content-Type', 'application/json; charset=koi8-r');
      test.write(Buffer.from('7b226e616d65223a22cec5d4227d', 'hex') as any);
      test.expect(415, '[charset.unsupported] unsupported charset "KOI8-R"', done);
    });
  });

  describe('encoding', function () {
    beforeAll(function () {
      server = createServer({ limit: '1kb' });
    });

    it('should parse without encoding', function (done) {
      const test = request(server).post('/');
      test.set('Content-Type', 'application/json');
      test.write(Buffer.from('7b226e616d65223a22e8aeba227d', 'hex') as any);
      test.expect(200, '{"name":"论"}', done);
    });

    it('should support identity encoding', function (done) {
      const test = request(server).post('/');
      test.set('Content-Encoding', 'identity');
      test.set('Content-Type', 'application/json');
      test.write(Buffer.from('7b226e616d65223a22e8aeba227d', 'hex') as any);
      test.expect(200, '{"name":"论"}', done);
    });

    it('should support gzip encoding', function (done) {
      const test = request(server).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'application/json');
      test.write(Buffer.from('1f8b080000000000000bab56ca4bcc4d55b2527ab16e97522d00515be1cc0e000000', 'hex') as any);
      test.expect(200, '{"name":"论"}', done);
    });

    it('should support deflate encoding', function (done) {
      const test = request(server).post('/');
      test.set('Content-Encoding', 'deflate');
      test.set('Content-Type', 'application/json');
      test.write(Buffer.from('789cab56ca4bcc4d55b2527ab16e97522d00274505ac', 'hex') as any);
      test.expect(200, '{"name":"论"}', done);
    });

    it('should be case-insensitive', function (done) {
      const test = request(server).post('/');
      test.set('Content-Encoding', 'GZIP');
      test.set('Content-Type', 'application/json');
      test.write(Buffer.from('1f8b080000000000000bab56ca4bcc4d55b2527ab16e97522d00515be1cc0e000000', 'hex') as any);
      test.expect(200, '{"name":"论"}', done);
    });

    it('should 415 on unknown encoding', function (done) {
      const test = request(server).post('/');
      test.set('Content-Encoding', 'nulls');
      test.set('Content-Type', 'application/json');
      test.write(Buffer.from('000000000000', 'hex') as any);
      test.expect(415, '[encoding.unsupported] unsupported content encoding "nulls"', done);
    });

    it('should 400 on malformed encoding', function (done) {
      const test = request(server).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'application/json');
      test.write(Buffer.from('1f8b080000000000000bab56cc4d55b2527ab16e97522d00515be1cc0e000000', 'hex') as any);
      test.expect(400, done);
    });

    it('should 413 when inflated value exceeds limit', function (done) {
      // gzip'd data exceeds 1kb, but deflated below 1kb
      const test = request(server).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'application/json');
      test.write(Buffer.from('1f8b080000000000000bedc1010d000000c2a0f74f6d0f071400000000000000', 'hex') as any);
      test.write(Buffer.from('0000000000000000000000000000000000000000000000000000000000000000', 'hex') as any);
      test.write(Buffer.from('0000000000000000004f0625b3b71650c30000', 'hex') as any);
      test.expect(413, done);
    });
  });
});

function createServer(optsOrCallback?: JsonOptions | Function) {
  const _bodyParser = typeof optsOrCallback != 'function' ? getJsonParser(optsOrCallback || {}) : optsOrCallback;

  return http.createServer(async function (req, res) {
    try {
      const body = await _bodyParser(req, req.headers, res);
      // console.log('-'.repeat(50), 'success response');
      res.statusCode = 200;
      res.end(JSON.stringify(body));
    } catch (err: any) {
      res.statusCode = err.status || 500;
      // if (res.statusCode === 500)
      // console.log('-'.repeat(50), 'catch error:', 'status', err.status, err);
      res.end(
        req.headers['x-error-property'] ? err[req.headers['x-error-property'] as string] : '[' + err.type + '] ' + err.message,
      );
    }
  });
}

function parseError(str: string) {
  try {
    JSON.parse(str);
    throw new SyntaxError('strict violation');
  } catch (e: any) {
    return e.message;
  }
}

function shouldContainInBody(str: string) {
  return function (res: any) {
    assert.ok(res.text.indexOf(str) !== -1, "expected '" + res.text + "' to contain '" + str + "'");
  };
}
