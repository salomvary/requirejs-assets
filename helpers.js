/*jshint es5:true */
var _ = require('underscore'),
	path = require('path'),
	connect = require('connect'),
	Assets = require('./assets.js');

var	isProduction = process.env.NODE_ENV === 'production';

/**
 * Connect/Express helpers
 */
function Helpers(assets, optimized) {
	this.assets = assets;
	if(optimized) {
		try {
			this.assets.readPaths();
			this.assets.populateConfigPaths();
			this.optimized = true;
		} catch(e) {
			console.warn('optimized resources could not be found');
		}
	}
}

/**
 * CSS view helper
 * @returns properly assembled <link rel="stylesheet"/>
 */
Helpers.prototype.css = function(module) {
	//TODO: handle externa
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
	var href = path.join(this.assets.config.baseUrl, requirejs)+'.js';
	// TODO cache require.config
	return '<script src="/' + href + '"></script>\n' +
		'<script>require.config(' + 
		JSON.stringify(this.assets.config) + 
		');require(["' + module + '"]);</script>';
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

