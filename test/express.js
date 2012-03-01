var express = require('express'),
	assets = require('../assets.js'),
	app = express.createServer();

assets(app);

app.get('/', function(req, res) {
	res.render('test.jade', {layout:false});
});

app.listen(3000);
