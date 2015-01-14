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

	var _ = this;

	var testing;
	_.testing = true;

	var opts;
	_.opts = opts = {};

	var races;
	_.races = races = {};

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
				log : 'error'
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

		var getWebSiteData = [];
		var insertWebSiteData = [];
		
		for (raceID in raceIDs) {

			debug('Parse raceID: ' + raceID);

			_.races[raceID] = {};
			_.races[raceID].raceID = raceID;

			_.races[raceID].data = {};
			getWebSiteData.push(_.getNeuralData(raceID));

			_.races[raceID].results = {};
			getWebSiteData.push(_.getResultsData(raceID));
			
			insertWebSiteData.push(_.insertRace(raceID));
		}
		
		Promise.all(getWebSiteData).then(function() {
			debug("All the web site data has been retrived.");
			
			Promise.all(insertWebSiteData).then(function() {
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
	 * @method parseNeuralData
	 * @public
	 */
	_.getNeuralData = function (raceID) {
		var url = '' + _.opts.NeuralURL + raceID + '';
		debug('URL: ' + url);
		
		return rp({ url: url }).then(function (data) {
			_.parseNeuralData(data, raceID);
		})
		.catch(function (err) {
			debug("err.message: " + err.message);
			debug("err.res.statusCode: " + err.res.statusCode);
		});
		
	}

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
	
	_.getResultsData = function (raceID) {
		var url = '' + _.opts.ResultsURL + raceID + '';
		debug('URL: ' + url);

		return rp({ url: url }).then(function (data) {
			_.parseResultsData(data, raceID);
		})
		.catch(function (err) {
			debug("err.message: " + err.message);
			debug("err.res.statusCode: " + err.res.statusCode);
		});		
	}

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

	_.insertRace = function (raceID) {

		// Insert place into data for easier retrieval.
		for (var key in _.races[raceID].results) {

			var tab = _.races[raceID].results[key].TAB;
			var fp = _.races[raceID].results[key].FP;
			//debug('tab: ' + tab);
			_.races[raceID].data[tab]['FP'] = fp;
		}
	
		//var url = _.opts.ElasticSearchURL + raceID + '/_update';

		//_.esDSL = '{ "doc" : ' + JSON.stringify(_.races[raceID]) + ', "doc_as_upsert": true}';

		//debug(url);
		//debug(_.esDSL);

		// TODO: This causes elastic search to go 100% CPU!
		// Tested DSL code on _plugin/head, and insert working so JSON format correct.
		_.esclient.index({
			index : _.opts.ElasticSearchIndex,
			type : _.opts.ElasticSearchType,
			id : raceID,
			body : JSON.stringify(_.races[raceID])
		}, function (error, response) {
			if ( typeof error !== 'undefined' ) {
				debugObject('error', error);
			}
			debugObject('response', response);
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