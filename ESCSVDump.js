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
	
	var horsesArr;
	_.horsesArr = horsesArr = [];
	
	var races;
	_.races = races = {};

	var csvColumns;
	_.csvColumns = csvColumns = {};

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
		//debug('getESDataPromise');

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

		// return promise.
		return _.esclient.search({
			index : _.opts.ElasticSearchIndex,
			type : _.opts.ElasticSearchType,
			body : dsl
		}).then(function (response) {
			debug('Retreived ' + response.hits.hits.length + ' records.')
			
			_.buildDataStructure(response);
			_.outputCSV();
			//_.analyseHorses();
			
		}, function (error) {
			debug(error.message);
			_.esclient.close();
		});
	}

	
	/**
	 * buildDataStructure
	 *
	 * @method buildDataStructure
	 * @public
	 */
	_.buildDataStructure = function (response) {
		
		_.races.totalRaces = 0;
		_.races.totalRacesConsidered = 0;
		_.races.outrightWinnersPicked = 0;
		_.races.placesPicked = 0;

		/*
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
		*/		
		var columnCount = 0;
		_.csvColumns.ID = columnCount++;
		_.csvColumns.NR = columnCount++;
		_.csvColumns.CP = columnCount++;
		//_.csvColumns.HCP = columnCount++;
		_.csvColumns.CF = columnCount++;
		_.csvColumns.TIM = columnCount++;
		//_.csvColumns.SCR = columnCount++;
		_.csvColumns.JA = columnCount++;
		_.csvColumns.TA = columnCount++;
		_.csvColumns.JT = columnCount++;
		_.csvColumns.BP = columnCount++;
		//_.csvColumns.WET = columnCount++;
		_.csvColumns.CRS = columnCount++;
		_.csvColumns.D = columnCount++;
		_.csvColumns.$ = columnCount++;
		_.csvColumns.DLR = columnCount++;
		_.csvColumns.NormalSum = columnCount++;		
		
		
		for (var key in response.hits.hits) {
		
			var race = {};
			race.ID = response.hits.hits[key]['_source'].raceID;
			//debug('RaceID: ' + race.ID);
			
			race.maxNormalSum = 0;
			race.horseCount = 0;
			
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
				//horseAttributeTotal.SCR += horseObj.SCR*1;
				horseAttributeTotal.JA += horseObj.JA*1;
				horseAttributeTotal.TA += horseObj.TA*1;
				horseAttributeTotal.JT += horseObj.JT*1;
				horseAttributeTotal.BP += horseObj.BP*1;
				//horseAttributeTotal.WET += horseObj.WET*1;
				horseAttributeTotal.CRS += horseObj.CRS*1;
				horseAttributeTotal.D += horseObj.D*1;
				horseAttributeTotal.$ += horseObj.$*1;
				horseAttributeTotal.DLR += horseObj.DLR*1;
				// Note FP is answer.
				
				race.horseCount++;
			}
			
			//debugObject('horseAttributeTotal', horseAttributeTotal);
			
			if ( race.horseCount >= 8 && race.horseCount <= 14 ) {
			
				//debug('race.horseCount: ' + race.horseCount);
			
				for (var key2 in response.hits.hits[key]['_source'].data.horses) {
										
					var horseArr = [];
					var horseObj = response.hits.hits[key]['_source'].data.horses[key2];
										
					var normalNR = normalise(horseObj.NR, horseAttributeTotal.NR);
					var normalCP = normalise(horseObj.CP, horseAttributeTotal.CP);
					//var normalHCP = normalise(horseObj.HCP, horseAttributeTotal.HCP);
					var normalCF = normalise(horseObj.CF, horseAttributeTotal.CF);
					var normalTIM = normalise(horseObj.TIM, horseAttributeTotal.TIM);
					//var normalSCR = normalise(horseObj.SCR, horseAttributeTotal.SCR);
					var normalJA = normalise(horseObj.JA, horseAttributeTotal.JA);
					var normalTA = normalise(horseObj.TA, horseAttributeTotal.TA);
					var normalJT = normalise(horseObj.JT, horseAttributeTotal.JT);
					var normalBP = normalise(horseObj.BP, horseAttributeTotal.BP);
					//var normalWET = normalise(horseObj.WET, horseAttributeTotal.WET);
					var normalCRS = normalise(horseObj.CRS, horseAttributeTotal.CRS);
					var normalD = normalise(horseObj.D, horseAttributeTotal.D);
					var normal$ = normalise(horseObj.$, horseAttributeTotal.$);
					var normalDLR = normalise(horseObj.DLR, horseAttributeTotal.DLR);
					var normalSum = normalNR + normalCP + normalCF + normalTIM + normalJA + normalTA + normalJT + normalBP + normalCRS + normalD + normal$ + normalDLR;

					if ( horseObj.NR > 0 ) {
						
						if ( race.maxNormalSum < normalSum ) {
							race.maxNormalSum = normalSum;
							race.maxNormalSumHorseFP = horseObj.FP;
						}
						
						horseArr.push(race.ID);
						horseArr.push(normalNR);
						horseArr.push(normalCP);
						//horseArr.push(normalHCP);
						horseArr.push(normalCF);
						horseArr.push(normalTIM);
						//horseArr.push(normalSCR);
						horseArr.push(normalJA);
						horseArr.push(normalTA);
						horseArr.push(normalJT);
						horseArr.push(normalBP);
						//horseArr.push(normalWET);
						horseArr.push(normalCRS);
						horseArr.push(normalD);
						horseArr.push(normal$);
						horseArr.push(normalDLR);
						horseArr.push(normalSum);
						
						if ( horseObj.FP == 1 ) {
							horseObj.FPText = 'WIN';
						} else if ( horseObj.FP == 2 || horseObj.FP == 3 ) {
							horseObj.FPText = 'PLACE';
						} else {
							horseObj.FPText = 'NONE';
						}
						horseArr.push(horseObj.FPText);
						
						// if ( horseObj.NR > 0  && horseObj.FP == 1 ) { // Only output WIN 

						_.horsesArr.push(horseArr);
					}
				}
			}
			
			_.races.totalRaces++;
			
			_.analyseRace(race);
			
		}

		_.csvColumns.sort = _.csvColumns.NormalSum;
		_.horsesArr.sort(sortByIDAndColumnX);
		
		_.races.outrightWinnersPercentage = Math.round(_.races.outrightWinnersPicked / _.races.totalRacesConsidered * 1000) / 10;
		_.races.placesPercentage = Math.round(_.races.placesPicked / _.races.totalRacesConsidered * 1000) / 10;
		
		debugObject('Races', _.races);
		
		//debug(_.horsesArr);
		

		//debug('response ' + response.hits);
		_.esclient.close();	

	}
	
	
	/**
	 * outputCSV
	 *
	 * @method outputCSV
	 * @public
	 */
	_.outputCSV = function () {
	
		//_.horsesArr = [['1', '2', '3', '4'], ['a', 'b', 'c', 'd']];
		stringify(_.horsesArr, function (err, output) {
			//debug(output);

			fs.writeFile("./esdump.csv", output, function (err) {
				if (err) {
					console.log(err);
				} else {
					console.log("The file was saved!");
				}
			});
		});
	
	}	
	
	
	/**
	 * analyseRace
	 *
	 * @method analyseRace
	 * @public
	 */
	_.analyseRace = function (race) {

		if ( race.maxNormalSum > 2600 ) {
			_.races.totalRacesConsidered++;
			if ( race.maxNormalSumHorseFP == 1 ) {
				_.races.outrightWinnersPicked++;
			}
			if ( race.maxNormalSumHorseFP >= 1 && race.maxNormalSumHorseFP <= 3 ) {
				_.races.placesPicked++;
			}
		}
	
	}	
	
	
	/**
	 * analyseHorses
	 *
	 * @method analyseHorses
	 * @public
	 */
	_.analyseHorses = function () {

		var horsesArr = _.horsesArr.slice();
		
		_.csvColumns.sort = _.csvColumns.NormalSum;
		horsesArr.sort(sortByColumnX);

		debug('============================')
		debug('Analysis: Sort By Normal Sum');
		for (var key in horsesArr) {
			if ( key >= 10 ) break;
			debug(horsesArr[key]);
		}

		debug('============================')
		debug('Analysis: Sort By Jockey Ability');
		_.csvColumns.sort = _.csvColumns.JA;
		horsesArr.sort(sortByColumnX);
		
		for (var key in horsesArr) {
			if ( key >= 10 ) break;
			debug(horsesArr[key]);
		}

		
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
	
		// to get here a[0] == b[0]
		/*if ((posA == 'WIN' || posA == 'PLACE') && (posB == 'NONE')) {
			return -1;
		}
		if ((posB == 'NONE') && (posB == 'WIN' || posB == 'PLACE')) {
			return 1;
		}
		
		if (posA == 'WIN' && posB !== 'WIN') {
			return -1;
		}
		if (posA !== 'WIN' && posB == 'WIN') {
			return 1;
		}

		if (posA == 'PLACE' && posB != 'WIN') {
			return -1;
		}
		if (posA !== 'WIN' && posB == 'PLACE') {
			return 1;
		}*/

		if (sortA > sortB) {
			return -1;
		}
		if (sortA < sortB) {
			return 1;
		}

		return 0;
	}	
	
	function sortByColumnX(a,b) {

		var sortA = a[_.csvColumns.sort];
		var sortB = b[_.csvColumns.sort];

		if (sortA > sortB) {
			return -1;
		}
		if (sortA < sortB) {
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



