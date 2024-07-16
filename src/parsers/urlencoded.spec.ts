import assert from 'node:assert';
import asyncHooks from 'node:async_hooks';
import http, { Server } from 'node:http';
import { Buffer } from 'safe-buffer';
import request from 'supertest';

import { getUrlencodedParser } from './urlencoded.js';
import type { UrlencodedOptions } from '../types.js';

describe('urlencoded()', function () {
  let server: Server;
  beforeAll(function () {
    server = createServer({ extended: true });
  });

  it('should parse x-www-form-urlencoded', function (done) {
    request(server)
      .post('/')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('user=tobi')
      .expect(200, '{"user":"tobi"}', done);
  });

  it('should 400 when invalid content-length', function (done) {
    const urlencodedParser = getUrlencodedParser();
    const server = createServer(function (req: any, headers: any) {
      headers['content-length'] = '20'; // bad length
      return urlencodedParser(req, headers);
    });

    request(server)
      .post('/')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('str=')
      .expect(400, /content length/, done);
  });

  it('should handle Content-Length: 0', function (done) {
    request(server)
      .post('/')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('Content-Length', '0')
      .send('')
      .expect(200, '{}', done);
  });

  it('should handle empty message-body', function (done) {
    request(createServer({ limit: '1kb' }))
      .post('/')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .set('Transfer-Encoding', 'chunked')
      .send('')
      .expect(200, '{}', done);
  });

  it('should 500 if stream not readable', function (done) {
    const urlencodedParser = getUrlencodedParser();
    const server = createServer(function (req: any, headers: any) {
      return new Promise((resolve, reject) => {
        req.on('end', async function () {
          try {
            const body = await urlencodedParser(req, headers);
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
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('user=tobi')
      .expect(500, '[stream.not.readable] stream is not readable', done);
  });

  it('should parse extended syntax', function (done) {
    request(server)
      .post('/')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('user[name][first]=Tobi')
      .expect(200, '{"user":{"name":{"first":"Tobi"}}}', done);
  });

  describe('with extended option', function () {
    describe('when false', function () {
      beforeAll(function () {
        server = createServer({ extended: false });
      });

      it('should not parse extended syntax', function (done) {
        request(server)
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('user[name][first]=Tobi')
          .expect(200, '{"user[name][first]":"Tobi"}', done);
      });

      it('should parse multiple key instances', function (done) {
        request(server)
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('user=Tobi&user=Loki')
          .expect(200, '{"user":["Tobi","Loki"]}', done);
      });
    });

    describe('when true', function () {
      beforeAll(function () {
        server = createServer({ extended: true });
      });

      it('should parse multiple key instances', function (done) {
        request(server)
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('user=Tobi&user=Loki')
          .expect(200, '{"user":["Tobi","Loki"]}', done);
      });

      it('should parse extended syntax', function (done) {
        request(server)
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('user[name][first]=Tobi')
          .expect(200, '{"user":{"name":{"first":"Tobi"}}}', done);
      });

      it('should parse parameters with dots', function (done) {
        request(server)
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('user.name=Tobi')
          .expect(200, '{"user.name":"Tobi"}', done);
      });

      it('should parse fully-encoded extended syntax', function (done) {
        request(server)
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('user%5Bname%5D%5Bfirst%5D=Tobi')
          .expect(200, '{"user":{"name":{"first":"Tobi"}}}', done);
      });

      it('should parse array index notation', function (done) {
        request(server)
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('foo[0]=bar&foo[1]=baz')
          .expect(200, '{"foo":["bar","baz"]}', done);
      });

      it('should parse array index notation with large array', function (done) {
        let str = 'f[0]=0';

        for (let i = 1; i < 500; i++) {
          str += '&f[' + i + ']=' + i.toString(16);
        }

        request(server)
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send(str)
          .expect(function (res) {
            const obj = JSON.parse(res.text);
            assert.strictEqual(Object.keys(obj).length, 1);
            assert.strictEqual(Array.isArray(obj.f), true);
            assert.strictEqual(obj.f.length, 500);
          })
          .expect(200, done);
      });

      it('should parse array of objects syntax', function (done) {
        request(server)
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('foo[0][bar]=baz&foo[0][fizz]=buzz&foo[]=done!')
          .expect(200, '{"foo":[{"bar":"baz","fizz":"buzz"},"done!"]}', done);
      });

      it('should parse deep object', function (done) {
        let str = 'foo';

        for (let i = 0; i < 500; i++) {
          str += '[p]';
        }

        str += '=bar';

        request(server)
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send(str)
          .expect(function (res) {
            const obj = JSON.parse(res.text);
            assert.strictEqual(Object.keys(obj).length, 1);
            assert.strictEqual(typeof obj.foo, 'object');

            let depth = 0;
            let ref = obj.foo;
            while ((ref = ref.p)) {
              depth++;
            }
            assert.strictEqual(depth, 500);
          })
          .expect(200, done);
      });
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
        test.set('Content-Type', 'application/x-www-form-urlencoded');
        test.write(Buffer.from('1f8b080000000000000bcb4bcc4db57db16e170099a4bad608000000', 'hex') as any);
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
        test.set('Content-Type', 'application/x-www-form-urlencoded');
        test.write(Buffer.from('1f8b080000000000000bcb4bcc4db57db16e170099a4bad608000000', 'hex') as any);
        test.expect(200, '{"name":"论"}', done);
      });
    });
  });

  describe('with limit option', function () {
    it('should 413 when over limit with Content-Length', function (done) {
      const buf = Buffer.alloc(1024, '.');
      request(createServer({ limit: '1kb' }))
        .post('/')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .set('Content-Length', '1028')
        .send('str=' + buf.toString())
        .expect(413, done);
    });

    it('should 413 when over limit with chunked encoding', function (done) {
      const buf = Buffer.alloc(1024, '.');
      const server = createServer({ limit: '1kb' });
      const test = request(server).post('/');
      test.set('Content-Type', 'application/x-www-form-urlencoded');
      test.set('Transfer-Encoding', 'chunked');
      test.write('str=');
      test.write(buf.toString());
      test.expect(413, done);
    });

    it('should 413 when inflated body over limit', function (done) {
      const server = createServer({ limit: '1kb' });
      const test = request(server).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'application/x-www-form-urlencoded');
      test.write(Buffer.from('1f8b080000000000000a2b2e29b2d51b05a360148c580000a0351f9204040000', 'hex') as any);
      test.expect(413, done);
    });

    it('should accept number of bytes', function (done) {
      const buf = Buffer.alloc(1024, '.');
      request(createServer({ limit: 1024 }))
        .post('/')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('str=' + buf.toString())
        .expect(413, done);
    });

    it('should not change when options altered', function (done) {
      const buf = Buffer.alloc(1024, '.');
      const options = { limit: '1kb' };
      const server = createServer(options);

      options.limit = '100kb';

      request(server)
        .post('/')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('str=' + buf.toString())
        .expect(413, done);
    });

    it('should not hang response', function (done) {
      const buf: any = Buffer.alloc(10240, '.');
      const server = createServer({ limit: '8kb' });
      const test = request(server).post('/');
      test.set('Content-Type', 'application/x-www-form-urlencoded');
      test.write(buf);
      test.write(buf);
      test.write(buf);
      test.expect(413, done);
    });

    it('should not error when inflating', function (done) {
      const server = createServer({ limit: '1kb' });
      const test = request(server).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'application/x-www-form-urlencoded');
      test.write(Buffer.from('1f8b080000000000000a2b2e29b2d51b05a360148c580000a0351f92040400', 'hex') as any);
      test.expect(413, done);
    });
  });

  describe('with parameterLimit option', function () {
    describe('with extended: false', function () {
      it('should reject 0', function () {
        assert.throws(
          createServer.bind(null, { extended: false, parameterLimit: 0 }),
          /TypeError: option parameterLimit must be a positive number/,
        );
      });

      it('should reject string', function () {
        assert.throws(
          createServer.bind(null, { extended: false, parameterLimit: 'beep' } as any),
          /TypeError: option parameterLimit must be a positive number/,
        );
      });

      it('should 413 if over limit', function (done) {
        request(createServer({ extended: false, parameterLimit: 10 }))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send(createManyParams(11))
          .expect(413, '[parameters.too.many] too many parameters', done);
      });

      it('should work when at the limit', function (done) {
        request(createServer({ extended: false, parameterLimit: 10 }))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send(createManyParams(10))
          .expect(expectKeyCount(10))
          .expect(200, done);
      });

      it('should work if number is floating point', function (done) {
        request(createServer({ extended: false, parameterLimit: 10.1 }))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send(createManyParams(11))
          .expect(413, /too many parameters/, done);
      });

      it('should work with large limit', function (done) {
        request(createServer({ extended: false, parameterLimit: 5000 }))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send(createManyParams(5000))
          .expect(expectKeyCount(5000))
          .expect(200, done);
      });

      it('should work with Infinity limit', function (done) {
        request(createServer({ extended: false, parameterLimit: Infinity }))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send(createManyParams(10000))
          .expect(expectKeyCount(10000))
          .expect(200, done);
      });
    });

    describe('with extended: true', function () {
      it('should reject 0', function () {
        assert.throws(
          createServer.bind(null, { extended: true, parameterLimit: 0 }),
          /TypeError: option parameterLimit must be a positive number/,
        );
      });

      it('should reject string', function () {
        assert.throws(
          createServer.bind(null, { extended: true, parameterLimit: 'beep' } as any),
          /TypeError: option parameterLimit must be a positive number/,
        );
      });

      it('should 413 if over limit', function (done) {
        request(createServer({ extended: true, parameterLimit: 10 }))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send(createManyParams(11))
          .expect(413, '[parameters.too.many] too many parameters', done);
      });

      it('should work when at the limit', function (done) {
        request(createServer({ extended: true, parameterLimit: 10 }))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send(createManyParams(10))
          .expect(expectKeyCount(10))
          .expect(200, done);
      });

      it('should work if number is floating point', function (done) {
        request(createServer({ extended: true, parameterLimit: 10.1 }))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send(createManyParams(11))
          .expect(413, /too many parameters/, done);
      });

      it('should work with large limit', function (done) {
        request(createServer({ extended: true, parameterLimit: 5000 }))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send(createManyParams(5000))
          .expect(expectKeyCount(5000))
          .expect(200, done);
      });

      it('should work with Infinity limit', function (done) {
        request(createServer({ extended: true, parameterLimit: Infinity }))
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send(createManyParams(10000))
          .expect(expectKeyCount(10000))
          .expect(200, done);
      });
    });
  });

  describe('with type option', function () {
    describe('when "application/vnd.x-www-form-urlencoded"', function () {
      beforeAll(function () {
        server = createServer({ type: 'application/vnd.x-www-form-urlencoded' });
      });

      it('should parse for custom type', function (done) {
        request(server)
          .post('/')
          .set('Content-Type', 'application/vnd.x-www-form-urlencoded')
          .send('user=tobi')
          .expect(200, '{"user":"tobi"}', done);
      });

      it('should ignore standard type', function (done) {
        request(server)
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('user=tobi')
          .expect(200, '{}', done);
      });
    });

    describe('when ["urlencoded", "application/x-pairs"]', function () {
      beforeAll(function () {
        server = createServer({
          type: ['urlencoded', 'application/x-pairs'],
        });
      });

      it('should parse "application/x-www-form-urlencoded"', function (done) {
        request(server)
          .post('/')
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('user=tobi')
          .expect(200, '{"user":"tobi"}', done);
      });

      it('should parse "application/x-pairs"', function (done) {
        request(server)
          .post('/')
          .set('Content-Type', 'application/x-pairs')
          .send('user=tobi')
          .expect(200, '{"user":"tobi"}', done);
      });

      it('should ignore application/x-foo', function (done) {
        request(server)
          .post('/')
          .set('Content-Type', 'application/x-foo')
          .send('user=tobi')
          .expect(200, '{}', done);
      });
    });

    describe('when a function', function () {
      it('should parse when truthy value returned', function (done) {
        const server = createServer({ type: accept });

        function accept(req: any) {
          return req.headers['content-type'] === 'application/vnd.something';
        }

        request(server)
          .post('/')
          .set('Content-Type', 'application/vnd.something')
          .send('user=tobi')
          .expect(200, '{"user":"tobi"}', done);
      });

      it('should work without content-type', function (done) {
        const server = createServer({ type: accept });

        function accept(req: any) {
          return true;
        }

        const test = request(server).post('/');
        test.write('user=tobi');
        test.expect(200, '{"user":"tobi"}', done);
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
    it('should assert value if function', function () {
      assert.throws(createServer.bind(null, { verify: 'lol' } as any), /TypeError: option verify must be function/);
    });

    it('should error from verify', function (done) {
      const server = createServer({
        verify: function (req: any, buf: any) {
          if (buf[0] === 0x20) throw new Error('no leading space');
        },
      });

      request(server)
        .post('/')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(' user=tobi')
        .expect(403, '[entity.verify.failed] no leading space', done);
    });

    it('should allow custom codes', function (done) {
      const server = createServer({
        verify: function (req: any, buf: any) {
          if (buf[0] !== 0x20) return;
          const err: any = new Error('no leading space');
          err.status = 400;
          throw err;
        },
      });

      request(server)
        .post('/')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(' user=tobi')
        .expect(400, '[entity.verify.failed] no leading space', done);
    });

    it('should allow custom type', function (done) {
      const server = createServer({
        verify: function (req: any, buf: any) {
          if (buf[0] !== 0x20) return;
          const err: any = new Error('no leading space');
          err.type = 'foo.bar';
          throw err;
        },
      });

      request(server)
        .post('/')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(' user=tobi')
        .expect(403, '[foo.bar] no leading space', done);
    });

    it('should allow pass-through', function (done) {
      const server = createServer({
        verify: function (req: any, buf: any) {
          if (buf[0] === 0x5b) throw new Error('no arrays');
        },
      });

      request(server)
        .post('/')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('user=tobi')
        .expect(200, '{"user":"tobi"}', done);
    });

    it('should 415 on unknown charset prior to verify', function (done) {
      const server = createServer({
        verify: function (req: any, buf: any) {
          throw new Error('unexpected verify call');
        },
      });

      const test = request(server).post('/');
      test.set('Content-Type', 'application/x-www-form-urlencoded; charset=x-bogus');
      test.write(Buffer.from('00000000', 'hex') as any);
      test.expect(415, '[charset.unsupported] unsupported charset "X-BOGUS"', done);
    });
  });

  describe('async local storage', function () {
    beforeAll(function () {
      const urlencodedParser = getUrlencodedParser();
      const store = { foo: 'bar' };

      server = createServer(function (req: any, headers: any, res: any) {
        const asyncLocalStorage = new asyncHooks.AsyncLocalStorage();

        return asyncLocalStorage.run(store, async function () {
          const local: any = asyncLocalStorage.getStore();
          if (local) {
            res.setHeader('x-store-foo', String(local.foo));
          }
          return urlencodedParser(req, headers);
        });
      });
    });

    it('should presist store', function (done) {
      request(server)
        .post('/')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('user=tobi')
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
      test.set('Content-Type', 'application/x-www-form-urlencoded');
      test.write(Buffer.from('1f8b080000000000000bcb4bcc4db57db16e170099a4bad608000000', 'hex') as any);
      test.expect(200);
      test.expect('x-store-foo', 'bar');
      test.expect('{"name":"论"}');
      test.end(done);
    });

    it('should presist store when inflate error', function (done) {
      const test = request(server).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'application/x-www-form-urlencoded');
      test.write(Buffer.from('1f8b080000000000000bcb4bcc4db57db16e170099a4bad6080000', 'hex') as any);
      test.expect(400);
      test.expect('x-store-foo', 'bar');
      test.end(done);
    });

    it('should presist store when limit exceeded', function (done) {
      request(server)
        .post('/')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('user=' + Buffer.alloc(1024 * 100, '.').toString())
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
      test.set('Content-Type', 'application/x-www-form-urlencoded; charset=utf-8');
      test.write(Buffer.from('6e616d653de8aeba', 'hex') as any);
      test.expect(200, '{"name":"论"}', done);
    });

    it('should parse when content-length != char length', function (done) {
      const test = request(server).post('/');
      test.set('Content-Type', 'application/x-www-form-urlencoded; charset=utf-8');
      test.set('Content-Length', '7');
      test.write(Buffer.from('746573743dc3a5', 'hex') as any);
      test.expect(200, '{"test":"å"}', done);
    });

    it('should default to utf-8', function (done) {
      const test = request(server).post('/');
      test.set('Content-Type', 'application/x-www-form-urlencoded');
      test.write(Buffer.from('6e616d653de8aeba', 'hex') as any);
      test.expect(200, '{"name":"论"}', done);
    });

    it('should fail on unknown charset', function (done) {
      const test = request(server).post('/');
      test.set('Content-Type', 'application/x-www-form-urlencoded; charset=koi8-r');
      test.write(Buffer.from('6e616d653dcec5d4', 'hex') as any);
      test.expect(415, '[charset.unsupported] unsupported charset "KOI8-R"', done);
    });
  });

  describe('encoding', function () {
    beforeAll(function () {
      server = createServer({ limit: '10kb' });
    });

    it('should parse without encoding', function (done) {
      const test = request(server).post('/');
      test.set('Content-Type', 'application/x-www-form-urlencoded');
      test.write(Buffer.from('6e616d653de8aeba', 'hex') as any);
      test.expect(200, '{"name":"论"}', done);
    });

    it('should support identity encoding', function (done) {
      const test = request(server).post('/');
      test.set('Content-Encoding', 'identity');
      test.set('Content-Type', 'application/x-www-form-urlencoded');
      test.write(Buffer.from('6e616d653de8aeba', 'hex') as any);
      test.expect(200, '{"name":"论"}', done);
    });

    it('should support gzip encoding', function (done) {
      const test = request(server).post('/');
      test.set('Content-Encoding', 'gzip');
      test.set('Content-Type', 'application/x-www-form-urlencoded');
      test.write(Buffer.from('1f8b080000000000000bcb4bcc4db57db16e170099a4bad608000000', 'hex') as any);
      test.expect(200, '{"name":"论"}', done);
    });

    it('should support deflate encoding', function (done) {
      const test = request(server).post('/');
      test.set('Content-Encoding', 'deflate');
      test.set('Content-Type', 'application/x-www-form-urlencoded');
      test.write(Buffer.from('789ccb4bcc4db57db16e17001068042f', 'hex') as any);
      test.expect(200, '{"name":"论"}', done);
    });

    it('should be case-insensitive', function (done) {
      const test = request(server).post('/');
      test.set('Content-Encoding', 'GZIP');
      test.set('Content-Type', 'application/x-www-form-urlencoded');
      test.write(Buffer.from('1f8b080000000000000bcb4bcc4db57db16e170099a4bad608000000', 'hex') as any);
      test.expect(200, '{"name":"论"}', done);
    });

    it('should 415 on unknown encoding', function (done) {
      const test = request(server).post('/');
      test.set('Content-Encoding', 'nulls');
      test.set('Content-Type', 'application/x-www-form-urlencoded');
      test.write(Buffer.from('000000000000', 'hex') as any);
      test.expect(415, '[encoding.unsupported] unsupported content encoding "nulls"', done);
    });
  });
});

function createManyParams(count: number) {
  let str = '';

  if (count === 0) {
    return str;
  }

  str += '0=0';

  for (let i = 1; i < count; i++) {
    const n = i.toString(36);
    str += '&' + n + '=' + n;
  }

  return str;
}

function createServer(opts?: UrlencodedOptions | Function) {
  const _bodyParser: any = typeof opts != 'function' ? getUrlencodedParser(opts) : opts;

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

function expectKeyCount(count: number) {
  return function (res: any) {
    assert.strictEqual(Object.keys(JSON.parse(res.text)).length, count);
  };
}
