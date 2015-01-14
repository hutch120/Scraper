var Promise = require("bluebird");
var traceback = require("traceback");
var rp = require('request-promise');
var cheerio = require('cheerio');
var elasticsearch = require('elasticsearch');

'use strict'
var scraper = new Scraper();
scraper.setOptions();
scraper.run();

/**
 * Scrape data from a web site.
 *
 * @class Scraper
 */
function Scraper() {

	// Clean reference to private class variables.
	var _ = this;

	// true: parse test data, false: parse online data.
	var testing;
	_.testing = true;

	// Set program options.
	var opts;
	_.opts = opts = {};

	// Data object.
	var races;
	_.races = races = {};

	// Elastic Search Client
	var esclient;
	_.esclient = esclient;

	/**
	 * Set options for the class.
	 *
	 * @method setOptions
	 * @public
	 */
	_.setOptions = function () {

		_.optsLive = {};
		_.optsTest = {};

		// URLs to scrape
		_.optsTest.NeuralURL = 'http://localhost/neuraltest.html?raceid=';
		_.optsTest.ResultsURL = 'http://localhost/resultstest.html?raceid=';
		_.optsTest.ElasticSearchHost = 'localhost:9200';
		_.optsTest.ElasticSearchIndex = 'localhost';
		_.optsTest.ElasticSearchType = 'neural';

		_.optsLive.NeuralURL = 'SEE LINKS';
		_.optsLive.ResultsURL = 'SEE LINKS';
		_.optsLive.ElasticSearchHost = _.optsTest.ElasticSearchHost;
		_.optsLive.ElasticSearchIndex = _.optsTest.ElasticSearchIndex;
		_.optsLive.ElasticSearchType = _.optsTest.ElasticSearchType;

		_.esclient = new elasticsearch.Client({
				host : _.optsLive.ElasticSearchHost,
				log : 'warning'
			});

		if (_.testing) {
			_.opts = _.optsTest;
		} else {
			_.opts = _.optsLive;
		}

	}

	/**
	 * Entry point for the class.
	 *
	 * @method setOptions
	 * @public
	 */
	_.run = function () {

		var raceIDs = {
			'547374' : '',
			'547375' : ''
		};

		debugObject('raceIDs', raceIDs);

		var getWebSiteDataPromise = [];
		var insertWebSiteDataPromise = [];

		for (raceID in raceIDs) {

			debug('Parse raceID: ' + raceID);

			_.races[raceID] = {};
			_.races[raceID].raceID = raceID;

			_.races[raceID].data = {};
			getWebSiteDataPromise.push(_.getNeuralDataPromise(raceID));

			_.races[raceID].results = {};
			getWebSiteDataPromise.push(_.getResultsDataPromise(raceID));
		}

		Promise.all(getWebSiteDataPromise).then(function () {
			debug("All the web site data has been retrived.");

			// Must do this here to get populated _.races object.
			for (raceID in raceIDs) {
				insertWebSiteDataPromise.push(_.insertRacePromise(raceID));
			}

			Promise.all(insertWebSiteDataPromise).then(function () {
				debug("All the web site data has been inserted.");
				_.esclient.close();
			});
		});
	}

	/**
	 * Parse Neural Data
	 *
	 * See ./testpage/neuraltest.html for example.
	 *  CP - Career performance assessment based on weight/class algorithms
	 *  CF - Current form measured by class/weight algorithms
	 *  TIM - Revolutionary time assessment (adjusted algorithm)
	 *  JA - Jockey ability algorithm
	 *  TA - Trainer ability algorithm
	 *  JT - Jockey/trainer combination algorithm
	 *  WT - Wet track performance algorithmCrs - Course suitability algorithm
	 *  D - Distance suitability algorithm$ - Prizemoney earned algorithm
	 *  BP - Barrier position (course & distance) algorithm
	 *  DLR - days since last run algorithm
	 *
	 * @method getNeuralDataPromise
	 * @return Promise
	 * @public
	 */
	_.getNeuralDataPromise = function (raceID) {
		var url = '' + _.opts.NeuralURL + raceID + '';
		debug('URL: ' + url);

		// return promise.
		return rp({
			url : url
		}).then(function (data) {
			_.parseNeuralData(data, raceID);
		})
		.catch (function (err) {
			debug("err.message: " + err.message);
			debug("err.res.statusCode: " + err.res.statusCode);
		});
	}

	/**
	 * Parse neural data from web site.
	 *
	 * @method parseNeuralData
	 * @private
	 */
	_.parseNeuralData = function (data, raceID) {
		var headers = {};

		var html = cheerio.load(data);
		var table = cheerio.load(html('#offTblBdy2').parent().html());

		table('tr th').each(function (i, element) {
			var a = table(this);
			//debug(i + ': ' + a.text());
			headers[i] = a.text().trim();
		});

		//debugObject('headers', headers);

		table('tbody tr').each(function (i, element) {
			var a = table(this);
			_.races[raceID].data[i + 1] = {};

			a.find('td').each(function (j, element) {
				var b = table(this);
				//debug(i + ': ' + b.text());
				//debug('headers[i]: ' + headers[i]);

				_.races[raceID].data[i + 1][headers[j]] = b.text().trim();
			});
		});
	}

	/**
	 * Get results from web site and return promise.
	 *
	 * @method getResultsDataPromise
	 * @return Promise
	 * @private
	 */
	_.getResultsDataPromise = function (raceID) {
		var url = '' + _.opts.ResultsURL + raceID + '';
		debug('URL: ' + url);

		// return promise.
		return rp({
			url : url
		}).then(function (data) {
			_.parseResultsData(data, raceID);
		})
		.catch (function (err) {
			debug("err.message: " + err.message);
			debug("err.res.statusCode: " + err.res.statusCode);
		});
	}

	/**
	 * Parse results data from web site.
	 *
	 * @method parseResultsData
	 * @private
	 */
	_.parseResultsData = function (data, raceID) {

		var headers = {};
		var html = cheerio.load(data);
		var table = cheerio.load(html('table .normbold').parent().html());
		var skipRow = false;
		var rowIndex = 0;

		table('tr').each(function (row, element) {
			var a = table(this);

			if (a.text().trim() == '') {
				skipRow = true;
			} else {
				//debug('row: ' + a.text().trim()	);
				skipRow = false;
				_.races[raceID].results[rowIndex] = {};

			}

			a.find('td').each(function (col, element) {
				var tablecell = table(this);

				//debug('b.text().trim(): ' + b.text().trim());
				if (row == 0) {
					headers[col] = tablecell.text().trim();
					skipRow = true;
				} else {
					if (skipRow || (col == 0 && tablecell.text().trim() == '')) {
						skipRow = true;
					} else {
						//debug('rowIndex ' + rowIndex + ' col ' + col + ' text ' + tablecell.text().trim() + ' headers[col]: ' + headers[col]);
						_.races[raceID].results[rowIndex][headers[col]] = tablecell.text().trim()

					}
				}
			});

			if (!skipRow) {
				rowIndex = rowIndex + 1;
				//debug('increment rowIndex to ' + rowIndex);
			}
		});

		//debugObject('headers', headers);
		//debugObject('results', _.races[raceID].results);
	}

	/**
	 * Insert data into Elastic Search
	 *
	 * @method insertRace
	 * @return Promise
	 * @private
	 */
	_.insertRacePromise = function (raceID) {

		// Insert place into data for easier retrieval.
		for (var key in _.races[raceID].results) {

			var tab = _.races[raceID].results[key].TAB;
			var fp = _.races[raceID].results[key].FP;
			//debug('tab: ' + tab);
			_.races[raceID].data[tab]['FP'] = fp;
		}

		// return promise.
		return _.esclient.index({
			index : _.opts.ElasticSearchIndex,
			type : _.opts.ElasticSearchType,
			id : raceID,
			body : _.races[raceID]
		}).then(function (body) {
			debug('Data indexed.');
		}, function (error) {
			debug(error.message);
		});
	}
}

var lastMessageNoNewLine = false;

function debug(msg) {
	if (lastMessageNoNewLine) {
		console.log('\n');
		lastMessageNoNewLine = false;
	}

	var d = new Date();
	// var tb = traceback()[1]; // 1 because 0 should be your enterLog-Function itself
	// console.log(d.toJSON() + ' ' + tb.file + ':' + tb.line + ':\t' + msg);
	console.log(d.toJSON() + ':\t' + msg);
}

function debugObject(msg, obj) {
	debug(msg + '\n====================\n' + JSON.stringify(obj, null, 4) + '\n====================\n');
}

function debugNoNewline(msg) {
	lastMessageNoNewLine = true;
	process.stdout.write(msg);
}

// For request promise handling.
function clientError(e) {
	return e.code >= 400 && e.code < 500;
}
