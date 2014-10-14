'use strict';

var binCheck = require('bin-check');
var binVersionCheck = require('bin-version-check');
var Download = require('download');
var globby = require('globby');
var path = require('path');
var prefix = require('rc')('npm').prefix;
var status = require('download-status');
var symlink = require('lnfs');
var which = require('npm-which');

/**
 * Initialize a new `BinWrapper`
 *
 * @param {Object} opts
 * @api public
 */

function BinWrapper(opts) {
	if (!(this instanceof BinWrapper)) {
		return new BinWrapper();
	}

	this.env = process.env.PATH.split(path.delimiter);
	this.opts = opts || {};
	this.opts.strip = this.opts.strip || 1;
	this._src = [];
}

/**
 * Get or set files to download
 *
 * @param {String} src
 * @param {String} os
 * @param {String} arch
 * @api public
 */

BinWrapper.prototype.src = function (src, os, arch) {
	if (!arguments.length) {
		return this._src;
	}

	this._src.push({
		url: src,
		os: os,
		arch: arch
	});

	return this;
};

/**
 * Get or set the destionation
 *
 * @param {String} dest
 * @api public
 */

BinWrapper.prototype.dest = function (dest) {
	if (!arguments.length) {
		return this._dest;
	}

	this._dest = dest;
	return this;
};

/**
 * Get or set the binary
 *
 * @param {String} bin
 * @api public
 */

BinWrapper.prototype.use = function (bin) {
	if (!arguments.length) {
		return this._use;
	}

	this._use = bin;
	return this;
};

/**
 * Get or set a semver range to test the binary against
 *
 * @param {String} range
 * @api public
 */

BinWrapper.prototype.version = function (range) {
	if (!arguments.length) {
		return this._version;
	}

	this._version = range;
	return this;
};

/**
 * Get the binary path
 *
 * @api public
 */

BinWrapper.prototype.path = function () {
	var dir = path.join(this.dest(), path.dirname(this.use()));
	var bin = path.basename(this.use());

	return path.join(dir, bin);
};

/**
 * Run
 *
 * @param {Array} cmd
 * @param {Function} cb
 * @api public
 */

BinWrapper.prototype.run = function (cmd, cb) {
	var self = this;

	if (typeof cmd === 'function' && !cb) {
		cb = cmd;
		cmd = ['--version'];
	}

	this.dirname = path.dirname(this.path());
	this.basename = path.basename(this.path());

	this.search(function (err, file) {
		if (err) {
			cb(err);
			return;
		}

		if (!self.location) {
			return self.get(function (err) {
				if (err) {
					cb(err);
					return;
				}

				self.test(cmd, cb);
			});
		}

		self.test(cmd, cb);
	});
};

/**
 * Search for the binary
 *
 * @param {Function} cb
 * @api private
 */

BinWrapper.prototype.search = function (cb) {
	var self = this;
	var paths = [path.join(this.dirname, this.basename)];

	if (this.opts.global) {
		this.env.forEach(function (dir) {
			paths.push(path.join(dir, self.basename));
		});
	}

	globby(paths, function (err, files) {
		if (err) {
			cb(err);
			return;
		}

		if (self.opts.global) {
			files = files.filter(function (file) {
				try {
					return file !== which.sync(self.basename, {
						env: {
							NODE_PATH: process.env.NODE_PATH,
							PATH: prefix ? path.join(prefix, 'bin') : ''
						}
					});
				} catch (err) {
					return true;
				}
			});
		}

		self.location = files[0] || null;

		if (self.opts.global && self.location) {
			return self.symlink(cb);
		}

		cb();
	});
};

/**
 * Symlink global binaries
 *
 * @param {Function} cb
 * @api private
 */

BinWrapper.prototype.symlink = function (cb) {
	var self = this;
	var isGlobal = this.env.some(function (p) {
		return path.dirname(self.location) === p;
	});

	if (isGlobal) {
		return symlink(this.location, this.path(), cb);
	}

	cb();
};

/**
 * Check if binary is working

 * @param {Array} cmd
 * @param {Function} cb
 * @api private
 */

BinWrapper.prototype.test = function (cmd, cb) {
	var self = this;
	var version = this.version();

	binCheck(this.path(), cmd, function (err, works) {
		if (err) {
			cb(err);
			return;
		}

		if (!works) {
			cb(new Error('The `' + self.basename + '` binary doesn\'t seem to work correctly'));
			return;
		}

		if (version) {
			return binVersionCheck(self.path(), version, cb);
		}

		cb();
	});
};

/**
 * Download files
 *
 * @api private
 */

BinWrapper.prototype.get = function (cb) {
	var files = this.parse(this.src());
	var download = new Download({
		extract: true,
		mode: parseInt('0755', 8),
		strip: this.opts.strip
	});

	files.forEach(function (file) {
		download.get(file.url);
	});

	download.dest(this.dest());
	download.use(status());
	download.run(cb);
};

/**
 * Parse sources
 *
 * @param {Object} obj
 * @api private
 */

BinWrapper.prototype.parse = function (obj) {
	var arch = process.arch === 'x64' ? 'x64' : process.arch === 'arm' ? 'arm' : 'x86';
	var platform = process.platform;
	var ret = [];

	obj.filter(function (o) {
		if (o.os && o.os === platform && o.arch && o.arch === arch) {
			return ret.push(o);
		} else if (o.os && o.os === platform && !o.arch) {
			return ret.push(o);
		} else if (!o.os && !o.arch) {
			return ret.push(o);
		}
	});

	return ret;
};

/**
 * Module exports
 */

module.exports = BinWrapper;
