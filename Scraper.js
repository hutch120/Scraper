var traceback = require("traceback");
var request = require('request');
var cheerio = require('cheerio');

'use strict'
var scraper = new Scraper();
scraper.setOptions();
scraper.run();

function Scraper() {

	var _ = this;
	
	var testing;
	_.testing = true;
	
	var opts;
	_.opts = opts = {};
	
	var races;
	_.races = races = {};
	
	_.setOptions = function() {
		
		_.optsLive = {};
		_.optsTest = {};

		// URLs to scrape
		_.optsLive.NeuralURL = 'SEE LINKS FILE';
		_.optsTest.NeuralURL = 'http://localhost/neuraltest.html?raceid=';

		_.optsLive.ResultsURL = 'SEE LINKS FILE';
		_.optsTest.ResultsURL = 'http://localhost/resultstest.html?raceid=';
		
		if ( _.testing ) {
			_.opts = _.optsTest;
		} else {
			_.opts = _.optsLive;
		}
	
	}
	
	_.run = function () {

		var raceIDs = {
			'547374': '' 
		};

		debugObject('raceIDs', raceIDs);
		
		for (raceID in raceIDs) {
			
			debug('Parse raceID: ' + raceID);
			
			_.races[raceID] = {};
			_.races[raceID].raceID = raceID;
			_.parseNeuralData(raceID);
		}		
	}
	
	/*	
		See ./testpage/neuraltest.html for example.
		
		CP - Career performance assessment based on weight/class algorithms
		CF - Current form measured by class/weight algorithms
		TIM - Revolutionary time assessment (adjusted algorithm)
		JA - Jockey ability algorithm
		TA - Trainer ability algorithm
		JT - Jockey/trainer combination algorithm
		WT - Wet track performance algorithmCrs - Course suitability algorithm
		D - Distance suitability algorithm$ - Prizemoney earned algorithm
		BP - Barrier position (course & distance) algorithm
		DLR - days since last run algorithm
	*/
	_.parseNeuralData = function (raceID) {
		_.races[raceID].data = {};
		var headers = {};
		
		var url = '' + _.opts.NeuralURL + raceID + '';
		debug('URL: ' + url);
		
		request(url, function(error, response, html) {
			if (error || response.statusCode != 200) {
				throw error;
			}
			
			var $html = cheerio.load(html);
			var $table = cheerio.load($html('#offTblBdy2').parent().html());
			
			$table('tr th').each(function(i, element){
				var a = $table(this);
				//debug(i + ': ' + a.text());
				headers[i] = a.text().trim();
			});

			//debugObject('headers', headers);

			$table('tbody tr').each(function(i, element){
				var a = $table(this);
				_.races[raceID].data[i+1] = {};
			
				a.find('td').each(function(j, element){
					var b = $table(this);
					//debug(i + ': ' + b.text());
					//debug('headers[i]: ' + headers[i]);
					
					_.races[raceID].data[i+1][headers[j]] = b.text().trim();
				});
			});

			_.neuralFinished(raceID);
			
		});	
	
	}
	
	_.neuralFinished = function (raceID) {
		//debugObject('race', _.races);
		_.parseResultsData(raceID);
	}
	
	// 
	_.parseResultsData = function (raceID) {
		_.races[raceID].results = {};
		var headers = {};
		
		var url = '' + _.opts.ResultsURL + raceID + '';
		debug('URL: ' + url);
		
		request(url, function(error, response, html) {
			if (error || response.statusCode != 200) {
				throw error;
			}
			
			var $html = cheerio.load(html);
			var $table = cheerio.load($html('table .normbold').parent().html());
			var skipRow = false;
			var rowIndex = 0;
			
			$table('tr').each(function(row, element){
				var a = $table(this);
				
				if ( a.text().trim() == '' ) {
					skipRow = true;
				} else {
					//debug('row: ' + a.text().trim()	);
					skipRow = false;
					_.races[raceID].results[rowIndex] = {};

				}
				
				a.find('td').each(function(col, element){
					var tablecell = $table(this);
					
					//debug('b.text().trim(): ' + b.text().trim());
					if ( row == 0 ) {
						headers[col] = tablecell.text().trim();
						skipRow = true;
					} else {
						if ( skipRow || (col == 0 && tablecell.text().trim() == '')) {
							skipRow = true;
						} else {
							//debug('rowIndex ' + rowIndex + ' col ' + col + ' text ' + tablecell.text().trim() + ' headers[col]: ' + headers[col]);
							_.races[raceID].results[rowIndex][headers[col]] = tablecell.text().trim()
							
						}
					}
				});
				
				if ( !skipRow ) {
					rowIndex = rowIndex + 1;
					//debug('increment rowIndex to ' + rowIndex);
				}
			});

			//debugObject('headers', headers);
			//debugObject('results', _.races[raceID].results);
			
			// Insert place into data for easier retrieval.
			for (var key in _.races[raceID].results) {
				
				var tab = _.races[raceID].results[key].TAB;
				var fp = _.races[raceID].results[key].FP;
				//debug('tab: ' + tab);
				_.races[raceID].data[tab]['FP'] = fp;
			}
			
			_.resultsFinished(raceID);
			
		});	
	
	}
	
	_.resultsFinished = function (raceID) {
		debugObject('race', _.races[raceID]);
	}
	
	
}



var lastMessageNoNewLine = false;

function debug(msg) {
	if ( lastMessageNoNewLine ) {
		console.log('\n');
		lastMessageNoNewLine = false;
	}

	var d = new Date();
	var tb = traceback()[1]; // 1 because 0 should be your enterLog-Function itself
	console.log(d.toJSON() + ' ' + tb.file + ':' + tb.line + ':\t' + msg);
}

function debugObject(msg, obj) {
	debug(msg + '\n====================\n' + JSON.stringify(obj, null, 4) + '\n====================\n');
}

function debugNoNewline(msg) {
	lastMessageNoNewLine = true;
	process.stdout.write(msg);
}
