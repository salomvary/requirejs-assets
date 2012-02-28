/*jshint es5:true */
var _ = require('underscore'),
	fs = require('fs'),
	path = require('path'),
	crypto = require('crypto'),
	requirejs = require('requirejs/bin/r'),
	connect = require('connect'),
	file,
	defaultConfig = {
		appDir: 'assets',
		baseUrl: 'js',
		dir: 'assets-optimized',
		css: {
			baseUrl: 'css'
		}
	};

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
	var instance = connect.static(options.dir);
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
	// load path mappings
	var paths = JSON.parse(fs.readFileSync(path.join(options.dir, '.paths.json')));
	// add mappings to config for requirejs
	populateConfigPaths(options, paths);
	// create helpers
	var helpers = {
			css: _.bind(css, null, options, paths),
			js: _.bind(js, null, options, paths)
		};
	if(app && app.helpers) {
		app.helpers(helpers);
	}
	return helpers;
}, prepareArguments);

/**
 * Prepares assets and opimizes them with r.js
 */
var compile = exports.compile = function(options) {
	var config = _.extend({}, defaultConfig, options),
		paths = {};

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

	// optimize
	requirejs.optimize(_.extend({}, config, {
		// optimize copied resources in-place
		appDir: config.dir
	}));
};

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

/**
 * Reads config from file if file name passed.
 * Adds defaults.
 */
function configure(config) {
	if(typeof config === 'string') {
		//TODO: read config file
	} else {
		return _.extend({}, defaultConfig, config);
	}
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
	var href = paths[path.join(options.css.baseUrl, module) + '.css'];
	return '<link rel="stylesheet" href="/' + href + '">';
}

function js(options, paths, module) {
	var requirejs = options.paths.require,
		resolvedModule = options.paths[module];
	return '<script src="'+path.join('/', options.baseUrl, requirejs)+'.js" data-main="' +
		path.join('/', options.baseUrl, resolvedModule)+ '"></script>';
}

compile({
	modules: [
		{
			name: 'alpha'
		}
	],
	paths: {
		mappedSub: 'sub/mapped'
	}
});

