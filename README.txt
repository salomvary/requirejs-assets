Integrated RequireJS build tool for Connect/Express/Node.js.

This code is in a very early experimental stage, better not use it.

What it does/will do?
- Renames CSS/JavaScript/image files to use the contents' MD5 hash.
- Updates CSS url() references to images/other CSS files.
- Optimizes CSS/JavaScript files with RequireJS r.js optimizer.
- Provides static middleware for Express to serve files with "cache forever" headers.
- Provides Express view helpers to link CSS/JavaScript to HTML.

TODO
- See code TODOs.
- Lots of tests.
- Separate build tool and Express/Connect helpers.
- Seamless build for Express.

Influenced by/uses code from:
- https://github.com/TrevorBurnham/connect-assets
- https://github.com/jrburke/r.js
