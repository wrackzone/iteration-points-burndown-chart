var app = null;

Ext.define('CustomApp', {
    extend: 'Rally.app.App',
    componentCls: 'app',
    launch: function() {

    	app = this;

    	app.iterationName = "Iteration 1";
    	// app.iterationName = null;

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

    	var daysArray = function(iteration) {
    		var days = [];
    		var m = moment(iteration.raw.StartDate);
    		while(m <= moment(iteration.raw.EndDate)) {
    			days.push( m.format("YYYY-MM-DD"));
    			m = m.add(1,"days");
    		}
    		console.log("days",days);
    		return days;
    	}

    	var iterationKey = function(i) {
    		return i.raw.Name + moment(i.raw.StartDate).format("YYYY-MM-DD") + moment(i.raw.EndDate).format("YYYY-MM-DD");
    	}

    	var calcIdeal = function( vals ) {
    		var max = _.max(vals);
    		console.log(vals,max);
    		return _.map(vals,function(v,i) {
    			// return (max / (vals.length)) * (vals.length - i);
    			return ((max / (vals.length - 1)) * (vals.length - (i+1)));
    		})
    	}

    	var summarizeIteration = function(cfds,iterations) {
    		var groupedByDay = _.groupBy(cfds,function(cfd) { return moment(cfd.raw.CreationDate).format("YYYY-MM-DD") /* ISO Value */ } );
    		var days = daysArray(_.first(iterations));
			var dailyTotals = _.map(days,function(day) {
	    		var dailyCfds = groupedByDay[day];
	    		if (_.isUndefined(dailyCfds)) {
	    			return { day : day, scope : "", todo : "" }
	    		} else {
	    			return {
		    			day : day,
		    			scope : _.reduce(dailyCfds,function(memo,record) { 
		    				return memo + record.get("CardEstimateTotal") // Defined : 10 In-Progress : 8 = 18
		    			},0),
		    			todo : _.reduce(dailyCfds,function(memo,record) { 
		    				// also need to check for post Accepted values eg. "Released"
		    				return memo + ( record.get("CardState") !== "Accepted" ? record.get("CardEstimateTotal") : 0)
		    			},0)
		    		}
		    	}
	    	});
	    	// create ideal line
	    	var ideal = calcIdeal( _.pluck( dailyTotals, 'scope'));
	    	_.each(dailyTotals,function(d,i){
	    		d['ideal'] = ideal[i];
	    	})
	    	console.log("ideal",ideal);

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
    		return { 
    			key : iKey, 
				data : summarizeIteration(uiCFDS,uniqueIterations[iKey]),
    			iterations : uniqueIterations[iKey]
    		}
    	});

    	callback(null,iterationsData);
    },

    createChart : function( iterationsData, callback ) {

    	// only chart the first item.
    	var data = _.first(iterationsData).data;

    	var store = Ext.create('Ext.data.JsonStore', {
    		fields : ["day","scope","todo","ideal"],
		    data: data
		});

		var tips = {
			trackMouse: true,  frame: true, border: true,
            height: 30, width: 150, fbar: null,
			renderer: function(storeItem, item) {
    			console.log(storeItem,item);
    			this.setTitle(storeItem.get('day') + " - " + item.series.yField + ' : ' + storeItem.data[item.series.yField] );
			}
   		};
    	
    	var chart = Ext.create('Ext.chart.Chart', {
		   // renderTo: Ext.getBody(),
		   width: app.getWidth(),
		   height: app.getHeight(),
		   colors: ['#000000', '#89A54E', '#AA4643', '#3366FF'],
		   store: store,
		   legend : true,
		   series: [
   		        {
		            type: 'line',
		            xField: 'day',
		            yField: 'ideal',
		            tips : tips
		       	},
		        {
		            type: 'line',
		            xField: 'day',
		            yField: 'scope',
		            tips : tips
		        },
		        {
		            type: 'line',
		            xField: 'day',
		            yField: 'todo',
		            tips : tips
		        }
	    	],
	    	tips: {
               trackMouse: true,
               style: 'background: # ',
               frame: true,
               border: true,
               borderWidth: 10,
               height: 30,
               width: 150,
               fbar: null,
               renderer: function(storeItem, item) {
					console.log("in tip", storeItem, item);
                  	this.setTitle(storeItem.get('day') + ': ' + storeItem.get('todo') + ' Points');
               }
			},
		   	axes: [
		        {
		            title: 'Points',
		            type: 'Numeric',
		            position: 'left',
		            fields: ['scope','todo','ideal'],
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
