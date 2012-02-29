/*jshint es5:true */
var _ = require('underscore'),
	fs = require('fs'),
	path = require('path'),
	crypto = require('crypto'),
	requirejs = require('requirejs/bin/r'),
	connect = require('connect'),
	file,
	isDevelopment = process.env.NODE_ENV === 'development',
	defaultConfig = {
		appDir: 'assets',
		baseUrl: 'js',
		dir: 'assets-optimized',
		css: {
			baseUrl: 'css'
		}
	};

console.log('isDevelopment='+isDevelopment);

requirejs.tools.useLib(function(requirejs) {
	file = requirejs('env!env/file');
});

/** 
 * Creates static middleware and helpers.
 * @param {String|Object} [config] file name or object
 */
module.exports = exports = function assets(options, app) {
	return {
		static: exports.static(options, app),
		helpers: exports.helpers(options, app)
	};
};

/**
 * Exposes static middleware configured to serve assets.
 * @param {String|Object} [config] file name or object
 * @param {Function} [app] this connect/express instance will `use` helpers and static
 */
exports.static = _.wrap(function(options, app) {
	var instance = connect.static(isDevelopment ? options.appDir : options.dir);
	if(app) {
		//console.log('started static in', options.dir);
		app.use(instance);
	}
	return instance;
}, prepareArguments);

/**
 * Exposes view helpers to link assets to html.
 * @param {String|Object} [config] file name or object
 */
exports.helpers = _.wrap(function (options, app) {
	if(! isDevelopment) {
		// load path mappings
		var paths = JSON.parse(fs.readFileSync(path.join(options.dir, '.paths.json')));
		// add mappings to config for requirejs
		populateConfigPaths(options, paths);
	}
	// create helpers
	var helpers = {
			css: _.bind(css, null, options, paths),
			js: _.bind(js, null, options, paths)
		};
	// add helpers to app if supported
	if(app && app.helpers) {
		app.helpers(helpers);
	}
	return helpers;
}, prepareArguments);

/**
 * Prepares assets and opimizes them with r.js
 */
var compile = exports.compile = _.wrap(function(config) {
	var paths = {};

	// copy tree to output dir
	file.copyDir(config.appDir, config.dir);
	var fileNames = file.getFilteredFileList(config.dir, {include: null, exclude: null});	

	// rename every file to md5 versioned
	for(var i = 0; i<fileNames.length; i++) {
		var optimizedPath = md5Filenamer(fileNames[i]);
		paths[path.relative(config.dir, fileNames[i])] = path.relative(config.dir, optimizedPath);
		fs.renameSync(fileNames[i], optimizedPath);	
	}

	// dump path -> versioned path mappings to file
	fs.writeFileSync(path.join(config.dir, '.paths.json'), 
		JSON.stringify(paths, null, ' '));
	console.log(paths);
	
	// update config for optimizer	
	populateConfigPaths(config, paths);
	console.log(config);

	// update css url() references
	fixCssUrls(config, paths);	

	// optimize
	requirejs.optimize(_.extend({}, config, {
		// optimize copied resources in-place
		appDir: config.dir
	}));
}, prepareArguments);

/**
 * Updates config.paths with versioned paths
 * @param {Object} config requirejs config object
 * @param {Object} paths original -> versioned mapping of paths
 */
function populateConfigPaths(config, paths) {
	var configPaths = {};
	_.each(config.paths, function(to, from) {
		if(!configPaths[to]) {
			configPaths[to] = [];
		}
		configPaths[to].push(from);
	});
	config.paths = {};
	_.each(paths, function(to, from) {
		if(path.extname(from) === '.js') {
			var fromPath = stripExt(path.relative(config.baseUrl, from)),
				toPath = stripExt(path.relative(config.baseUrl, to));
			_.each(configPaths[fromPath] || [fromPath], function(fromPath) {
				config.paths[fromPath] = toPath;
			});
		}
	});
}

var cssUrlRegExp = /(url\s*\(\s*['"]?)([^\)]+?)(["']?\s*\))/g,
	isRemoteUrl = /^(\w+:)?\/\//;

/**
 * Replaces css url() references to point to the versioned files.
 */
function fixCssUrls(config, paths) {
	// loop over css files
	_.each(paths, function(to, from) {
		if(isCss(from)) {
			var fileName = path.join(config.dir, to),
				fileContents = fs.readFileSync(fileName, 'utf-8'),
				dirname = path.dirname(to); // eg. css, css/sub
			console.log('fileName', fileName, 'dirname', dirname);

			fileContents = fileContents.replace(cssUrlRegExp, function (fullMatch, prefix, urlMatch, postfix) {
				if(! isRemoteUrl.test(urlMatch)) {
					console.log(' match', fullMatch, urlMatch);
					// relative path to the file from the assets root
					// (this can be looked up in paths)
					var resolved = path.join(dirname, urlMatch);
					console.log('  resolved', resolved);
					if(paths[resolved]) {
						// absolute path versioned copy of the file
						var replacement = path.relative(dirname, paths[resolved]);
						console.log('  replace', replacement);
						return prefix + replacement + postfix;
					} else {
						console.warn(urlMatch + ' can not be resolved from ' + from);
					}
				}
				return fullMatch;
			});
			fs.writeFileSync(fileName, fileContents);
		}
	});
}

function isCss(fileName){
	return path.extname(fileName) === '.css';
}

/**
 * Reads config from file if file name passed.
 * Adds defaults.
 */
function configure(config) {
	/*jshint evil: true */
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
	return _.extend({}, defaultConfig, config);
}

function prepareArguments(func, config, app) {
	//single argument passed, what's that?
	if(! app && config && typeof config.use === 'function') {
		//first argument is app
		app = config;
		config = undefined;
	}
	//normalize config
	config = configure(config);
	//call wrapped function
	func.call(this, config, app);
}

/**
 * Adds md5 hash of the content to the filename.
 */
function md5Filenamer(filename) {
	var ext, hash, md5Hex, contents;
	contents = fs.readFileSync(filename);
	hash = crypto.createHash('md5');
	hash.update(contents);
	md5Hex = hash.digest('hex');
	ext = path.extname(filename);
	return  stripExt(filename) + "-" + md5Hex + ext;
}

function stripExt(filename) {
	var ext = path.extname(filename);
	return path.join(path.dirname(filename),path.basename(filename, ext));
}

function css(options, paths, module) {
	//TODO: handle external
	var href = path.join(options.css.baseUrl, module) + '.css';
	if(! isDevelopment) {
		// TODO: handle unresolved
		href = paths[href];
	}
	return '<link rel="stylesheet" href="/' + href + '">';
}

function js(options, paths, module) {
	// TODO support absolute url to require.js
	var requirejs = options.paths.require || 'require';
	// TODO cache require.config
	return '<script src="'+path.join('/', options.baseUrl, requirejs)+'.js"></script>\n' +
		'<script>require.config('+JSON.stringify(options)+');require(["'+module+'"]);</script>';
}

// called directly from command line
if(require.main === module) {
	if(process.argv.length === 3) {
		compile(process.argv[2]);
	} else {
		console.err('Missing config file argument');
		process.exit(1);
	}
}
