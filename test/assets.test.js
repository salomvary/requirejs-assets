var assets = require('../assets.js'),
	path = require('path'),
	_ = require('underscore'),
	requirejs = require('requirejs'),
	rimraf = require('rimraf'),
	sandbox = require('nodeunit').utils.sandbox,
	file;

requirejs.tools.useLib(function(requirejs) {
		file = requirejs('env!env/file');
});

var sandboxed = sandbox('assets.js', {
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

var configWithDefaults = new sandboxed.Assets(config).config;

var outputFiles = [ 'assets-optimized/build.txt',
  'assets-optimized/config-f0c50f456ac3c9b3a8e5b8f7e7e04646.js',
  'assets-optimized/css/alpha-020052158f873a8a7b47363a9fdff855.css',
  'assets-optimized/css/beta-9e465e2949a59e104e58ad1ed77b76bb.css',
  'assets-optimized/css/sub/gamma-810c5d7bf65fa7401e5b2e056870e8af.css',
  'assets-optimized/img/alpha-74794563ab6750654ee32dedc45bebab.jpg',
  'assets-optimized/img/beta-ff738f69127edc98d4389aa421517cbe.jpg',
  'assets-optimized/img/sub/gamma-2b7ef65dcb9607840ca2ea9e3d52b49b.jpg',
  'assets-optimized/js/alpha-a0f603c60c71e35676b47cc733549c6f.js',
  'assets-optimized/js/beta-9fb9ddb584e7404efbfc5b679a446ff6.js',
  'assets-optimized/js/lazyloaded-28de7cee6be4227075efad9d1d9892fb.js',
  'assets-optimized/js/require-5d8ec2c595f444741f9ff284639b05f2.js',
  'assets-optimized/js/sub/gamma-d454aa33f134d3741b5db79e29da096d.js',
  'assets-optimized/js/sub/mapped-4bf8779c725f89a383e77ef5440a08aa.js' ];

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

exports.compile = {
	setUp: function(callback) {
		this.cwd = process.cwd();
		process.chdir(__dirname);
		callback();
	},
	tearDown: function(callback) {
		rimraf.sync(configWithDefaults.dir);
		process.chdir(this.cwd);
		callback();
	}
};

exports.compile['compile and check the copied tree'] = function(test) {
	this.assets = new sandboxed.Assets(config);
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

	test.done();

	// can requirejs use the output?
	/* fails yet
	requirejs.config(_.extend({}, this.assets.config, {
		baseUrl: path.join(this.assets.config.dir, this.assets.config.baseUrl)
	}));

	requirejs(['alpha'], function(alpha) {
		alpha();
		test.done();
	});
	*/
};
