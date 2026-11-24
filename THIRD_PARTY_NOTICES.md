# Third-party notices

## Three.js

Copyright © 2010–2021 Three.js Authors.

Three.js is distributed under the MIT License. The bundled minified browser build
is stored locally at `assets/vendor/three.min.js` so the page does not require a
runtime CDN connection.

## Market data

Monthly adjusted-close observations are retrieved from the public Yahoo Finance
chart endpoint by `scripts/build_market_history.py`. The repository stores
derived normalized wealth, monthly-return and drawdown fields rather than raw
vendor history. The data is used for research visualization only.
