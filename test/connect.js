var connect = require('connect'),
	assets = require('requirejs-assets');

var app = connect()
	.use(assets())
  .use(function(req, res){
    res.end('hello world\n');
  })
	.listen(3000);
