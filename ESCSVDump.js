var elasticsearch = require('elasticsearch');
var stringify = require('csv-stringify');
var fs = require('fs');

'use strict'
var esCSVDump = new ESCSVDump();
esCSVDump.setOptions();
esCSVDump.run();

/**
 * Dump CSV data from Elastic Search
 *
 * @class ESCSVDump
 */
function ESCSVDump() {

	// Clean reference to private class variables.
	var _ = this;

	// Set program options.
	var opts;
	_.opts = opts = {};

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

		_.opts.ElasticSearchHost = 'localhost:9200';
		_.opts.ElasticSearchIndex = 'localhost';
		_.opts.ElasticSearchType = 'neural';

		_.esclient = new elasticsearch.Client({
				host : _.opts.ElasticSearchHost,
				log : 'warning'
			});

		debugObject('Options', _.opts);
	}

	/**
	 * Entry point for the class.
	 *
	 * @method run
	 * @public
	 */
	_.run = function () {

		_.getESDataPromise();

	}

	/**
	 * Insert data into Elastic Search
	 *
	 * @method insertRace
	 * @return Promise
	 * @private
	 */
	_.getESDataPromise = function () {
		debug('getESDataPromise');

		var size = 20000;
		var dsl = {
			"query" : {
				"bool" : {
					"must" : [{
							"match_all" : {}

						}
					],
					"must_not" : [],
					"should" : []
				}
			},
			"from" : 0,
			"size" : size,
			"sort" : [],
			"facets" : {}

		}
		var input = [];

		// return promise.
		return _.esclient.search({
			index : _.opts.ElasticSearchIndex,
			type : _.opts.ElasticSearchType,
			body : dsl
		}).then(function (response) {
			debug('Retreived all records.')
			
			
			
			for (var key in response.hits.hits) {
			
				debug('RaceID: ' + response.hits.hits[key]['_source'].raceID);
				
				//debug('key: ' + key);
				//debugObject('response', response.hits.hits[key]['_source'].data.horses);
				//debug('NR: ' + response.hits.hits[key]['_source'].data.horses[0].NR);

				var horseAttributeTotal = {};
								
				horseAttributeTotal.NR = 0;
				horseAttributeTotal.CP = 0;
				//horseAttributeTotal.HCP = 0; // Ignore: Always seems to be 0
				horseAttributeTotal.CF = 0;
				horseAttributeTotal.TIM = 0;
				horseAttributeTotal.SCR = 0;
				horseAttributeTotal.JA = 0;
				horseAttributeTotal.TA = 0;
				horseAttributeTotal.JT = 0;
				horseAttributeTotal.BP = 0;
				horseAttributeTotal.WET = 0;
				horseAttributeTotal.CRS = 0;
				horseAttributeTotal.D = 0;
				horseAttributeTotal.$ = 0;
				horseAttributeTotal.DLR = 0;
				
				// Get totals in order to normalise the output.
				for (var key2 in response.hits.hits[key]['_source'].data.horses) {
					var horseObj = response.hits.hits[key]['_source'].data.horses[key2];
					
					horseAttributeTotal.NR += horseObj.NR*1;
					horseAttributeTotal.CP += horseObj.CP*1;
					//horseAttributeTotal.HCP += horseObj.HCP*1; // Ignore: Always seems to be 0
					horseAttributeTotal.CF += horseObj.CF*1;
					horseAttributeTotal.TIM += horseObj.TIM*1;
					horseAttributeTotal.SCR += horseObj.SCR*1;
					horseAttributeTotal.JA += horseObj.JA*1;
					horseAttributeTotal.TA += horseObj.TA*1;
					horseAttributeTotal.JT += horseObj.JT*1;
					horseAttributeTotal.BP += horseObj.BP*1;
					horseAttributeTotal.WET += horseObj.WET*1;
					horseAttributeTotal.CRS += horseObj.CRS*1;
					horseAttributeTotal.D += horseObj.D*1;
					horseAttributeTotal.$ += horseObj.$*1;
					horseAttributeTotal.DLR += horseObj.DLR*1;
					// Note FP is answer.
				}
				
				//debugObject('horseAttributeTotal', horseAttributeTotal);
				
				for (var key2 in response.hits.hits[key]['_source'].data.horses) {
					var horseArr = [];
					var horseObj = response.hits.hits[key]['_source'].data.horses[key2];
					horseArr.push(normalise(horseObj.NR, horseAttributeTotal.NR));
					horseArr.push(normalise(horseObj.CP, horseAttributeTotal.CP));
					//horseArr.push(normalise(horseObj.HCP, horseAttributeTotal.HCP));
					horseArr.push(normalise(horseObj.CF, horseAttributeTotal.CF));
					horseArr.push(normalise(horseObj.TIM, horseAttributeTotal.TIM));
					//horseArr.push(normalise(horseObj.SCR, horseAttributeTotal.SCR));
					horseArr.push(normalise(horseObj.JA, horseAttributeTotal.JA));
					horseArr.push(normalise(horseObj.TA, horseAttributeTotal.TA));
					horseArr.push(normalise(horseObj.JT, horseAttributeTotal.JT));
					horseArr.push(normalise(horseObj.BP, horseAttributeTotal.BP));
					//horseArr.push(normalise(horseObj.WET, horseAttributeTotal.WET));
					horseArr.push(normalise(horseObj.CRS, horseAttributeTotal.CRS));
					horseArr.push(normalise(horseObj.D, horseAttributeTotal.D));
					horseArr.push(normalise(horseObj.$, horseAttributeTotal.$));
					horseArr.push(normalise(horseObj.DLR, horseAttributeTotal.DLR));
					
					if ( horseObj.FP == 1 ) {
						horseObj.FPText = 'WIN';
					} else if ( horseObj.FP == 2 || horseObj.FP == 3 ) {
						horseObj.FPText = 'PLACE';
					} else {
						horseObj.FPText = 'NONE';
					}
					horseArr.push(horseObj.FPText);
					
					// if ( horseObj.NR > 0  && horseObj.FP == 1 ) { // Only output WIN 
					if ( horseObj.NR > 0 ) {
						input.push(horseArr);
					}
				}
				
				
			}

			//debug(input);
			
			//input = [['1', '2', '3', '4'], ['a', 'b', 'c', 'd']];
			stringify(input, function (err, output) {
				//debug(output);

				fs.writeFile("./esdump.csv", output, function (err) {
					if (err) {
						console.log(err);
					} else {
						console.log("The file was saved!");
					}
				});
			});

			//debug('response ' + response.hits);
			_.esclient.close();
		}, function (error) {
			debug(error.message);
			_.esclient.close();
		});
	}

	// For request promise handling.
	function normalise(value, total) {
		if ( typeof value == 'undefined' 
		|| typeof total == 'undefined' 
		|| value == 0 
		|| value == ''
		|| total == 0 
		|| total == '') {
			return 0;
		}
		
		return Math.round(value / total * 1000);	
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

function objIsEmpty(obj) {
	for (var prop in obj) {
		if (obj.hasOwnProperty(prop))
			return false;
	}
	return true;
}



