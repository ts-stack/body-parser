import assert from 'node:assert';
import asyncHooks from 'node:async_hooks';
import http from 'node:http';
import { Buffer } from 'safe-buffer';
import request from 'supertest';

import { getTextParser } from './text.mjs';
import type { TextOptions } from '../types.mjs';

const describeAsyncHooks = typeof asyncHooks.AsyncLocalStorage == 'function' ? describe : describe.skip;

describe('text()', function () {
  before(function () {
    this.server = createServer();
  });

  it('should parse text/plain', function (done) {
    request(this.server)
      .post('/')
      .set('Content-Type', 'text/plain')
      .send('user is tobi')
      .expect(200, '"user is tobi"', done);
  });

  it('should 400 when invalid content-length', function (done) {
    const textParser = getTextParser();
    const server = createServer(function (req: any, headers: any) {
      headers['content-length'] = '20'; // bad length
      return textParser(req, headers);
    });

    request(server)
      .post('/')
      .set('Content-Type', 'text/plain')
      .send('user')
      .expect(400, /content length/, done);
  });

  it('should handle Content-Length: 0', function (done) {
    request(createServer({ limit: '1kb' }))
      .post('/')
      .set('Content-Type', 'text/plain')
      .set('Content-Length', '0')
      .expect(200, '""', done);
  });

  it('should handle empty message-body', function (done) {
    request(createServer({ limit: '1kb' }))
      .post('/')
      .set('Content-Type', 'text/plain')
      .set('Transfer-Encoding', 'chunked')
      .send('')
      .expect(200, '""', done);
  });

  it('should 500 if stream not readable', function (done) {
    const textParser = getTextParser();
    const server = createServer(function (req: any, headers: any) {
      return new Promise((resolve, reject) => {
        req.on('end', async function () {
          try {
            const body = await textParser(req, headers);
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
      .set('Content-Type', 'text/plain')
      .send('user is tobi')
      .expect(500, '[stream.not.readable] stream is not readable', done);
  });

  describe('with defaultCharset option', function () {
    it('should change default charset', function (done) {
      const server = createServer({ defaultCharset: 'koi8-r' });
      const test = request(server).post('/');
      test.set('Content-Type', 'text/plain');
      test.write(Buffer.from('6e616d6520697320cec5d4', 'hex') as any);
      test.expect(200, '"name is нет"', done);
    });

    it('should honor content-type charset', function (done) {
      const server = createServer({ defaultCharset: 'koi8-r' });
      const test = request(server).post('/');
      test.set('Content-Type', 'text/plain; charset=utf-8');
      test.write(Buffer.from('6e616d6520697320e8aeba', 'hex') as any);
      test.expect(200, '"name is 论"', done);
    });
  });

  describe('with limit option', function () {
    it('should 413 when over limit with Content-Length', function (done) {
      const buf = Buffer.alloc(1028, '.');
      request(createServer({ limit: '1kb' }))
        .post('/')
        .set('Content-Type', 'text/plain')
        .set('Content-Length', '1028')
        .send(buf.toString())
        .expect(413, done);
    });

    it('should 413 when over limit with chunked encoding', function (done) {
      const buf = Buffer.alloc(1028, '.');
      const server = createServer({ limit: '1kb' });
      const test = request(server).post('/');
      test.set('Content-Type', 'text/plain');
      test.set('Transfer-Encoding', 'chunked');
      test.write(buf.toString());
      test.expect(413, done);
    });

    it('should 413 when inflated body over limit', function (done) {
      const server = createServer({ limit: '1kb' });
      const test = request(server).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'text/plain');
      test.write(Buffer.from('1f8b080000000000000ad3d31b05a360148c64000087e5a14704040000', 'hex') as any);
      test.expect(413, done);
    });

    it('should accept number of bytes', function (done) {
      const buf = Buffer.alloc(1028, '.');
      request(createServer({ limit: 1024 }))
        .post('/')
        .set('Content-Type', 'text/plain')
        .send(buf.toString())
        .expect(413, done);
    });

    it('should not change when options altered', function (done) {
      const buf = Buffer.alloc(1028, '.');
      const options = { limit: '1kb' };
      const server = createServer(options);

      options.limit = '100kb';

      request(server).post('/').set('Content-Type', 'text/plain').send(buf.toString()).expect(413, done);
    });

    it('should not hang response', function (done) {
      const buf: any = Buffer.alloc(10240, '.');
      const server = createServer({ limit: '8kb' });
      const test = request(server).post('/');
      test.set('Content-Type', 'text/plain');
      test.write(buf);
      test.write(buf);
      test.write(buf);
      test.expect(413, done);
    });

    it('should not error when inflating', function (done) {
      const server = createServer({ limit: '1kb' });
      const test = request(server).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'text/plain');
      test.write(Buffer.from('1f8b080000000000000ad3d31b05a360148c64000087e5a1470404', 'hex') as any);
      setTimeout(function () {
        test.expect(413, done);
      }, 100);
    });
  });

  describe('with inflate option', function () {
    describe('when false', function () {
      before(function () {
        this.server = createServer({ inflate: false });
      });

      it('should not accept content-encoding', function (done) {
        const test = request(this.server).post('/');
        test.set('Content-Encoding', 'gzip');
        test.set('Content-Type', 'text/plain');
        test.write(Buffer.from('1f8b080000000000000bcb4bcc4d55c82c5678b16e170072b3e0200b000000', 'hex') as any);
        test.expect(415, '[encoding.unsupported] content encoding unsupported', done);
      });
    });

    describe('when true', function () {
      before(function () {
        this.server = createServer({ inflate: true });
      });

      it('should accept content-encoding', function (done) {
        const test = request(this.server).post('/');
        test.set('Content-Encoding', 'gzip');
        test.set('Content-Type', 'text/plain');
        test.write(Buffer.from('1f8b080000000000000bcb4bcc4d55c82c5678b16e170072b3e0200b000000', 'hex') as any);
        test.expect(200, '"name is 论"', done);
      });
    });
  });

  describe('with type option', function () {
    describe('when "text/html"', function () {
      before(function () {
        this.server = createServer({ type: 'text/html' });
      });

      it('should parse for custom type', function (done) {
        request(this.server)
          .post('/')
          .set('Content-Type', 'text/html')
          .send('<b>tobi</b>')
          .expect(200, '"<b>tobi</b>"', done);
      });

      it('should ignore standard type', function (done) {
        request(this.server).post('/').set('Content-Type', 'text/plain').send('user is tobi').expect(200, '{}', done);
      });
    });

    describe('when ["text/html", "text/plain"]', function () {
      before(function () {
        this.server = createServer({ type: ['text/html', 'text/plain'] });
      });

      it('should parse "text/html"', function (done) {
        request(this.server)
          .post('/')
          .set('Content-Type', 'text/html')
          .send('<b>tobi</b>')
          .expect(200, '"<b>tobi</b>"', done);
      });

      it('should parse "text/plain"', function (done) {
        request(this.server).post('/').set('Content-Type', 'text/plain').send('tobi').expect(200, '"tobi"', done);
      });

      it('should ignore "text/xml"', function (done) {
        request(this.server)
          .post('/')
          .set('Content-Type', 'text/xml')
          .send('<user>tobi</user>')
          .expect(200, '{}', done);
      });
    });

    describe('when a function', function () {
      it('should parse when truthy value returned', function (done) {
        const server = createServer({ type: accept });

        function accept(req: any) {
          return req.headers['content-type'] === 'text/vnd.something';
        }

        request(server)
          .post('/')
          .set('Content-Type', 'text/vnd.something')
          .send('user is tobi')
          .expect(200, '"user is tobi"', done);
      });

      it('should work without content-type', function (done) {
        const server = createServer({ type: accept });

        function accept(req: any) {
          return true;
        }

        const test = request(server).post('/');
        test.write('user is tobi');
        test.expect(200, '"user is tobi"', done);
      });

      it('should not invoke without a body', function (done) {
        const server = createServer({ type: accept });

        function accept(req: any) {
          throw new Error('oops!');
        }

        request(server).get('/').expect(200, done);
      });
    });
  });

  describe('with verify option', function () {
    it('should assert value is function', function () {
      assert.throws(createServer.bind(null, { verify: 'lol' } as any), /TypeError: option verify must be function/);
    });

    it('should error from verify', function (done) {
      const server = createServer({
        verify: function (req, buf) {
          if (buf[0] === 0x20) throw new Error('no leading space');
        },
      });

      request(server)
        .post('/')
        .set('Content-Type', 'text/plain')
        .send(' user is tobi')
        .expect(403, '[entity.verify.failed] no leading space', done);
    });

    it('should allow custom codes', function (done) {
      const server = createServer({
        verify: function (req, buf) {
          if (buf[0] !== 0x20) return;
          const err: any = new Error('no leading space');
          err.status = 400;
          throw err;
        },
      });

      request(server)
        .post('/')
        .set('Content-Type', 'text/plain')
        .send(' user is tobi')
        .expect(400, '[entity.verify.failed] no leading space', done);
    });

    it('should allow pass-through', function (done) {
      const server = createServer({
        verify: function (req, buf) {
          if (buf[0] === 0x20) throw new Error('no leading space');
        },
      });

      request(server)
        .post('/')
        .set('Content-Type', 'text/plain')
        .send('user is tobi')
        .expect(200, '"user is tobi"', done);
    });

    it('should 415 on unknown charset prior to verify', function (done) {
      const server = createServer({
        verify: function (req, buf) {
          throw new Error('unexpected verify call');
        },
      });

      const test = request(server).post('/');
      test.set('Content-Type', 'text/plain; charset=x-bogus');
      test.write(Buffer.from('00000000', 'hex') as any);
      test.expect(415, '[charset.unsupported] unsupported charset "X-BOGUS"', done);
    });
  });

  describeAsyncHooks('async local storage', function () {
    before(function () {
      const textParser = getTextParser();
      const store = { foo: 'bar' };

      this.server = createServer(function (req: any, headers: any, res: any) {
        const asyncLocalStorage = new asyncHooks.AsyncLocalStorage();

        return asyncLocalStorage.run(store, async function () {
          const local: any = asyncLocalStorage.getStore();
          if (local) {
            res.setHeader('x-store-foo', String(local.foo));
          }
          return textParser(req, headers);
        });
      });
    });

    it('should presist store', function (done) {
      request(this.server)
        .post('/')
        .set('Content-Type', 'text/plain')
        .send('user is tobi')
        .expect(200)
        .expect('x-store-foo', 'bar')
        .expect('"user is tobi"')
        .end(done);
    });

    it('should presist store when unmatched content-type', function (done) {
      request(this.server)
        .post('/')
        .set('Content-Type', 'application/fizzbuzz')
        .send('buzz')
        .expect(200)
        .expect('x-store-foo', 'bar')
        .expect('{}')
        .end(done);
    });

    it('should presist store when inflated', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'text/plain');
      test.write(Buffer.from('1f8b080000000000000bcb4bcc4d55c82c5678b16e170072b3e0200b000000', 'hex') as any);
      test.expect(200);
      test.expect('x-store-foo', 'bar');
      test.expect('"name is 论"');
      test.end(done);
    });

    it('should presist store when inflate error', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'text/plain');
      test.write(Buffer.from('1f8b080000000000000bcb4bcc4d55c82c5678b16e170072b3e0200b0000', 'hex') as any);
      test.expect(400);
      test.expect('x-store-foo', 'bar');
      test.end(done);
    });

    it('should presist store when limit exceeded', function (done) {
      request(this.server)
        .post('/')
        .set('Content-Type', 'text/plain')
        .send('user is ' + Buffer.alloc(1024 * 100, '.').toString())
        .expect(413)
        .expect('x-store-foo', 'bar')
        .end(done);
    });
  });

  describe('charset', function () {
    before(function () {
      this.server = createServer();
    });

    it('should parse utf-8', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Type', 'text/plain; charset=utf-8');
      test.write(Buffer.from('6e616d6520697320e8aeba', 'hex') as any);
      test.expect(200, '"name is 论"', done);
    });

    it('should parse codepage charsets', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Type', 'text/plain; charset=koi8-r');
      test.write(Buffer.from('6e616d6520697320cec5d4', 'hex') as any);
      test.expect(200, '"name is нет"', done);
    });

    it('should parse when content-length != char length', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Type', 'text/plain; charset=utf-8');
      test.set('Content-Length', '11');
      test.write(Buffer.from('6e616d6520697320e8aeba', 'hex') as any);
      test.expect(200, '"name is 论"', done);
    });

    it('should default to utf-8', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Type', 'text/plain');
      test.write(Buffer.from('6e616d6520697320e8aeba', 'hex') as any);
      test.expect(200, '"name is 论"', done);
    });

    it('should 415 on unknown charset', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Type', 'text/plain; charset=x-bogus');
      test.write(Buffer.from('00000000', 'hex') as any);
      test.expect(415, '[charset.unsupported] unsupported charset "X-BOGUS"', done);
    });
  });

  describe('encoding', function () {
    before(function () {
      this.server = createServer({ limit: '10kb' });
    });

    it('should parse without encoding', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Type', 'text/plain');
      test.write(Buffer.from('6e616d6520697320e8aeba', 'hex') as any);
      test.expect(200, '"name is 论"', done);
    });

    it('should support identity encoding', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Encoding', 'identity');
      test.set('Content-Type', 'text/plain');
      test.write(Buffer.from('6e616d6520697320e8aeba', 'hex') as any);
      test.expect(200, '"name is 论"', done);
    });

    it('should support gzip encoding', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'text/plain');
      test.write(Buffer.from('1f8b080000000000000bcb4bcc4d55c82c5678b16e170072b3e0200b000000', 'hex') as any);
      test.expect(200, '"name is 论"', done);
    });

    it('should support deflate encoding', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Encoding', 'deflate');
      test.set('Content-Type', 'text/plain');
      test.write(Buffer.from('789ccb4bcc4d55c82c5678b16e17001a6f050e', 'hex') as any);
      test.expect(200, '"name is 论"', done);
    });

    it('should be case-insensitive', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Encoding', 'GZIP');
      test.set('Content-Type', 'text/plain');
      test.write(Buffer.from('1f8b080000000000000bcb4bcc4d55c82c5678b16e170072b3e0200b000000', 'hex') as any);
      test.expect(200, '"name is 论"', done);
    });

    it('should 415 on unknown encoding', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Encoding', 'nulls');
      test.set('Content-Type', 'text/plain');
      test.write(Buffer.from('000000000000', 'hex') as any);
      test.expect(415, '[encoding.unsupported] unsupported content encoding "nulls"', done);
    });
  });
});

function createServer(opts?: TextOptions | Function) {
  const _bodyParser = typeof opts != 'function' ? getTextParser(opts) : opts;

  return http.createServer(async function (req, res) {
    try {
      const body = await _bodyParser(req, req.headers, res);
      res.statusCode = 200;
      res.end(JSON.stringify(body));
    } catch (err: any) {
      // console.log('-'.repeat(50), 'catch error:', 'status', err.status, err);
      res.statusCode = err.status || 500;
      res.end('[' + err.type + '] ' + err.message);
    }
  });
}
