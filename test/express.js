var express = require('express'),
	assets = require('../helpers.js'),
	app = module.exports = express.createServer();

assets(app);

app.get('/', function(req, res) {
	res.render('test.jade', {layout:false});
});

if(! module.parent) {
	app.listen(3000);
}
