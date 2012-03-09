/*jshint es5:true */
var Assets = require('../assets.js'),
	assets = require('../helpers.js'),
	path = require('path'),
	_ = require('underscore'),
	requirejs = require('requirejs'),
	rimraf = require('rimraf'),
	sandbox = require('nodeunit').utils.sandbox,
	app = require('./express.js'),
	request = require('request'),
	file;

requirejs.tools.useLib(function(requirejs) {
		file = requirejs('env!env/file');
});

var sandboxed = sandbox('../assets.js', {
	exports: {}, 
	module: {}, 
	require: require,
	process: {env: {}},
	console: console
});

var config = {
	modules: [
		{
			name: 'alpha'
		}
	],
	paths: {
		mappedSub: 'sub/mapped'
	}
};

var configWithDefaults = new Assets(config).config;

var outputFiles = [ 'assets-optimized/build.txt',
  'assets-optimized/config-f0c50f456ac3c9b3a8e5b8f7e7e04646.js',
  'assets-optimized/css/alpha-020052158f873a8a7b47363a9fdff855.css',
  'assets-optimized/css/beta-9e465e2949a59e104e58ad1ed77b76bb.css',
  'assets-optimized/css/sub/gamma-810c5d7bf65fa7401e5b2e056870e8af.css',
  'assets-optimized/img/alpha-74794563ab6750654ee32dedc45bebab.jpg',
  'assets-optimized/img/beta-ff738f69127edc98d4389aa421517cbe.jpg',
  'assets-optimized/img/sub/gamma-2b7ef65dcb9607840ca2ea9e3d52b49b.jpg',
  'assets-optimized/js/alpha-9f1a9996be0155577843d216bbfc166a.js',
  'assets-optimized/js/beta-ee0c077c6f4cc4ac73643a2cd50b6ef1.js',
  'assets-optimized/js/lazyloaded-0aa2d4f8875e9ceda901e4e7625c9e53.js',
  'assets-optimized/js/require-5d8ec2c595f444741f9ff284639b05f2.js',
  'assets-optimized/js/sub/gamma-6ea3f100d1131020eaf3a89c7a11453d.js',
  'assets-optimized/js/sub/mapped-daa87f2ef831839271203070756f48d3.js' ];

exports.cssUrlRegExp = function(test) {
	test.expect(10);
	_.each({
		'url("foo/bar/baz.js")':'foo/bar/baz.js',
		'url(foo/bar/baz.js)':'foo/bar/baz.js',
		'url(  foo/bar/baz.js	)':'foo/bar/baz.js',
		'url(\'foo/bar/baz.js\')':'foo/bar/baz.js',
		'url (" foo/bar/baz.js ")':' foo/bar/baz.js '
	},function(result, url) {
		var match = sandboxed.cssUrlRegExp.exec(url);
		test.ok(match, url + ' matches');
		test.equal(match[2], result, url);
		sandboxed.cssUrlRegExp.lastIndex = 0;
	});
	test.done();
};

/**
 * compiler tests
 */
exports.compile = {
	tearDown: function(callback) {
		rimraf.sync(configWithDefaults.dir);
		callback();
	}
};

exports.compile['compile and check the copied tree'] = function(test) {
	this.assets = new Assets(config);
	this.assets.compile();

	// output files
	var fileNames = file.getFilteredFileList(this.assets.config.dir,
		{include: null, exclude: null});	

	// is the output the expected?
	test.deepEqual(fileNames, outputFiles);

	// flush requirejs internal cache to make requirejs work below
	// TODO: find a better way to do that
	delete require.cache[require.resolve('requirejs/bin/r.js')];
	requirejs = require('requirejs');

	// can requirejs use the output?
	requirejs.config(_.extend({}, this.assets.config, {
		baseUrl: path.join(this.assets.config.dir, this.assets.config.baseUrl)
	}));

	requirejs(['alpha'], function(alpha) {
		alpha();
		requirejs(['lazyloaded'], function(lazyloaded) {
			lazyloaded();
			test.done();
		});
	});
};

/**
 * static server tests
 */
exports.static = {
	setUp: function(callback) {
		app.listen(3001);
		callback();
	},
	tearDown: function(callback) {
		app.close();
		callback();
	}
};

exports.static['serve static files'] = function(test) {
	request('http://localhost:3001/js/alpha.js', function(err, res, body) {
		test.ifError(err);
		test.equal(res.statusCode, 200);
		test.done();
	});
};
