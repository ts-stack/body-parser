<a name="1.1.0"></a>
# [1.1.0](https://github.com/ditsmod/ditsmod/releases/tag/1.1.0) (2024-07-21)

### Features

- Added `BodyParserGroup` helper. Now you can use in this way:

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
