var app = null;

Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    launch: function() {

    	app = this;

    	app.iterationName = "Iteration 1";

    	app.iterationFilter = app.iterationName !== null  ? 
    		app._createIterationNameFilter(app.iterationName) :
    		app._createTodayFilter();

    	console.log("Filter",app.iterationFilter.toString());
    	
    	var fns = [
    		app.readIterations,
    		// readAllIterations,
    		app.readCFDs,
    		app.createChartData,
    		// createCalculator,
    		// createChart
    	];

    	async.waterfall( fns , function(err,result) {
			console.log("final results",result);
		});


    },

    readIterations : function(callback) {
    	app._wsapiQuery(
    		{ model : "Iteration",
              fetch : true,
              filters : app.iterationFilter //[app._createTodayFilter()]
          	},
          	function(error,results) {
          		console.log("results",results)
      			callback(null,results);
      		}
      	);
    },

    readCFDs : function(iterations,callback) {
    	app._wsapiQuery(
    		{ model : "IterationCumulativeFlowData",
              fetch : true,
              filters : [app._createIterationsFilter(iterations)]
          	},
          	function(error,results) {
          		console.log("results",results)
      			callback(null,results,iterations);
      		}
      	);
    },

    createChartData : function(cfds,iterations,callback) {

    	var iterationKey = function(i) {
    		return i.raw.Name + moment(i.raw.StartDate).format("YYYY-MM-DD") + moment(i.raw.EndDate).format("YYYY-MM-DD");
    	}

    	var summarizeIteration = function(cfds) {
    		var groupedByDay = _.groupBy(cfds,function(cfd) { return moment(cfd.raw.CreationDate).format("YYYY-MM-DD") /* ISO Value */ } );

	    	var dailyTotals = _.map(_.keys(groupedByDay),function(key) {
	    		var cfds = groupedByDay[key];
	    		return {
	    			day : key,
	    			scope : _.reduce(cfds,function(memo,record) { 
	    				return memo + record.get("CardEstimateTotal")
	    			},0),
	    			todo : _.reduce(cfds,function(memo,record) { 
	    				// also need to check for post Accepted values
	    				return memo + ( record.get("CardState") !== "Accepted" ? record.get("CardEstimateTotal") : 0)
	    			},0)
	    		}
	    	})
	    	return dailyTotals;
    	}

    	var uniqueIterations = _.groupBy(iterations,iterationKey);
    	console.log("icfds",uniqueIterations);

    	var iterationsData = _.map( _.keys(uniqueIterations), function(iKey) {
    		var iOids = _.map(uniqueIterations[iKey], function(ui) { return ui.get("ObjectID") });
    		console.log("iOids",iOids);
    		var uiCFDS = _.filter(cfds,function(cfdRec) {
    			return iOids.indexOf(cfdRec.get("IterationObjectID"))!==-1;
    		})
    		return { key : iKey, 
    				 data : summarizeIteration(uiCFDS)
    		}
    	});

    	callback(null,iterationsData);
    },

    _createTodayFilter : function() {

    	var isoToday = Rally.util.DateTime.toIsoString(new Date(), false);
    	console.log(isoToday);

		var filter = Ext.create('Rally.data.wsapi.Filter', {
     		property: 'StartDate',
     		operator: '<=',
     		value: isoToday
     	});
     	filter = filter.and({
     		property: 'EndDate',
     		operator: '>=',
     		value: isoToday
     	});

     	return filter;
	},

	_createIterationNameFilter : function(name) {

		var filter = Ext.create('Rally.data.wsapi.Filter', {
     		property: 'Name',
     		operator: '=',
     		value: name
     	});
     	return filter;
	},

	_createIterationsFilter : function(iterations) {

		var filter = null;

		_.each(iterations,function(i) {

			var f = Ext.create('Rally.data.wsapi.Filter', {
     			property: 'IterationObjectID',
     			operator: '=',
     			value: i.get("ObjectID")
     		});

			filter = (filter===null) ? f : filter.or(f);

		})

     	return filter;
	},

    // generic function to perform a web services query    
	_wsapiQuery : function( config , callback ) {
		
	    Ext.create('Rally.data.WsapiDataStore', {
	        autoLoad : true,
	        limit : "Infinity",
	        model : config.model,
	        fetch : config.fetch,
	        filters : config.filters,
	        listeners : {
	            scope : this,
	            load : function(store, data) {
	                callback(null,data);
	            }
	        }
	    });
	}
});
