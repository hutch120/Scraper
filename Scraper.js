var Promise = require("bluebird");
var traceback = require("traceback");
var rp = require('request-promise');
var cheerio = require('cheerio');
var elasticsearch = require('elasticsearch');
var urljs = require('url');

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

	// Meetings data object.
	var meetings;
	_.meetings = meetings = {};
	
	var raceIDs;
	_.raceIDs = raceIDs;
	
	// Races data object.
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
		_.optsTest.FullResultsURL = 'http://localhost/fullresults.html';
		_.optsTest.NeuralURL = 'http://localhost/neuraltest.html?raceid=';
		_.optsTest.ResultsURL = 'http://localhost/resultstest.html?raceid=';
		_.optsTest.ElasticSearchHost = 'localhost:9200';
		_.optsTest.ElasticSearchIndex = 'localhost';
		_.optsTest.ElasticSearchType = 'neural';

		_.optsLive.FullResultsURL = 'SEE LINKS';
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

		_.raceIDs = {
			'547374' : '',
			'547375' : ''
		};

		debugObject('raceIDs', _.raceIDs);

		var getMeetingDataPromise = [];
		var getRaceIDsDataPromise = [];
		var getRacesDataPromise = [];
		var getWebSiteDataPromise = [];
		var insertWebSiteDataPromise = [];
		var url = '';
		
		getMeetingDataPromise.push(_.getDataPromise(_.opts.FullResultsURL, 0, _.parseMeetingData));
		
		Promise.all(getMeetingDataPromise).then(function () {

			for (var key in _.meetings) {
				url = _.optsTest.FullResultsURL + _.meetings[key];
				//debug('url: ' + url);
				getRaceIDsDataPromise.push(_.getDataPromise(url, 0, _.parseRaceIDsData));
			}
			
			Promise.all(getRaceIDsDataPromise).then(function () {
			
				for (raceID in _.raceIDs) {

					_.races[raceID] = {};
					_.races[raceID].raceID = raceID;

					_.races[raceID].data = {};
					url = '' + _.opts.NeuralURL + raceID + '';
					getWebSiteDataPromise.push(_.getDataPromise(url, raceID, _.parseNeuralData));

					_.races[raceID].results = {};
					url = '' + _.opts.ResultsURL + raceID + '';
					getWebSiteDataPromise.push(_.getDataPromise(url, raceID, _.parseResultsData));
				}

				Promise.all(getWebSiteDataPromise).then(function () {
					debug("All the web site data has been retrived.");

					// Must do this here to get populated _.races object.
					for (raceID in _.raceIDs) {
						insertWebSiteDataPromise.push(_.insertRacePromise(raceID));
					}

					Promise.all(insertWebSiteDataPromise).then(function () {
						debug("All the web site data has been inserted.");
						_.esclient.close();
					});
				});
			});
		});
	}


	/**
	 * Get results from web site and return promise.
	 *
	 * @method getDataPromise
	 * @return Promise
	 * @private
	 */
	_.getDataPromise = function (url, id, callback) {
		//debug('Get data promise for URL: ' + url + ' ID: ' + id);

		// return promise.
		return rp({
			url : url
		}).then(function (data) {
			debug('Data retrieved from URL: ' + url + ' callback with ID: ' + id);
			callback(data, id);
		})
		.catch (function (err) {
			debug("getDataPromise - err.message: " + err.message);
		});
	}	
	
	/**
	 * Parse meeting data from web site.
	 *
	 * @method parseMeetingData
	 * @private
	 */
	_.parseMeetingData = function (data, id) {
		debug('Parse meeting data');
		
		var headers = {};

		var html = cheerio.load(data);
	
		var list = cheerio.load(html('#meetings').html());

		list('a').each(function (i, element) {
			var a = list(this);
			var queryObject = urljs.parse(a.attr('href'));
			//console.log(queryObject);
			//debug(i + ': ' + queryObject.query);
			_.meetings[i+1] = queryObject.search;
		});

		//debugObject('meetings', _.meetings);
	}	

	/**
	 * Parse meeting data from web site.
	 *
	 * @method parseMeetingData
	 * @private
	 */
	_.parseRaceIDsData = function (data, id) {
		debug('Parse raceids data TODO: WORKING HERE....');
		
		/*
		var headers = {};

		var html = cheerio.load(data);
	
		var list = cheerio.load(html('.raceheader table tbody .nf').html());

		debug(list);*/
		
		/*
		list('a').each(function (i, element) {
			var a = list(this);
			var queryObject = urljs.parse(a.attr('href'));
			//console.log(queryObject);
			//debug(i + ': ' + queryObject.query);
			_.meetings[i+1] = queryObject.search;
		});*/

		//debugObject('meetings', _.meetings);
	}		
	
	/**
	 * Parse neural data from web site.
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
	 * @method parseNeuralData
	 * @private
	 */
	_.parseNeuralData = function (data, raceID) {
		debug('Parse neural data for ID: ' + raceID);
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
	 * Parse results data from web site.
	 *
	 * @method parseResultsData
	 * @private
	 */
	_.parseResultsData = function (data, raceID) {
		debug('Parse results data for ID: ' + raceID);
		
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
		debug('Insert Race Data for ID: ' + raceID);
	
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
	//var tb = traceback(); // 1 because 0 should be your enterLog-Function itself
	//console.log(d.toJSON() + ' ' + tb.file + ':' + tb.line + ':\t' + msg);
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
