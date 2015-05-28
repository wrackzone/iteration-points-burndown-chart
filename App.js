var app = null;

Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    launch: function() {

    	app = this;

    	// app.iterationName = "Iteration 1";
    	app.iterationName = null;

    	app.iterationFilter = app.iterationName !== null  ? 
    		app._createIterationNameFilter(app.iterationName) :
    		app._createTodayFilter();

    	console.log("Filter",app.iterationFilter.toString());
    	
    	var fns = [
    		app.readIterations,
    		// readAllIterations,
    		app.readCFDs,
    		app.createChartData,
    		app.createChart
    	];

    	async.waterfall( fns , function(err,result) {
			console.log("final results",result);
		});


    },

    readIterations : function(callback) {
    	app._wsapiQuery(
    		{ 
    			model : "Iteration",
              	fetch : true,
              	filters : app.iterationFilter //[app._createTodayFilter()]
          	},
          	function(error,results) {
          		console.log("iteration results",results)
      			callback(null,results);
      		}
      	);
    },

    readCFDs : function(iterations,callback) {
    	app._wsapiQuery(
    		{ 
    			model : "IterationCumulativeFlowData",
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
	    		var dailyCfds = groupedByDay[key];
	    		return {
	    			day : key,
	    			scope : _.reduce(dailyCfds,function(memo,record) { 
	    				return memo + record.get("CardEstimateTotal") // Defined : 10 In-Progress : 8 = 18
	    			},0),
	    			todo : _.reduce(dailyCfds,function(memo,record) { 
	    				// also need to check for post Accepted values eg. "Released"
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

    createChart : function( iterationsData, callback ) {

    	var data = _.first(iterationsData).data;
    	console.log("data",data);

    	var store = Ext.create('Ext.data.JsonStore', {
    		fields : ["day","scope","todo"],
		    data: data
		    // { day : "", scope: 0, todo : 0}
	        // { temperature: 58, date: new Date(2011, 1, 1, 8) },
		});

    	
    	var chart = Ext.create('Ext.chart.Chart', {
		   // renderTo: Ext.getBody(),
		   width: app.getWidth(),
		   height: app.getHeight(),
		   store: store,
		    series: [
		        {
		            type: 'line',
		            xField: 'day',
		            yField: 'scope'
		        },
		        {
		            type: 'line',
		            xField: 'day',
		            yField: 'todo'
		        }
	    	],
		   	axes: [
		        {
		            title: 'Points',
		            type: 'Numeric',
		            position: 'left',
		            fields: ['scope','todo'],
		        },
		        {
		            title: 'Day',
		            type: 'Category',
		            position: 'bottom',
		            fields: ['day'],
		            // dateFormat: 'ga'
		        }
		    ]
		});

		app.add(chart);

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
