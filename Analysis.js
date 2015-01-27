var elasticsearch = require('elasticsearch');
var stringify = require('csv-stringify');
var fs = require('fs');

'use strict'
var analysis = new Analysis();
analysis.setOptions();
analysis.run();

/**
 * Analysis data from Elastic Search
 *
 * @class Analysis
 */
function Analysis() {

	// Clean reference to private class variables.
	var _ = this;

	// Set program options.
	var opts;
	_.opts = opts = {};

	// Elastic Search Client
	var esclient;
	_.esclient = esclient;
		
	var races;
	_.races = races = {};

	/**
	 * Set options for the class.
	 *
	 * @method setOptions
	 * @public
	 */
	_.setOptions = function () {

		_.opts.raceMinHorses = 9;
		_.opts.raceMaxHorses = 14;
		
		_.opts.tags = {NR : 'NR', CP: 'CP', HCP : 'HCP', CF : 'CF',  TIM : 'TIM', SCR : 'SCR', JA: 'JA', TA : 'TA', JT : 'JT', BP : 'BP', WET : 'WET', CRS : 'CRS', D : 'D', $ : '$', DLR : 'DLR'};		
		_.opts.tagsSortBy = '';
		
		_.opts.ElasticSearchHost = 'localhost:9200';
		_.opts.ElasticSearchIndex = 'localhost';
		_.opts.ElasticSearchType = 'neural';
		_.opts.ElasticSearchSize = 2000;

		_.esclient = new elasticsearch.Client({
				host : _.opts.ElasticSearchHost,
				log : 'warning'
			});

		//debugObject('Options', _.opts);
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
		//debug('getESDataPromise');

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
			"size" : _.opts.ElasticSearchSize,
			"sort" : [],
			"facets" : {}

		}

		// return promise.
		return _.esclient.search({
			index : _.opts.ElasticSearchIndex,
			type : _.opts.ElasticSearchType,
			body : dsl
		}).then(function (response) {
			debug('Retreived ' + response.hits.hits.length + ' records.')
			
			_.runMaxNormalSystem(response);
			_.runMaxIndividualAttributesSystem(response);
			
			debugObject('Races', _.races);

		}, function (error) {
			debug(error.message);
			_.esclient.close();
		});
	}

	
	/**
	 * runMaxNormalSystem
	 *
	 * @method runMaxNormalSystem
	 * @public
	 *
	 *  CP - Career performance assessment based on weight/class algorithms
	 *  CF - Current form measured by class/weight algorithms
	 *  TIM - Revolutionary time assessment (adjusted algorithm)
	 *  JA - Jockey ability algorithm
	 *  TA - Trainer ability algorithm
	 *  JT - Jockey/trainer combination algorithm
	 *  WT - Wet track performance algorithmCrs - Course suitability algorithm
	 *  D - Distance suitability algorithm
	 *  $ - Prizemoney earned algorithm
	 *  BP - Barrier position (course & distance) algorithm
	 *  DLR - days since last run algorithm
	 *  FP - Finish/Final Placing
	 */
	_.runMaxNormalSystem = function (response) {

		// response structure... see http://localhost:9200/_plugin/head/
	
		_.races.maxNormalSystem = {};
		
		_.races.totalRaces = 0;
		_.races.maxNormalSystem.totalRacesConsidered = 0;
		_.races.maxNormalSystem.outrightWinnersPicked = 0;
		_.races.maxNormalSystem.placesPicked = 0;		
		
	
		var racesES = response.hits.hits;
		
		// Loop though races.
		for (var raceIndex in racesES) {

			_.races.totalRaces++;
			
			var race = {};
			race.sum = {}; // Get sum of the neural data in order to normalise the data across races.
						
			race.maxNormalSystemSum = 0;
			race.maxNormalSystemSumFP = 0;
			
			var horsesES = racesES[raceIndex]['_source'].data.horses;
			race.ID = racesES[raceIndex]['_source'].raceID;
			race.horseCount = horsesES.length;
			
			//debug('===============================');
			//debug('Race ID: ' + race.ID);
			
			if ( !_.runRuleHorseCount(horsesES.length) ) {
				continue; // Skip this race.
			}
			
			//debug('Basic tests pass.');
			
			// Initialise race sum object.
			for(var name in _.opts.tags) {
				race.sum[name] = 0;
			}

			// Get sum of the neural data in order to normalise the data across races.
			for (var horseIndex in horsesES) {
				var horseObj = horsesES[horseIndex];
				for(var name in _.opts.tags) {
					race.sum[name] += horseObj[name]*1;
				}
			}

			// Normalise horse data and find Winner/Placeholders.
			for (var horseIndex in horsesES) {
				var horseObj = horsesES[horseIndex];		
				var normTotal = 0;
				if ( typeof horseObj.FP == 'undefined' ) {
					horseObj.FP = 99;
				}
				horseObj.FP = horseObj.FP*1;
				
				for(var name in _.opts.tags) {
					horseObj[name] = normalise(horseObj[name]*1, race.sum[name]);
					normTotal += horseObj[name];
				}
				
				horseObj['normTotal'] = normTotal;

				if ( race.maxNormalSystemSum < normTotal ) {
					race.maxNormalSystemSum = normTotal;
					race.maxNormalSystemSumFP = horseObj.FP;
				}
				
				//debugObject('horseObj', horseObj);
			}

			//debugObject('horsesES', horsesES);

			horsesES.sort(sortByNormTotal);
			
			if ( race.maxNormalSystemSum > 2600 ) {
				// Determine if system picked win/place/none.
				switch (horsesES[0].FP) {
					case 1: // WIN & PLACE
						_.races.maxNormalSystem.outrightWinnersPicked++;
						_.races.maxNormalSystem.placesPicked++;
					break;
					case 2: // PLACE ONLY
					case 3: // PLACE ONLY
						_.races.maxNormalSystem.placesPicked++;
					break;
					default:
				}
			} else {
				//debug('Skipping race maxNormalSystemSum too low ' + race.maxNormalSystemSum);
				continue;
			}
			
			//debug('runRaceRuleMaxNormal Race ID: ' + race.ID + ' Horses ' + race.horseCount + ' maxNormalSum ' + race.maxNormalSystemSum + ' maxNormalSumFP ' + race.maxNormalSystemSumFP );
			_.races.maxNormalSystem.totalRacesConsidered++;
			
		}
		
		_.races.maxNormalSystem.outrightWinnersPercentage = Math.round(_.races.maxNormalSystem.outrightWinnersPicked / _.races.maxNormalSystem.totalRacesConsidered * 1000) / 10;
		_.races.maxNormalSystem.placesPercentage = Math.round(_.races.maxNormalSystem.placesPicked / _.races.maxNormalSystem.totalRacesConsidered * 1000) / 10;
		
		
		_.esclient.close();	

	}
	
	
	/**
	 * runMaxIndividualAttributesSystem
	 *
	 * @method runMaxIndividualAttributesSystem
	 * @public
	 *
	 *  CP - Career performance assessment based on weight/class algorithms
	 *  CF - Current form measured by class/weight algorithms
	 *  TIM - Revolutionary time assessment (adjusted algorithm)
	 *  JA - Jockey ability algorithm
	 *  TA - Trainer ability algorithm
	 *  JT - Jockey/trainer combination algorithm
	 *  WT - Wet track performance algorithmCrs - Course suitability algorithm
	 *  D - Distance suitability algorithm
	 *  $ - Prizemoney earned algorithm
	 *  BP - Barrier position (course & distance) algorithm
	 *  DLR - days since last run algorithm
	 *  FP - Finish/Final Placing
	 */
	_.runMaxIndividualAttributesSystem = function (response) {

		// response structure... see http://localhost:9200/_plugin/head/
	
		_.races.maxIndividualAttributesSystem = {};

		for(var name in _.opts.tags) {
			_.races.maxIndividualAttributesSystem[name] = {};
			_.races.maxIndividualAttributesSystem[name].outrightWinnersPicked = 0;
			_.races.maxIndividualAttributesSystem[name].placesPicked = 0;
			_.races.maxIndividualAttributesSystem[name].totalRacesConsidered = 0;
			_.races.maxIndividualAttributesSystem[name].outrightWinnersPercentage = 0;
			_.races.maxIndividualAttributesSystem[name].placesPercentage = 0;
		}	
		
		var racesES = response.hits.hits;
		
		// Loop though races.
		for (var raceIndex in racesES) {

			var race = {};
			
			var horsesES = racesES[raceIndex]['_source'].data.horses;
			race.ID = racesES[raceIndex]['_source'].raceID;
			race.horseCount = horsesES.length;
			
			if ( !_.runRuleHorseCount(race.horseCount) ) {
				continue; // Skip this race.
			}
			
			//debugObject('horsesES', horsesES);
			
			// Initialise race sum object.
			for(var name in _.opts.tags) {
				_.sortHorsesES(horsesES, name);
				//debug('horsesES ' + name + ' ' + horsesES[0][name] + ' ' + horsesES[1][name] + ' ' + horsesES[2][name] + ' MaxFP ' + horsesES[0].FP);
				
				if ( horsesES[0][name] < 300 ) {
					continue;
				}
				
				switch (horsesES[0].FP) {
					case 1: // WIN & PLACE
						_.races.maxIndividualAttributesSystem[name].outrightWinnersPicked++;
						_.races.maxIndividualAttributesSystem[name].placesPicked++;
					break;
					case 2: // PLACE ONLY
					case 3: // PLACE ONLY
						_.races.maxIndividualAttributesSystem[name].placesPicked++;
					break;
					default:
				}
				
				_.races.maxIndividualAttributesSystem[name].totalRacesConsidered++;
			}
			
			//debug('maxIndividualAttributesSystem Race ID: ' + race.ID + ' Horses ' + race.horseCount);
			
		}

		for(var name in _.opts.tags) {
			if ( _.races.maxIndividualAttributesSystem[name].totalRacesConsidered > 0 ) {
				_.races.maxIndividualAttributesSystem[name].outrightWinnersPercentage = Math.round(_.races.maxIndividualAttributesSystem[name].outrightWinnersPicked / _.races.maxIndividualAttributesSystem[name].totalRacesConsidered * 1000) / 10;
				_.races.maxIndividualAttributesSystem[name].placesPercentage = Math.round(_.races.maxIndividualAttributesSystem[name].placesPicked / _.races.maxIndividualAttributesSystem[name].totalRacesConsidered * 1000) / 10;
			}
		}		
		
		_.esclient.close();	

	}

	
	
	/**
	 * runRuleHorseCount
	 *
	 * @method runRuleHorseCount
	 * @public
	 */
	_.runRuleHorseCount = function (horseCount) {

		if ( horseCount < _.opts.raceMinHorses || horseCount > _.opts.raceMaxHorses ) {
			//debug('Skipping race due to number of horses being ' + race.horseCount);
			return false;
		}			

		return true;		
	}

	/**
	 * sortHorsesES
	 *
	 * @method sortHorsesES
	 * @public
	 */
	_.sortHorsesES = function (horsesES, tagName) {
		//debug('sort by tagname ' + tagName);
		_.opts.tagsSortBy = tagName;
		horsesES.sort(_.sortHorsesESByTagName);
	}

	/**
	 * sortHorsesES
	 *
	 * @method sortHorsesES
	 * @public
	 */
	_.sortHorsesESByTagName = function (a, b) {

		if (a[_.opts.tagsSortBy] > b[_.opts.tagsSortBy]) {
			return -1;
		}
		if (a[_.opts.tagsSortBy] < b[_.opts.tagsSortBy]) {
			return 1;
		}

		return 0;
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
	
	function sortByIDAndColumnX(a,b) {

		var IDA = a[_.csvColumns.ID];
		var IDB = b[_.csvColumns.ID];

		var sortA = a[_.csvColumns.sort];
		var sortB = b[_.csvColumns.sort];

		//debug('a0: ' + a[0] + ' b0: ' + b[0] + ' a13: ' + a[13] + ' b13: ' + b[13]);
		
		if (IDA > IDB) {
			return -1;
		}
		if (IDA < IDB) {
			return 1;
		}

		if (sortA > sortB) {
			return -1;
		}
		if (sortA < sortB) {
			return 1;
		}

		return 0;
	}	
	
	function sortByNormTotal(a,b) {

		if (a.normTotal > b.normTotal) {
			return -1;
		}
		if (a.normTotal < b.normTotal) {
			return 1;
		}

		return 0;
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



