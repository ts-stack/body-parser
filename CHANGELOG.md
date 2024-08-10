<a name="1.2.0"></a>
# [1.2.0](https://github.com/ts-stack/body-parser/releases/tag/1.2.0) (2024-08-10)

### Breaking changes

- The location of the typed parameter has been changed. The parameter is now specified for a specific parser rather than for a parser factory:

**Now**:

```ts
import { getJsonParser } from '@ts-stack/body-parser';
import { InterfaceOfBody } from './types';

const jsonParser = getJsonParser();
const body = await jsonParser<InterfaceOfBody>();
```

**Before**:

```ts
import { getJsonParser } from '@ts-stack/body-parser';
import { InterfaceOfBody } from './types';

const jsonParser = getJsonParser<InterfaceOfBody>();
const body = await jsonParser();
```

<a name="1.1.1"></a>
## [1.1.1](https://github.com/ts-stack/body-parser/releases/tag/1.1.1) (2024-07-28)

### Bugs fix

- [Fixed `onFinished` function](https://github.com/ts-stack/body-parser/commit/df63009e76bba).

<a name="1.1.0"></a>
## [1.1.0](https://github.com/ts-stack/body-parser/releases/tag/1.1.0) (2024-07-21)

### Features

- Added `BodyParserGroup` helper. It intended for cases when you do not know which parser should work for a particular route. To initialize it, you can first pass parser options to its constructor, and then you can use the `parse` method:

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
