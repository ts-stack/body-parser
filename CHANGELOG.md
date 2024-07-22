<a name="1.1.0"></a>
# [1.1.0](https://github.com/ts-stack/body-parser/releases/tag/1.1.0) (2024-07-21)

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
