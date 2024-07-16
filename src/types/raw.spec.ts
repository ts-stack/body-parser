import assert from 'node:assert';
import asyncHooks from 'node:async_hooks';
import http from 'node:http';
import { Buffer } from 'safe-buffer';
import request from 'supertest';

import { getRawParser } from './raw.mjs';
import type { RawOptions } from '../types.mjs';

const describeAsyncHooks = typeof asyncHooks.AsyncLocalStorage === 'function' ? describe : describe.skip;

describe('raw()', function () {
  before(function () {
    this.server = createServer();
  });

  it('should parse application/octet-stream', function (done) {
    request(this.server)
      .post('/')
      .set('Content-Type', 'application/octet-stream')
      .send('the user is tobi')
      .expect(200, 'buf:746865207573657220697320746f6269', done);
  });

  it('should 400 when invalid content-length', function (done) {
    const rawParser = getRawParser();
    const server = createServer(function (req: any, headers: any) {
      headers['content-length'] = '20'; // bad length
      return rawParser(req, headers);
    });

    request(server)
      .post('/')
      .set('Content-Type', 'application/octet-stream')
      .send('stuff')
      .expect(400, /content length/, done);
  });

  it('should handle Content-Length: 0', function (done) {
    request(this.server)
      .post('/')
      .set('Content-Type', 'application/octet-stream')
      .set('Content-Length', '0')
      .expect(200, 'buf:', done);
  });

  it('should handle empty message-body', function (done) {
    request(this.server)
      .post('/')
      .set('Content-Type', 'application/octet-stream')
      .set('Transfer-Encoding', 'chunked')
      .send('')
      .expect(200, 'buf:', done);
  });

  it('should 500 if stream not readable', function (done) {
    const rawParser = getRawParser();
    const server = createServer(function (req: any, headers: any) {
      return new Promise((resolve, reject) => {
        req.on('end', async function () {
          try {
            const body = await rawParser(req, headers);
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
      .set('Content-Type', 'application/octet-stream')
      .send('the user is tobi')
      .expect(500, '[stream.not.readable] stream is not readable', done);
  });

  describe('with limit option', function () {
    it('should 413 when over limit with Content-Length', function (done) {
      const buf: any = Buffer.alloc(1028, '.');
      const server = createServer({ limit: '1kb' });
      const test = request(server).post('/');
      test.set('Content-Type', 'application/octet-stream');
      test.set('Content-Length', '1028');
      test.write(buf);
      test.expect(413, done);
    });

    it('should 413 when over limit with chunked encoding', function (done) {
      const buf: any = Buffer.alloc(1028, '.');
      const server = createServer({ limit: '1kb' });
      const test = request(server).post('/');
      test.set('Content-Type', 'application/octet-stream');
      test.set('Transfer-Encoding', 'chunked');
      test.write(buf);
      test.expect(413, done);
    });

    it('should 413 when inflated body over limit', function (done) {
      const server = createServer({ limit: '1kb' });
      const test = request(server).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'application/octet-stream');
      test.write(Buffer.from('1f8b080000000000000ad3d31b05a360148c64000087e5a14704040000', 'hex') as any);
      test.expect(413, done);
    });

    it('should accept number of bytes', function (done) {
      const buf: any = Buffer.alloc(1028, '.');
      const server = createServer({ limit: 1024 });
      const test = request(server).post('/');
      test.set('Content-Type', 'application/octet-stream');
      test.write(buf);
      test.expect(413, done);
    });

    it('should not change when options altered', function (done) {
      const buf: any = Buffer.alloc(1028, '.');
      const options = { limit: '1kb' };
      const server = createServer(options);

      options.limit = '100kb';

      const test = request(server).post('/');
      test.set('Content-Type', 'application/octet-stream');
      test.write(buf);
      test.expect(413, done);
    });

    it('should not hang response', function (done) {
      const buf: any = Buffer.alloc(10240, '.');
      const server = createServer({ limit: '8kb' });
      const test = request(server).post('/');
      test.set('Content-Type', 'application/octet-stream');
      test.write(buf);
      test.write(buf);
      test.write(buf);
      test.expect(413, done);
    });

    it('should not error when inflating', function (done) {
      const server = createServer({ limit: '1kb' });
      const test = request(server).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'application/octet-stream');
      test.write(Buffer.from('1f8b080000000000000ad3d31b05a360148c64000087e5a147040400', 'hex') as any);
      test.expect(413, done);
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
        test.set('Content-Type', 'application/octet-stream');
        test.write(Buffer.from('1f8b080000000000000bcb4bcc4db57db16e170099a4bad608000000', 'hex') as any);
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
        test.set('Content-Type', 'application/octet-stream');
        test.write(Buffer.from('1f8b080000000000000bcb4bcc4db57db16e170099a4bad608000000', 'hex') as any);
        test.expect(200, 'buf:6e616d653de8aeba', done);
      });
    });
  });

  describe('with type option', function () {
    describe('when "application/vnd+octets"', function () {
      before(function () {
        this.server = createServer({ type: 'application/vnd+octets' });
      });

      it('should parse for custom type', function (done) {
        const test = request(this.server).post('/');
        test.set('Content-Type', 'application/vnd+octets');
        test.write(Buffer.from('000102', 'hex') as any);
        test.expect(200, 'buf:000102', done);
      });

      it('should ignore standard type', function (done) {
        const test = request(this.server).post('/');
        test.set('Content-Type', 'application/octet-stream');
        test.write(Buffer.from('000102', 'hex') as any);
        test.expect(200, '{}', done);
      });
    });

    describe('when ["application/octet-stream", "application/vnd+octets"]', function () {
      before(function () {
        this.server = createServer({
          type: ['application/octet-stream', 'application/vnd+octets'],
        });
      });

      it('should parse "application/octet-stream"', function (done) {
        const test = request(this.server).post('/');
        test.set('Content-Type', 'application/octet-stream');
        test.write(Buffer.from('000102', 'hex') as any);
        test.expect(200, 'buf:000102', done);
      });

      it('should parse "application/vnd+octets"', function (done) {
        const test = request(this.server).post('/');
        test.set('Content-Type', 'application/vnd+octets');
        test.write(Buffer.from('000102', 'hex') as any);
        test.expect(200, 'buf:000102', done);
      });

      it('should ignore "application/x-foo"', function (done) {
        const test = request(this.server).post('/');
        test.set('Content-Type', 'application/x-foo');
        test.write(Buffer.from('000102', 'hex') as any);
        test.expect(200, '{}', done);
      });
    });

    describe('when a function', function () {
      it('should parse when truthy value returned', function (done) {
        const server = createServer({ type: accept });

        function accept(req: any) {
          return req.headers['content-type'] === 'application/vnd.octet';
        }

        const test = request(server).post('/');
        test.set('Content-Type', 'application/vnd.octet');
        test.write(Buffer.from('000102', 'hex') as any);
        test.expect(200, 'buf:000102', done);
      });

      it('should work without content-type', function (done) {
        const server = createServer({ type: accept });

        function accept(req: any) {
          return true;
        }

        const test = request(server).post('/');
        test.write(Buffer.from('000102', 'hex') as any);
        test.expect(200, 'buf:000102', done);
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
          if (buf[0] === 0x00) throw new Error('no leading null');
        },
      });

      const test = request(server).post('/');
      test.set('Content-Type', 'application/octet-stream');
      test.write(Buffer.from('000102', 'hex') as any);
      test.expect(403, '[entity.verify.failed] no leading null', done);
    });

    it('should allow custom codes', function (done) {
      const server = createServer({
        verify: function (req, buf) {
          if (buf[0] !== 0x00) return;
          const err: any = new Error('no leading null');
          err.status = 400;
          throw err;
        },
      });

      const test = request(server).post('/');
      test.set('Content-Type', 'application/octet-stream');
      test.write(Buffer.from('000102', 'hex') as any);
      test.expect(400, '[entity.verify.failed] no leading null', done);
    });

    it('should allow pass-through', function (done) {
      const server = createServer({
        verify: function (req, buf) {
          if (buf[0] === 0x00) throw new Error('no leading null');
        },
      });

      const test = request(server).post('/');
      test.set('Content-Type', 'application/octet-stream');
      test.write(Buffer.from('0102', 'hex') as any);
      test.expect(200, 'buf:0102', done);
    });
  });

  describeAsyncHooks('async local storage', function () {
    before(function () {
      const rawParser = getRawParser();
      const store = { foo: 'bar' };

      this.server = createServer(function (req: any, headers: any, res: any) {
        const asyncLocalStorage = new asyncHooks.AsyncLocalStorage();

        return asyncLocalStorage.run(store, async function () {
          const local: any = asyncLocalStorage.getStore();
          if (local) {
            res.setHeader('x-store-foo', String(local.foo));
          }
          return rawParser(req, headers);
        });
      });
    });

    it('should presist store', function (done) {
      request(this.server)
        .post('/')
        .set('Content-Type', 'application/octet-stream')
        .send('the user is tobi')
        .expect(200)
        .expect('x-store-foo', 'bar')
        .expect('buf:746865207573657220697320746f6269')
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
      test.set('Content-Type', 'application/octet-stream');
      test.write(Buffer.from('1f8b080000000000000bcb4bcc4db57db16e170099a4bad608000000', 'hex') as any);
      test.expect(200);
      test.expect('x-store-foo', 'bar');
      test.expect('buf:6e616d653de8aeba');
      test.end(done);
    });

    it('should presist store when inflate error', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'application/octet-stream');
      test.write(Buffer.from('1f8b080000000000000bcb4bcc4db57db16e170099a4bad6080000', 'hex') as any);
      test.expect(400);
      test.expect('x-store-foo', 'bar');
      test.end(done);
    });

    it('should presist store when limit exceeded', function (done) {
      request(this.server)
        .post('/')
        .set('Content-Type', 'application/octet-stream')
        .send('the user is ' + Buffer.alloc(1024 * 100, '.').toString())
        .expect(413)
        .expect('x-store-foo', 'bar')
        .end(done);
    });
  });

  describe('charset', function () {
    before(function () {
      this.server = createServer();
    });

    it('should ignore charset', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Type', 'application/octet-stream; charset=utf-8');
      test.write(Buffer.from('6e616d6520697320e8aeba', 'hex') as any);
      test.expect(200, 'buf:6e616d6520697320e8aeba', done);
    });
  });

  describe('encoding', function () {
    before(function () {
      this.server = createServer({ limit: '10kb' });
    });

    it('should parse without encoding', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Type', 'application/octet-stream');
      test.write(Buffer.from('6e616d653de8aeba', 'hex') as any);
      test.expect(200, 'buf:6e616d653de8aeba', done);
    });

    it('should support identity encoding', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Encoding', 'identity');
      test.set('Content-Type', 'application/octet-stream');
      test.write(Buffer.from('6e616d653de8aeba', 'hex') as any);
      test.expect(200, 'buf:6e616d653de8aeba', done);
    });

    it('should support gzip encoding', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'application/octet-stream');
      test.write(Buffer.from('1f8b080000000000000bcb4bcc4db57db16e170099a4bad608000000', 'hex') as any);
      test.expect(200, 'buf:6e616d653de8aeba', done);
    });

    it('should support deflate encoding', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Encoding', 'deflate');
      test.set('Content-Type', 'application/octet-stream');
      test.write(Buffer.from('789ccb4bcc4db57db16e17001068042f', 'hex') as any);
      test.expect(200, 'buf:6e616d653de8aeba', done);
    });

    it('should be case-insensitive', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Encoding', 'GZIP');
      test.set('Content-Type', 'application/octet-stream');
      test.write(Buffer.from('1f8b080000000000000bcb4bcc4db57db16e170099a4bad608000000', 'hex') as any);
      test.expect(200, 'buf:6e616d653de8aeba', done);
    });

    it('should 415 on unknown encoding', function (done) {
      const test = request(this.server).post('/');
      test.set('Content-Encoding', 'nulls');
      test.set('Content-Type', 'application/octet-stream');
      test.write(Buffer.from('000000000000', 'hex') as any);
      test.expect(415, '[encoding.unsupported] unsupported content encoding "nulls"', done);
    });
  });
});

function createServer(opts?: RawOptions | Function) {
  const _bodyParser: any = typeof opts != 'function' ? getRawParser(opts) : opts;

  return http.createServer(async function (req, res) {
    try {
      const body = await _bodyParser(req, req.headers, res);
      if (Buffer.isBuffer(body)) {
        res.end('buf:' + body.toString('hex'));
        return;
      }

      res.end(JSON.stringify(body));
    } catch (err: any) {
      res.statusCode = err.status || 500;
      res.end('[' + err.type + '] ' + err.message);
      return;
    }
  });
}
