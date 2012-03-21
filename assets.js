//detect node environment
var node = (typeof exports !== 'undefined' && typeof module !== 'undefined');

//nodejs
if(node) {
	var requirejs = require('requirejs/bin/r'),
		define = requirejs.define;
	requirejs.tools.useLib(function(internal) {
		requirejs = internal;
	});
}

//rhino
if(typeof JSON === 'undefined') {
	requirejs(['./json2']);
}

define('node/md5', function() {
	return function(data) {
		var crypto = require('crypto');
		var hash = crypto.createHash('md5');
		hash.update(data);
		return hash.digest('hex');
	};
});

define('rhino/md5', function() {
	return function(data) {
		var digest = java.security.MessageDigest.getInstance("MD5")
			.digest(new java.lang.String(data).getBytes());
		return new java.math.BigInteger(1, digest).toString(16);
	};
});

define('util', {

	cssUrlRegExp: /(url\s*\(\s*['"]?)([^\)]+?)(["']?\s*\))/g,

	isRemoteUrl: /^(\w+:)?\/\//,
	
	/**
	 * @returns path without extension.
	 */
	stripExt: function(path) {
		var ext = this.getExt(path);
		if(ext.length) {
			return path.substring(0, path.length - ext.length - 1);
		} else {
			return path;
		}
	},

	/**
	 * @returns the extension of the path.
	 */
	getExt: function(path) {
		var basename = this.getBasename(path),
			i = basename.lastIndexOf('.');
		return i > 0 ? basename.substring(i + 1) : '';
	},

	/**
	 * @returns the parent folder.
	 */
	getParent: function(path) {
		return path.substring(0, path.lastIndexOf('/'));
	},

	/**
	 * @returns the basename of the path.
	 */
	getBasename: function(path) {
		return path.substring(path.lastIndexOf('/') + 1);
	},

	join: function() {
		return Array.prototype.filter.call(arguments, function(part) {
			return part && part.length;
		}).join('/');
	},

	/**
	 * Normalize path with .. and . removed.
	 * Source: http://code.google.com/p/stringencoders/source/browse/trunk/javascript/urlparse.js
	 */
	normalizePath:function(path) {
		var parts = path.split('/');
		var newparts = [];

		for (var i = 0; i < parts.length; ++i) {
			if (parts[i] === '..') {
				if (newparts.length > 0) {
					newparts.pop();
				} else {
					newparts.push(parts[i]);
				}
			} else if (parts[i] != '.') {
				newparts.push(parts[i]);
			}
		}

		path = newparts.join('/');
		return path;
	}
});

requirejs(['env!env/file','env!env/md5', 'env!env/print', 'build', 'util'], function(file, md5, print, build, util) {

var	defaultConfig = {
	appDir: 'assets',
	baseUrl: 'js',
	dir: 'assets-optimized',
	css: {
		baseUrl: 'css'
	}
};

/**
 * Requirejs driven assets manager
 */
var Assets = function(config) {
	this.configure(config);
};

/**
 * Reads config from file if file name passed.
 * Adds defaults.
 */
Assets.prototype.configure = function(config) {
	/*jshint evil: true */
	if(typeof config === 'undefined' && file.exists('assets/config.js')) {
		config = 'assets/config.js';
	}
	if(typeof config === 'string') {
		var fileContents;
		try {
			fileContents = file.readFile(config, 'utf-8');
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
	this.config = extend({}, defaultConfig, config);
};

Assets.prototype.compile = function() {
	// copy tree to output dir
	var fileNames = file.copyDir(this.config.appDir, this.config.dir);
	// fileNames will be appDir/path
	if(!fileNames) {
		throw new Error('no files copied, check appDir!');
	}

	// rename every file to md5 versioned,
	// record renames in paths
	this.paths = {};
	for(var i = 0; i<fileNames.length; i++) {
		var optimizedPath = md5Filenamer(fileNames[i]);
		//print(fileNames[i] +' > '+optimizedPath);
		this.paths[fileNames[i].substring(this.config.dir.length + 1)] =
			optimizedPath.substring(this.config.dir.length + 1);
	}

	// dump path -> versioned path mappings to file
	this.writePaths();

	// update css url() references
	this.fixCssUrls();	

	// update config for optimizer	
	this.populateConfigPaths();

	// run optimizer
	build(extend({}, this.config, {
		// optimize copied resources in-place
		appDir: this.config.dir
	}));
};

Assets.prototype.writePaths = function() {
	file.saveFile(this.config.dir + '/.paths.json', 
		JSON.stringify(this.paths));
};

Assets.prototype.readPaths = function() {
	// load path mappings
	this.paths = JSON.parse(
		file.readFile(this.config.dir + '/.paths.json'));
};

/**
 * Replaces css url() references to point to the versioned files.
 */
Assets.prototype.fixCssUrls = function() {
	// loop over css files
	for(var from in this.paths) {
		var to = this.paths[from];
		if(util.getExt(from) === 'css') {
			var fileName = this.config.dir + '/' + to,
				fileContents = file.readFile(fileName, 'utf-8'),
				dirname = util.getParent(to), // eg. css, css/sub
				paths = this.paths;

			fileContents = fileContents.replace(util.cssUrlRegExp, function (fullMatch, prefix, urlMatch, postfix) {
				if(! util.isRemoteUrl.test(urlMatch)) {
					var resolved = util.normalizePath(util.join(dirname, urlMatch));
					// (this can be looked up in paths)
					// e.g. css/foo/bar.css
					if(paths[resolved]) {
						// paths[resolved] === css/foo/bar-VERSION.css
						// absolute path versioned copy of the file
						var replacement = util.join(
							util.getParent(urlMatch),
							util.getBasename(paths[resolved]));
						return prefix + replacement + postfix;
					} else {
						print(urlMatch + ' can not be resolved from ' + from);
					}
				}
				return fullMatch;
			});
			file.saveFile(fileName, fileContents);
		}
	}
};

/**
 * Updates requirejs config.paths with versioned paths
 */
Assets.prototype.populateConfigPaths = function() {
	//keep a reversed copy of original path mappings
	var configPaths = {}, from, to;
	for(from in this.config.paths) {
		to = this.config.paths[from];
		if(!configPaths[to]) {
			configPaths[to] = [];
		}
		configPaths[to].push(from);
	}

	//add all versioned js files to config.paths
	this.config.paths = {};
	for(from in this.paths) {
		to = this.paths[from];
		if(util.getExt(from) === 'js') {
			// remove js/ and extension from js/foo/bar/baz.js
			var fromPath = util.stripExt(from.substring(this.config.baseUrl.length + 1)),
				toPath = util.stripExt(to.substring(this.config.baseUrl.length + 1));
			// if there was/were an original mapping/s, update that to point to the versioned
			// copy, add a new entry otherwise
			var mappings = configPaths[fromPath] || [fromPath];
			for(var i=0; i<mappings.length; i++) {
				this.config.paths[mappings[i]] = toPath;
			}
		}
	}
};

// internals

/**
 * Adds md5 hash of the content to the filename.
 */
function md5Filenamer(filename) {
	var ext, md5Hex, contents, renamed;
	contents = file.readFile(filename);
	md5Hex = md5(contents);
	ext = util.getExt(filename);
	renamed = util.stripExt(filename) + "-" + md5Hex + '.' + ext;
	file.renameFile(filename, renamed);
	return renamed;
}

function extend(target) {
	for(var i=1; i<arguments.length; i++) {
		for(var key in arguments[i]) {
			target[key] = arguments[i][key];
		}
	}
	return target;
}

// node
if(node) {
	module.exports = Assets;

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
} 
// rhino
else {
	// no "exports" yet

	/**
	 * Command line usage: rhino assets.js configFile
	 */
	new Assets(arguments[0]).compile();
	
}

});


