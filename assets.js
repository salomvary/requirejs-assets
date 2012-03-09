/*jshint es5:true */
var _ = require('underscore'),
	fs = require('fs'),
	path = require('path'),
	crypto = require('crypto'),
	requirejs = require('requirejs/bin/r'),
	connect = require('connect'),
	file;

requirejs.tools.useLib(function(requirejs) {
	file = requirejs('env!env/file');
});

// config
var	isProduction = process.env.NODE_ENV === 'production',
	defaultConfig = {
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
function Assets(config) {
	this.configure(config);
}

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

/**
 * View helpers
 */
function Helpers(assets, optimized) {
	this.assets = assets;
	this.optimized = optimized;
}

/**
 * CSS view helper
 * @returns properly assembled <link rel="stylesheet"/>
 */
Helpers.prototype.css = function(module) {
	//TODO: handle external
	var href = path.join(this.assets.config.css.baseUrl, module) + '.css';
	if(this.optimized) {
		// TODO: handle unresolved
		href = this.assets.paths[href];
	}
	return '<link rel="stylesheet" href="/' + href + '">';
};

/**
 * JS helper
 * @returns properly assembled Requirejs powered <script> elements
 */
Helpers.prototype.js = function(module) {
	// TODO support absolute url to require.js
	var requirejs = this.assets.config.paths.require || 'require';
	// TODO cache require.config
	return '<script src="'+path.join('/', this.assets.config.baseUrl, requirejs)+'.js"></script>\n' +
		'<script>require.config('+JSON.stringify(this.assets.config)+');require(["'+module+'"]);</script>';
};

/** 
 * Creates static middleware and helpers.
 * @param {String|Object} [config] file name or object
 * @param {Function} [app] this connect/express instance will `use` helpers and static
 */
module.exports = exports = _.wrap(function(assets, app) {
	return {
		static: exports.static(assets, app),
		helpers: exports.helpers(assets, app)
	};
}, prepareArguments);

/**
 * Exposes static middleware configured to serve assets.
 * @param {String|Object} [config] file name or object
 * @param {Function} [app] this connect/express instance will `use` static
 */
exports.static = _.wrap(function(assets, app) {
	var instance = connect.static(isProduction ? assets.config.dir : assets.config.appDir, {
		// cache for one year
		maxAge: 365*24*60*60*1000
	});
	if(app) {
		app.use(instance);
	}
	return instance;
}, prepareArguments);

/**
 * Exposes view helpers to link assets to html.
 * @param {String|Object} [config] file name or object
 * @param {Function} [app] this connect/express instance will `use` helpers
 */
exports.helpers = _.wrap(function (assets, app) {
	// create helpers
	var helpers = new Helpers(assets, isProduction);
	_.bindAll(helpers);

	// add helpers to app if supported
	if(app && app.helpers) {
		app.helpers(helpers);
	}
	return helpers;
}, prepareArguments);

/**
 * Prepares assets and opimizes them with r.js
 */
exports.compile = function(config) {
	new Assets(config).compile();
};

/**
 * Warapper to create Assets instance with config.
 */
function prepareArguments(func, assets, app) {
	//single argument passed, what's that?
	if(! app && assets && typeof assets.use === 'function') {
		//first argument is app
		app = assets;
		assets = undefined;
	}
	// not an Assets instance passed, then it's a config
	if(! (assets instanceof Assets)) {
		assets = new Assets(assets);
	}
	//call wrapped function
	func.call(this, assets, app);
}
//
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

// called directly from command line
if(require.main === module) {
	exports.compile(process.argv[2]);
}
