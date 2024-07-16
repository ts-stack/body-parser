import { IncomingHttpHeaders } from 'http';
import { typeOfRequest, hasBody, is, mimeMatch, normalize } from './type-is.js';

describe('typeOfRequest(req, types)', function () {
  it('should ignore params', function () {
    const req = createHeaders('text/html; charset=utf-8');
    expect(typeOfRequest(req, ['text/*'])).toBe('text/html');
  });

  it('should ignore params LWS', function () {
    const req = createHeaders('text/html ; charset=utf-8');
    expect(typeOfRequest(req, ['text/*'])).toBe('text/html');
  });

  it('should ignore casing', function () {
    const req = createHeaders('text/HTML');
    expect(typeOfRequest(req, ['text/*'])).toBe('text/html');
  });

  it('should fail invalid type', function () {
    const req = createHeaders('text/html**');
    expect(typeOfRequest(req, ['text/*'])).toBe(false);
  });

  it('should not match invalid type', function () {
    const req = createHeaders('text/html');
    expect(typeOfRequest(req, ['text/html/'])).toBe(false);
    expect(typeOfRequest(req, [undefined, null, true, function () {}] as any)).toBe(false);
  });

  describe('when no body is given', function () {
    it('should return null', function () {
      expect(typeOfRequest({})).toBe(null);
      expect(typeOfRequest({}, ['image/*'])).toBe(null);
      expect(typeOfRequest({}, 'image/*', 'text/*')).toBe(null);
    });
  });

  describe('when no content type is given', function () {
    it('should return false', function () {
      const req = createHeaders();
      expect(typeOfRequest(req)).toBe(false);
      expect(typeOfRequest(req, ['image/*'])).toBe(false);
      expect(typeOfRequest(req, ['text/*', 'image/*'])).toBe(false);
    });
  });

  describe('give no types', function () {
    it('should return the mime type', function () {
      const req = createHeaders('image/png');
      expect(typeOfRequest(req)).toBe('image/png');
    });
  });

  describe('given one type', function () {
    it('should return the type or false', function () {
      const req = createHeaders('image/png');

      expect(typeOfRequest(req, ['png'])).toBe('png');
      expect(typeOfRequest(req, ['.png'])).toBe('.png');
      expect(typeOfRequest(req, ['image/png'])).toBe('image/png');
      expect(typeOfRequest(req, ['image/*'])).toBe('image/png');
      expect(typeOfRequest(req, ['*/png'])).toBe('image/png');

      expect(typeOfRequest(req, ['jpeg'])).toBe(false);
      expect(typeOfRequest(req, ['.jpeg'])).toBe(false);
      expect(typeOfRequest(req, ['image/jpeg'])).toBe(false);
      expect(typeOfRequest(req, ['text/*'])).toBe(false);
      expect(typeOfRequest(req, ['*/jpeg'])).toBe(false);

      expect(typeOfRequest(req, ['bogus'])).toBe(false);
      expect(typeOfRequest(req, ['something/bogus*'])).toBe(false);
    });
  });

  describe('given multiple types', function () {
    it('should return the first match or false', function () {
      const req = createHeaders('image/png');

      expect(typeOfRequest(req, ['png'])).toBe('png');
      expect(typeOfRequest(req, '.png')).toBe('.png');
      expect(typeOfRequest(req, ['text/*', 'image/*'])).toBe('image/png');
      expect(typeOfRequest(req, ['image/*', 'text/*'])).toBe('image/png');
      expect(typeOfRequest(req, ['image/*', 'image/png'])).toBe('image/png');
      expect(typeOfRequest(req, 'image/png', 'image/*')).toBe('image/png');

      expect(typeOfRequest(req, ['jpeg'])).toBe(false);
      expect(typeOfRequest(req, ['.jpeg'])).toBe(false);
      expect(typeOfRequest(req, ['text/*', 'application/*'])).toBe(false);
      expect(typeOfRequest(req, ['text/html', 'text/plain', 'application/json'])).toBe(false);
    });
  });

  describe('given +suffix', function () {
    it('should match suffix types', function () {
      const req = createHeaders('application/vnd+json');

      expect(typeOfRequest(req, '+json')).toBe('application/vnd+json');
      expect(typeOfRequest(req, 'application/vnd+json')).toBe('application/vnd+json');
      expect(typeOfRequest(req, 'application/*+json')).toBe('application/vnd+json');
      expect(typeOfRequest(req, '*/vnd+json')).toBe('application/vnd+json');
      expect(typeOfRequest(req, 'application/json')).toBe(false);
      expect(typeOfRequest(req, 'text/*+json')).toBe(false);
    });
  });

  describe('given "*/*"', function () {
    it('should match any content-type', function () {
      expect(typeOfRequest(createHeaders('text/html'), '*/*')).toBe('text/html');
      expect(typeOfRequest(createHeaders('text/xml'), '*/*')).toBe('text/xml');
      expect(typeOfRequest(createHeaders('application/json'), '*/*')).toBe('application/json');
      expect(typeOfRequest(createHeaders('application/vnd+json'), '*/*')).toBe('application/vnd+json');
    });

    it('should not match invalid content-type', function () {
      expect(typeOfRequest(createHeaders('bogus'), '*/*')).toBe(false);
    });

    it('should not match body-less request', function () {
      const headers = { 'content-type': 'text/html' } as IncomingHttpHeaders ;
      expect(typeOfRequest(headers, '*/*')).toBe(null);
    });
  });

  describe('when Content-Type: application/x-www-form-urlencoded', function () {
    it('should match "urlencoded"', function () {
      const req = createHeaders('application/x-www-form-urlencoded');

      expect(typeOfRequest(req, ['urlencoded'])).toBe('urlencoded');
      expect(typeOfRequest(req, ['json', 'urlencoded'])).toBe('urlencoded');
      expect(typeOfRequest(req, ['urlencoded', 'json'])).toBe('urlencoded');
    });
  });

  describe('when Content-Type: multipart/form-data', function () {
    it('should match "multipart/*"', function () {
      const req = createHeaders('multipart/form-data');

      expect(typeOfRequest(req, ['multipart/*'])).toBe('multipart/form-data');
    });

    it('should match "multipart"', function () {
      const req = createHeaders('multipart/form-data');

      expect(typeOfRequest(req, ['multipart'])).toBe('multipart');
    });
  });
});

describe('hasBody(req)', function () {
  describe('content-length', function () {
    it('should indicate body', function () {
      const headers = { 'content-length': '1' } as IncomingHttpHeaders;
      expect(hasBody(headers)).toBe(true);
    });

    it('should be true when 0', function () {
      const headers = { 'content-length': '0' } as IncomingHttpHeaders;
      expect(hasBody(headers)).toBe(true);
    });

    it('should be false when bogus', function () {
      const headers = { 'content-length': 'bogus' } as IncomingHttpHeaders;
      expect(hasBody(headers)).toBe(false);
    });
  });

  describe('transfer-encoding', function () {
    it('should indicate body', function () {
      const headers = { 'transfer-encoding': 'chunked' } as IncomingHttpHeaders;
      expect(hasBody(headers)).toBe(true);
    });
  });
});

describe('is(mediaType, types)', function () {
  it('should ignore params', function () {
    expect(is('text/html; charset=utf-8', ['text/*'])).toBe('text/html');
  });

  it('should ignore casing', function () {
    expect(is('text/HTML', ['text/*'])).toBe('text/html');
  });

  it('should fail invalid type', function () {
    expect(is('text/html**', ['text/*'])).toBe(false);
  });

  it('should not match invalid type', function () {
    const req = createHeaders('text/html');
    expect(typeOfRequest(req, ['text/html/'])).toBe(false);
    expect(typeOfRequest(req, [undefined, null, true, function () {}] as any)).toBe(false);
  });

  it('should not match invalid type', function () {
    expect(is('text/html', ['text/html/'])).toBe(false);
    expect(is('text/html', [undefined, null, true, function () {}] as any)).toBe(false);
  });

  describe('when no media type is given', function () {
    it('should return false', function () {
      expect(is()).toBe(false);
      expect(is('', ['application/json'])).toBe(false);
      expect(is(null, ['image/*'])).toBe(false);
      expect(is(undefined, ['text/*', 'image/*'])).toBe(false);
    });
  });

  describe('given no types', function () {
    it('should return the mime type', function () {
      expect(is('image/png')).toBe('image/png');
    });
  });

  describe('given one type', function () {
    it('should return the type or false', function () {
      expect(is('image/png', ['png'])).toBe('png');
      expect(is('image/png', ['.png'])).toBe('.png');
      expect(is('image/png', ['image/png'])).toBe('image/png');
      expect(is('image/png', ['image/*'])).toBe('image/png');
      expect(is('image/png', ['*/png'])).toBe('image/png');

      expect(is('image/png', ['jpeg'])).toBe(false);
      expect(is('image/png', ['.jpeg'])).toBe(false);
      expect(is('image/png', ['image/jpeg'])).toBe(false);
      expect(is('image/png', ['text/*'])).toBe(false);
      expect(is('image/png', ['*/jpeg'])).toBe(false);

      expect(is('image/png', ['bogus'])).toBe(false);
      expect(is('image/png', ['something/bogus*'])).toBe(false);
    });
  });

  describe('given multiple types', function () {
    it('should return the first match or false', function () {
      expect(is('image/png', ['png'])).toBe('png');
      expect(is('image/png', '.png')).toBe('.png');
      expect(is('image/png', ['text/*', 'image/*'])).toBe('image/png');
      expect(is('image/png', ['image/*', 'text/*'])).toBe('image/png');
      expect(is('image/png', ['image/*', 'image/png'])).toBe('image/png');
      expect(is('image/png', 'image/png', 'image/*')).toBe('image/png');

      expect(is('image/png', ['jpeg'])).toBe(false);
      expect(is('image/png', ['.jpeg'])).toBe(false);
      expect(is('image/png', ['text/*', 'application/*'])).toBe(false);
      expect(is('image/png', ['text/html', 'text/plain', 'application/json'])).toBe(false);
    });
  });

  describe('given +suffix', function () {
    it('should match suffix types', function () {
      expect(is('application/vnd+json', '+json')).toBe('application/vnd+json');
      expect(is('application/vnd+json', 'application/vnd+json')).toBe('application/vnd+json');
      expect(is('application/vnd+json', 'application/*+json')).toBe('application/vnd+json');
      expect(is('application/vnd+json', '*/vnd+json')).toBe('application/vnd+json');
      expect(is('application/vnd+json', 'application/json')).toBe(false);
      expect(is('application/vnd+json', 'text/*+json')).toBe(false);
    });
  });

  describe('given "*/*"', function () {
    it('should match any media type', function () {
      expect(is('text/html', '*/*')).toBe('text/html');
      expect(is('text/xml', '*/*')).toBe('text/xml');
      expect(is('application/json', '*/*')).toBe('application/json');
      expect(is('application/vnd+json', '*/*')).toBe('application/vnd+json');
    });

    it('should not match invalid media type', function () {
      expect(is('bogus', '*/*')).toBe(false);
    });
  });

  describe('when media type is application/x-www-form-urlencoded', function () {
    it('should match "urlencoded"', function () {
      expect(is('application/x-www-form-urlencoded', ['urlencoded'])).toBe('urlencoded');
      expect(is('application/x-www-form-urlencoded', ['json', 'urlencoded'])).toBe('urlencoded');
      expect(is('application/x-www-form-urlencoded', ['urlencoded', 'json'])).toBe('urlencoded');
    });
  });

  describe('when media type is multipart/form-data', function () {
    it('should match "multipart/*"', function () {
      expect(is('multipart/form-data', ['multipart/*'])).toBe('multipart/form-data');
    });

    it('should match "multipart"', function () {
      expect(is('multipart/form-data', ['multipart'])).toBe('multipart');
    });
  });
});

describe('match(expected, actual)', function () {
  it('should return false when expected is false', function () {
    expect(mimeMatch(false, 'text/html')).toBe(false);
  });

  it('should perform exact matching', function () {
    expect(mimeMatch('text/html', 'text/html')).toBe(true);
    expect(mimeMatch('text/html', 'text/plain')).toBe(false);
    expect(mimeMatch('text/html', 'text/xml')).toBe(false);
    expect(mimeMatch('text/html', 'application/html')).toBe(false);
    expect(mimeMatch('text/html', 'text/html+xml')).toBe(false);
  });

  it('should perform type wildcard matching', function () {
    expect(mimeMatch('*/html', 'text/html')).toBe(true);
    expect(mimeMatch('*/html', 'application/html')).toBe(true);
    expect(mimeMatch('*/html', 'text/xml')).toBe(false);
    expect(mimeMatch('*/html', 'text/html+xml')).toBe(false);
  });

  it('should perform subtype wildcard matching', function () {
    expect(mimeMatch('text/*', 'text/html')).toBe(true);
    expect(mimeMatch('text/*', 'text/xml')).toBe(true);
    expect(mimeMatch('text/*', 'text/html+xml')).toBe(true);
    expect(mimeMatch('text/*', 'application/xml')).toBe(false);
  });

  it('should perform full wildcard matching', function () {
    expect(mimeMatch('*/*', 'text/html')).toBe(true);
    expect(mimeMatch('*/*', 'text/html+xml')).toBe(true);
    expect(mimeMatch('*/*+xml', 'text/html+xml')).toBe(true);
  });

  it('should perform full wildcard matching with specific suffix', function () {
    expect(mimeMatch('*/*+xml', 'text/html+xml')).toBe(true);
    expect(mimeMatch('*/*+xml', 'text/html')).toBe(false);
  });
});

describe('normalize(type)', function () {
  it('should return false for non-strings', function () {
    expect(normalize({} as any)).toBe(false);
    expect(normalize([] as any)).toBe(false);
    expect(normalize(42 as any)).toBe(false);
    expect(normalize(null as any)).toBe(false);
    expect(normalize(function () {} as any)).toBe(false);
  });

  it('should return media type for extension', function () {
    expect(normalize('json')).toBe('application/json');
  });

  it('should return expanded wildcard for suffix', function () {
    expect(normalize('+json')).toBe('*/*+json');
  });

  it('should pass through media type', function () {
    expect(normalize('application/json')).toBe('application/json');
  });

  it('should pass through wildcard', function () {
    expect(normalize('*/*')).toBe('*/*');
    expect(normalize('image/*')).toBe('image/*');
  });

  it('should return false for unmapped extension', function () {
    expect(normalize('unknown')).toBe(false);
  });

  it('should expand special "urlencoded"', function () {
    expect(normalize('urlencoded')).toBe('application/x-www-form-urlencoded');
  });

  it('should expand special "multipart"', function () {
    expect(normalize('multipart')).toBe('multipart/*');
  });
});

function createHeaders(type?: string) {
  return {
    'content-type': type || undefined,
    'transfer-encoding': 'chunked',
  } as IncomingHttpHeaders;
}
