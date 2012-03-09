var _ = require('underscore'),
	fs = require('fs'),
	path = require('path'),
	crypto = require('crypto'),
	requirejs = require('requirejs/bin/r'),
	file;

requirejs.tools.useLib(function(requirejs) {
	file = requirejs('env!env/file');
});

var	defaultConfig = {
	appDir: 'assets',
	baseUrl: 'js',
	dir: 'assets-optimized',
	css: {
		baseUrl: 'css'
	}
};

// internals
var cssUrlRegExp = /(url\s*\(\s*['"]?)([^\)]+?)(["']?\s*\))/g,
	isRemoteUrl = /^(\w+:)?\/\//;

/**
 * Requirejs driven assets manager
 */
var Assets = module.exports = function(config) {
	this.configure(config);
};

/**
 * Reads config from file if file name passed.
 * Adds defaults.
 */
Assets.prototype.configure = function(config) {
	/*jshint evil: true */
	if(typeof config === 'undefined' && path.existsSync('assets/config.js')) {
		config = 'assets/config.js';
	}
	if(typeof config === 'string') {
		var fileContents;
		try {
			fileContents = fs.readFileSync(config, 'utf-8');
		} catch(e) {
			throw new Error('Can not read config file '+config, e);
		}
		try {
			config = eval('('+fileContents+')');
		} catch(e) {
			throw new Error('Invalid config file', e);
		}
		if(typeof config !== 'object') {
			throw new Error('Invalid config file (must be a JavaScript object)');
		}
	}
	this.config = _.extend({}, defaultConfig, config);
};

Assets.prototype.compile = function() {
	// copy tree to output dir
	var fileNames = file.copyDir(this.config.appDir, this.config.dir);
	if(!fileNames) {
		throw new Error('no files copied, check appDir!');
	}

	// rename every file to md5 versioned,
	// record renames in paths
	this.paths = {};
	for(var i = 0; i<fileNames.length; i++) {
		var optimizedPath = md5Filenamer(fileNames[i]);
		this.paths[path.relative(this.config.dir, fileNames[i])] =
			path.relative(this.config.dir, optimizedPath);
	}

	// dump path -> versioned path mappings to file
	this.writePaths();

	// update css url() references
	this.fixCssUrls();	

	// update config for optimizer	
	this.populateConfigPaths();

	// run optimizer
	requirejs.optimize(_.extend({}, this.config, {
		// optimize copied resources in-place
		appDir: this.config.dir
	}));
};

Assets.prototype.writePaths = function() {
	fs.writeFileSync(path.join(this.config.dir, '.paths.json'), 
		JSON.stringify(this.paths));
};

Assets.prototype.readPaths = function() {
	// load path mappings
	this.paths = JSON.parse(
		fs.readFileSync(path.join(this.config.dir, '.paths.json')));
};

/**
 * Replaces css url() references to point to the versioned files.
 */
Assets.prototype.fixCssUrls = function() {
	// loop over css files
	_.each(this.paths, function(to, from) {
		if(path.extname(from) === '.css') {
			var fileName = path.join(this.config.dir, to),
				fileContents = fs.readFileSync(fileName, 'utf-8'),
				dirname = path.dirname(to), // eg. css, css/sub
				paths = this.paths;

			fileContents = fileContents.replace(cssUrlRegExp, function (fullMatch, prefix, urlMatch, postfix) {
				if(! isRemoteUrl.test(urlMatch)) {
					// relative path to the file from the assets root
					// (this can be looked up in paths)
					var resolved = path.join(dirname, urlMatch);
					if(paths[resolved]) {
						// absolute path versioned copy of the file
						var replacement = path.relative(dirname, paths[resolved]);
						return prefix + replacement + postfix;
					} else {
						console.warn(urlMatch + ' can not be resolved from ' + from);
					}
				}
				return fullMatch;
			});
			fs.writeFileSync(fileName, fileContents);
		}
	}, this);
};

/**
 * Updates requirejs config.paths with versioned paths
 */
Assets.prototype.populateConfigPaths = function() {
	//keep a reversed copy of original path mappings
	var configPaths = {};
	_.each(this.config.paths, function(to, from) {
		if(!configPaths[to]) {
			configPaths[to] = [];
		}
		configPaths[to].push(from);
	});

	//add all versioned js files to config.paths
	this.config.paths = {};
	_.each(this.paths, function(to, from) {
		if(path.extname(from) === '.js') {
			var fromPath = stripExt(path.relative(this.config.baseUrl, from)),
				toPath = stripExt(path.relative(this.config.baseUrl, to));
			// if there was/were an original mapping/s, update that to point to the versioned
			// copy, add a new entry otherwise
			_.each(configPaths[fromPath] || [fromPath], function(fromPath) {
				this.config.paths[fromPath] = toPath;
			}, this);
		}
	},this);
};

// internals

/**
 * Adds md5 hash of the content to the filename.
 */
function md5Filenamer(filename) {
	var ext, hash, md5Hex, contents, renamed;
	contents = fs.readFileSync(filename);
	hash = crypto.createHash('md5');
	hash.update(contents);
	md5Hex = hash.digest('hex');
	ext = path.extname(filename);
	renamed = stripExt(filename) + "-" + md5Hex + ext;
	fs.renameSync(filename, renamed);
	return renamed;
}

/**
 * @returns path without extension.
 */
function stripExt(filename) {
	var ext = path.extname(filename);
	return path.join(path.dirname(filename),path.basename(filename, ext));
}

/**
 * Prepares assets and opimizes them with r.js
 */
exports.compile = function(config) {
	new Assets(config).compile();
};

/**
 * Command line usage: node assets.js configFile
 */
if(require.main === module) {
	exports.compile(process.argv[2]);
}
