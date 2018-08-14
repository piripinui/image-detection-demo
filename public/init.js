var sessionToken,
map,view, markerFeature, markerSource, poleSource, heading,
routeSource, routeStyle, currentRoute, followBearing,
setDestinationMode =false,
setOriginMode = false,
originCoord, destCoord,
styles = {
	pole: new ol.style.Style({
			image: new ol.style.Icon({
					src: 'location-arrow-outline-filled.png',
					scale: 0.1
			})
		})
},
satelliteOptions = {
	"mapType" : "satellite",
	"language" : "gb-GB",
	"region" : "GB",
	"overlay" : false,
	"scale" : "scaleFactor1x",
	"layerTypes" : ["layerRoadmap", "layerStreetview"]
},
roadOptions = {
	"mapType" : "satellite",
	"language" : "gb-GB",
	"region" : "GB",
	"layerTypes" : ["layerRoadmap"],
	"overlay" : "true",
	"scale" : "scaleFactor1x"
},
streetviewOptions = {
	"mapType" : "streetview",
	"language" : "gb-GB",
	"region" : "GB"
},
requestOptions = {
	"mapType" : "roadmap",
	"language" : "gb-GB",
	"region" : "GB",
	"layerTypes" : ["layerRoadmap", "layerStreetview"],
	"overlay" : true,
	"scale" : "scaleFactor1x",
	"styles" : [{
			"stylers" : [{
					"hue" : "#000000"
				}, {
					"saturation" : -20
				}
			]
		}, {
			"featureType" : "road",
			"elementType" : "geometry",
			"stylers" : [{
					"lightness" : 100
				}, {
					"visibility" : "simplified"
				}
			]
		}, {
			"featureType" : "water",
			"stylers" : [{
					"color" : "#000000"
				}
			]
		}, {
			"featureType" : "landscape.natural.landcover",
			"stylers" : [{
					"color" : "#808080"
				}
			]
		}, {
			"featureType" : "poi.park",
			"stylers" : [{
					"color" : "#808080"
				}
			]
		}, {
			"featureType" : "road.arterial",
			"elementType" : "labels.text.fill"
		}
	]
},
tileApiKey,
googleMapsApiKey,
satelliteSessionToken,
roadSessionToken,
streetviewSessionToken,
streetviewPanos, streetviewMetadata,
panorama;

function getSession(options, maptype) {
	var dfd = $.Deferred();

	$.ajax({
		url : "https://www.googleapis.com/tile/v1/createSession?key=" + tileApiKey,
		type : "POST",
		data : JSON.stringify(options),
		contentType : "application/json; charset=utf-8",
		dataType : "json",
		success : function (data) {
			//console.log("Session token request succeeded");
			var d = new Date(0); // The 0 there is the key, which sets the date to the epoch

			switch (maptype) {
				case 'satellite': {
						satelliteSessionToken = data.session;
						//console.log("Satellite session: " + satelliteSessionToken);
						d.setUTCSeconds(data.expiry);
						console.log("Satellite session expiry: " + data.expiry +" (" + d + ")")
						break;
					}
				case 'roadmap': {
						roadSessionToken = data.session;
						//console.log("Road session: " + roadSessionToken);
						break;
					}
				case 'streetview': {
						streetviewSessionToken = data.session;
						//console.log("Streetview session: " + streetviewSessionToken);
					}
			}
			dfd.resolve();
		}
	});

	return dfd.promise();
}

function getSatelliteSession() {
	return getSession(satelliteOptions, 'satellite');
}

function getStreetviewSession() {
	return getSession(streetviewOptions, 'streetview');
}

function updateAttribution(map) {
	var extent = map.getView().calculateExtent(map.getSize());
	var projectedExtent = ol.proj.transformExtent(extent, 'EPSG:3857', 'EPSG:4326');

	//console.log(projectedExtent);

	$.ajax({
		url : "https://www.googleapis.com/tile/v1/viewport?session=" + satelliteSessionToken + "&zoom=" + map.getView().getZoom() + "&north=" + projectedExtent[3] + "&south=" + projectedExtent[1] + "&east=" + projectedExtent[2] + "&west=" + projectedExtent[0] + "&key=" + tileApiKey,
		type : "GET",
		success : function (data) {
			var zoom = view.getZoom();
			
			if (zoom >= 15)
				$("#attribution").css("color", "white");
			else
				$("#attribution").css("color", "black");
			
			$('#attribution span').text(data.copyright);
		}
	})
}

function getPanoId(locations) {
	var dfd = $.Deferred();
	
	$.ajax({
		url : "https://www.googleapis.com/tile/v1/streetview/panoIds?key=" + tileApiKey + "&session=" + streetviewSessionToken,
		type : "POST",
		data : JSON.stringify(locations),
		contentType : "application/json; charset=utf-8",
		dataType : "json",
		success : function (data) {
			//console.log("Streetview pano id request succeeded");
			//console.log(data);
			streetviewPanos = data;
			dfd.resolve();
		}
	});
	
	return dfd.promise();
}

function getStreetviewMetadata() {
	var dfd = $.Deferred();
	
	$.ajax({
		url : "https://www.googleapis.com/tile/v1/streetview/metadata?key=" + tileApiKey + "&panoId=" + streetviewPanos.panoIds[0] + "&session=" + streetviewSessionToken,
		type : "GET",
		contentType : "application/json; charset=utf-8",
		dataType : "json",
		success : function (data) {
			//console.log("Streetview metadata request request succeeded");
			//console.log(data);
			streetviewMetadata = data;
			dfd.resolve();
		},
		error: function(err) {
			dfd.reject(err);
		}
	});
	
	return dfd.promise();
}

function toDataURL(url, callback) {
	var xhr = new XMLHttpRequest();
	xhr.onload = function() {
		var reader = new FileReader();
		reader.onloadend = function() {
		  callback(reader.result);
		}
		reader.readAsDataURL(xhr.response);
	};
	xhr.open('GET', url);
	xhr.responseType = 'blob';
	xhr.send();
}

function getStreetviewTiles() {
	toDataURL("https://www.googleapis.com/tile/v1/streetview/tiles/2/0/0?key=" + tileApiKey + "&panoId=" + streetviewPanos.panoIds[0] + "&session=" + streetviewSessionToken, function(dataUrl) {
		$("#streetview").attr("src", dataUrl);
	});
}

function makeAddressString() {
	// Constructs a string for display from address components.
	var addressString = "";
	
	for (var i = streetviewMetadata.addressComponents.length - 2; i >= 0; i--) {
		var aComponent = streetviewMetadata.addressComponents[i];
		
		if (i > 0) {
			addressString += aComponent.longName + ",\n";
		}
		else {
			addressString += aComponent.longName;
		}
	}
	
	return addressString;
}

function getTileUrl(pano, zoom, tileX, tileY) {
	return "/streetviewtile?zoom=" + zoom + "&tilex=" + tileX + "&tiley=" + tileY;
}

function getPanoramaData(pano) {
	//console.log("Getting panorama...");
	if (pano == "custom") {
		return {
		  location: {
			pano: getPano(),  
			description: makeAddressString(),
			latLng: new google.maps.LatLng(streetviewMetadata.lat, streetviewMetadata.lng)
		  },
		  links: streetviewMetadata.links,
		  copyright: 'Imagery ' + streetviewMetadata.copyright,
		  tiles: {
			tileSize: new google.maps.Size(streetviewMetadata.tileWidth, streetviewMetadata.tileHeight),
			worldSize: new google.maps.Size(streetviewMetadata.imageWidth, streetviewMetadata.imageHeight),
			centerHeading: getHeading(),
			getTileUrl: getTileUrl
		  }
		};
	}
}

function getPano() {
	return streetviewMetadata.panoId;
}

function getHeading() {
	//console.log("Returning SV heading of " + streetviewMetadata.heading);
	if (streetviewMetadata.heading < 0)
		streetviewMetadata.heading = 360 + streetviewMetadata.heading;
	return streetviewMetadata.heading;
}

function initPanorama(dfd) {
	//console.log("Creating panorama...");
	
	if (!panorama) {
		panorama = new google.maps.StreetViewPanorama(
			document.getElementById('street-view'),
			{
				pano: getPano(),
				pov: {
					heading: getHeading(),
					pitch: 0
				}
			});
			
		panorama.addListener('pano_changed', function() {
			//console.log("Streetview: pano_changed");
			//console.log("Panorama moved");
		});
		
		panorama.addListener('position_changed', function() {
			//console.log("Streetview: position_changed");
			var pos = panorama.getPosition();
			var coord = ol.proj.transform([pos.lng(), pos.lat()], 'EPSG:4326', 'EPSG:3857'); 
			//console.log("Panorama position changed: " + pos);
			view.setCenter(coord);
			setMarker(coord);
			heading = panorama.getPov().heading;
		});
		
		panorama.addListener('pov_changed', function() {
			//console.log("Streetview: pov_changed");
			heading = panorama.getPov().heading;
			// Update marker.
			var defaultStyle = new ol.style.Style({
				image: new ol.style.Icon({
						src: 'location-arrow-outline-filled.png',
						scale: 0.1,
						rotation: Math.radians(heading)
				})
			});
			markerFeature.setStyle(defaultStyle);
		});
		
		if (typeof heading == "undefined")
			heading = 0;

			
		// Register a provider for the custom panorama.
		panorama.registerPanoProvider(function(pano) {
			return getPanoramaData(pano);
		});
		
		panorama.addListener('links_changed', function() {
			//console.log("Streetview: links_changed");
			if (panorama.getPano() === getPano()) {
				panorama.getLinks().push({
				  description: makeAddressString(),
				  heading: getHeading(),
				  pano: getPano()
				});
			}
			else {
			  //console.log("Panorama ids do not match");
			}
		});
		dfd.resolve();
	}
	else {
		panorama.setPano(getPano());
		
		panorama.setPov({
			heading: getHeading(),
			pitch: 0
		});
		dfd.resolve();
	}
}

function Base64Encode(str, encoding = 'utf-8') {
    var bytes = new (TextEncoder || TextEncoderLite)(encoding).encode(str);        
    return base64js.fromByteArray(bytes);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function doAnalyse(evt, dfd) {
	//console.log("Performing analysis...");
	
	// Sleep to give streetview time to render image.
	await sleep(800);
	
	var cvs = $(".widget-scene-canvas");
	var data = cvs[cvs.length - 1];
	
	$("#analysis").append('<div class="loader">Processing...</div>');
	
	$.ajax({
		url: "/saveimage",
		type: "POST",
		contentType: "application/base64",
		data: data.toDataURL(),
		success: function(result) {
			console.log("Image analysis request successful (elapsed time = " + result.elapsed_time + ")");
			processedData = result.data;
			if ($("#processed")) {
				$("#processed").remove();
			}
			$("#results").append('<img id="processed"></img>');
			$("#processed").attr("src", "data:image/jpeg;base64," + processedData);
			
			if ($("#object_table"))
				$("#object_table").remove();
			
			tab = '<table id="object_table"><tr><th>Equipment</th><th>Probability</th>';
			
			for (i = 0; i < result.classes.length; i++) {
				elems = result.classes[i].split(":");
				tab += "<tr><td>" + elems[0] + "</td><td>" + elems[1] + "</td></tr>";
				
				// Add markers.
				switch(elems[0]) {
					case 'pole': 
						var gCoord= panorama.getPosition();
						var coord = ol.proj.transform([gCoord.lng(), gCoord.lat()], 'EPSG:4326', 'EPSG:3857'); ;
						poleFeature = new ol.Feature(new ol.geom.Point(coord));
						
						var poleStyle = new ol.style.Style({
							image: new ol.style.Icon({
									src: 'pole_circle.png',
									scale: 0.005,
									rotation: Math.radians(panorama.getPov().heading)
							})
						});
						poleFeature.setStyle(poleStyle);
	
						poleSource.addFeature(poleFeature);
						break;
					case 'streetlight': 
						var gCoord= panorama.getPosition();
						var coord = ol.proj.transform([gCoord.lng(), gCoord.lat()], 'EPSG:4326', 'EPSG:3857'); ;
						slFeature = new ol.Feature(new ol.geom.Point(coord));
						
						var slStyle = new ol.style.Style({
							image: new ol.style.Icon({
									src: 'streetlight.png',
									scale: 0.01,
									rotation: Math.radians(panorama.getPov().heading)
							})
						});
						slFeature.setStyle(slStyle);
	
						slSource.addFeature(slFeature);
						break;
					case 'transformer':
						var gCoord= panorama.getPosition();
						var coord = ol.proj.transform([gCoord.lng(), gCoord.lat()], 'EPSG:4326', 'EPSG:3857'); ;
						txFeature = new ol.Feature(new ol.geom.Point(coord));
						
						var txStyle = new ol.style.Style({
							image: new ol.style.Icon({
									src: 'tx_arrow.png',
									scale: 0.05,
									rotation: Math.radians(panorama.getPov().heading)
							})
						});
						txFeature.setStyle(txStyle);
	
						txSource.addFeature(txFeature);
						break;
					case 'rusty_tx':
						var gCoord= panorama.getPosition();
						var coord = ol.proj.transform([gCoord.lng(), gCoord.lat()], 'EPSG:4326', 'EPSG:3857'); ;
						txFeature = new ol.Feature(new ol.geom.Point(coord));
						
						var txStyle = new ol.style.Style({
							image: new ol.style.Icon({
									src: 'rusty_tx_arrow.png',
									scale: 0.05,
									rotation: Math.radians(panorama.getPov().heading)
							})
						});
						txFeature.setStyle(txStyle);
	
						txSource.addFeature(txFeature);
						break;
					default:
						break;
				}
			}
			
			tab += "</table>";
			
			$("#objects").append(tab);
			
			$(".loader").remove();
			
			if (dfd)
				dfd.resolve();
		},
		error: function(err) {
			console.log("Image save failed.");
			if ($("#processed")) {
				$("#processed").remove();
			}
			if ($("#object_table"))
				$("#object_table").remove();
			
			$("#objects").append('<span id="object_table">Image processing failed</span>');
			$(".loader").remove();
			
			if (dfd)
				dfd.reject();
		}
	})
}
	
function doSweep() {
	console.log("Sweeping...");
}

function doSetRoute() {
	console.log("Setting route...");
	setOriginMode = true;
	setDestinationMode = true;
}

function setRoute(startCoord, endCoord) {
	if ($("#routecoordinfo"))
		$("#routecoordinfo").remove();
	
	originCoord = startCoord;
	destCoord = endCoord;
	
	$("#routecoords").append('<span id="routecoordinfo">Route: ' + startCoord[1].toFixed(2) + ', ' + startCoord[0].toFixed(2) + ':' + endCoord[1].toFixed(2) + ', ' + endCoord[0].toFixed(2) + '</span>');
}

function doFindRoute() {
	console.log("Finding route...");
	
	$.ajax({
		url: "/getdirections?origin=" + originCoord[1] + "," + originCoord[0] + "&destination=" + destCoord[1] + "," + destCoord[0],
		type: "GET",
		success: function(result) {
			console.log("Directions request succeeded: " + result);
			
			var geojsonFormat = new ol.format.GeoJSON();
			
			if (typeof currentRoute != "undefined")
				routeSource.removeFeature(currentRoute);
			
			currentRoute = geojsonFormat.readFeature(result, 
			{
				dataProjection: 'EPSG:4326',
				featureProjection: 'EPSG:3857'
			});
			
			routeSource.addFeature(currentRoute);
		}
	})
}

function doCapture() {
	console.log("Capturing...");
	console.log("Performing analysis...");
	
	var cvs = $(".widget-scene-canvas");
	var data = cvs[cvs.length - 1];
	
	$("#analysis").append('<div class="loader">Processing...</div>');
	
	$.ajax({
		url: "/storeimage",
		type: "POST",
		contentType: "application/base64",
		data: data.toDataURL(),
		success: function(result) {
			console.log("Image store requested successful");
			processedData = result.data;
			if ($("#processed")) {
				$("#processed").remove();
			}
			$("#results").append('<img id="processed"></img>');
			$("#processed").attr("src", "data:image/jpeg;base64," + processedData);
			
			$(".loader").remove();
		},
		error: function(err) {
			console.log("Image save failed.");
			if ($("#processed")) {
				$("#processed").remove();
			}
			if ($("#object_table"))
				$("#object_table").remove();
			
			$("#objects").append('<span id="object_table">Image processing failed</span>');
			$(".loader").remove();
		}
	})
}

function doFollowRoute() {
	if (typeof currentRoute != "undefined") {
		console.log("Following route...");
		
		var geoJSONFormat = new ol.format.GeoJSON();
		var line = geoJSONFormat.writeFeature(currentRoute, 
		{
				dataProjection: 'EPSG:4326',
				featureProjection: 'EPSG:3857'
		});
		
		var chunks = turf.lineChunk(JSON.parse(line), 10, {units: 'metres'});
		var tasks = []
		
		function createTask(coord, bearing) {
			tasks.push(function() {
				console.log("Executing streetview analysis with bearing = " + bearing);
				var dfd = $.Deferred();
				
				followBearing = bearing;
				
				var svPromise = showStreetview(coord);
				
				svPromise.then(function() {
					doAnalyse(null, dfd);
				});
				return dfd;
			});
		};
		
		for (i = 0; i < chunks.features.length; i++) {
			var aFeature = chunks.features[i];
			var firstPoint = aFeature.geometry.coordinates[0];
			var lastPoint = aFeature.geometry.coordinates[1];
			var bearing = turf.bearing(firstPoint, lastPoint);
			
			if (i == 0) {
				createTask(firstPoint, bearing);
			}
			
			createTask(lastPoint, bearing);
		};
		
		tasks.reduce(function(cur, next) {
			return cur.then(next);
		}, $.Deferred().resolve()).then(function() {
			console.log("Following complete");
		});
	}
	else {
		console.log("No route to follow");
	};
}

function init() {	
	var el = document.getElementById("analyse");
	if (el.addEventListener)
		el.addEventListener("click", doAnalyse, false);
	else if (el.attachEvent)
		el.attachEvent('onclick', doAnalyse);
	
	var el = document.getElementById("sweep");
	if (el.addEventListener)
		el.addEventListener("click", doSweep, false);
	else if (el.attachEvent)
		el.attachEvent('onclick', doSweep);
	
	var el = document.getElementById("capture");
	if (el.addEventListener)
		el.addEventListener("click", doCapture, false);
	else if (el.attachEvent)
		el.attachEvent('onclick', doCapture);
	
	var el = document.getElementById("setroute");
	if (el.addEventListener)
		el.addEventListener("click", doSetRoute, false);
	else if (el.attachEvent)
		el.attachEvent('onclick', doSetRoute);
	
	var el = document.getElementById("followroute");
	if (el.addEventListener)
		el.addEventListener("click", doFollowRoute, false);
	else if (el.attachEvent)
		el.attachEvent('onclick', doFollowRoute);
	
	$.ajax({
		url : "/gettileapikey",
		type : "GET",
		contentType : "text/plain; charset=utf-8",
		success : function (data) {
			console.log("Tile API key request succeeded");
			tileApiKey = data;
			
			$.ajax({
				url : "/getmapsapikey",
				type : "GET",
				contentType : "text/plain; charset=utf-8",
				success : function (data) {
					console.log("Maps API key request succeeded");
					googleMapsApiKey = data;
					var s = document.createElement("script");
					s.type = "text/javascript";
					s.src = "https://maps.googleapis.com/maps/api/js?key=" + googleMapsApiKey;
					$("head").append(s);
					
					setupMap();
				}
			});
		}
	});
}

function setMarker(coord) {
	if (typeof markerFeature != "undefined")
		markerSource.removeFeature(markerFeature);
	var defaultStyle = new ol.style.Style({
			image: new ol.style.Icon({
					src: 'location-arrow-outline-filled.png',
					scale: 0.1,
					rotation: Math.radians(heading)
			})
		});
	markerFeature = new ol.Feature(new ol.geom.Point(coord));
	markerFeature.setStyle(defaultStyle);
	
	markerSource.addFeature(markerFeature);
}

function showStreetview(latLon) {
	var dfd = $.Deferred();
	var coord = ol.proj.transform(latLon, 'EPSG:4326', 'EPSG:3857');     
	setMarker(coord);
			
	var locations = {
		'locations' : [
			{
				'lat' : latLon[1],
				'lng' : latLon[0]						
			}
		],
		'radius' : 50
	};
	
	$.ajax({
		url : "/initstreetview?lat=" + latLon[1] + "&lon=" + latLon[0],
		type : "GET",
		contentType : "application/json; charset=utf-8",
		dataType : "json",
		success : function (data) {
			//console.log("Tile server initialisation succeeded");
			streetviewMetadata = data;
			
			if (followBearing) {
				streetviewMetadata.heading = followBearing;
				followBearing = null;
			}
			
			//console.log("Pano id = " + streetviewMetadata.panoId + ", lat = " + streetviewMetadata.lat + ", lon = " + streetviewMetadata.lng);
			//console.log("Request coordinates = " + latLon[1] + ", " + latLon[0]);

			initPanorama(dfd);
		}
	});
	
	return dfd;
}

function setupMap() {
	var attribution = new ol.control.Attribution({
		collapsible : false
	});
	getSatelliteSession()
	.then(function () {

		var satelliteSource = new ol.source.XYZ({
				url : 'https://www.googleapis.com/tile/v1/tiles/{z}/{x}/{y}?session=' + satelliteSessionToken + '&key=' + tileApiKey
			});

		//console.log("Created Google tile source using " + satelliteSource.getUrls()[0]);
		
		markerSource = new ol.source.Vector({wrapX: false});
		
		var stroke = new ol.style.Stroke({color: 'black', width: 2});
		var fill = new ol.style.Fill({color: 'red'});
		  
		var defaultStyle = new ol.style.Style({
			image: new ol.style.Icon({
					src: 'location-arrow-outline-filled.png',
					scale: 0.1
			})
		});

		var vector = new ol.layer.Vector({
			source: markerSource,
			style: defaultStyle
		});
		
		poleSource = new ol.source.Vector({wrapX: false});
		
		var poles = new ol.layer.Vector({
			source: poleSource,
			style: defaultStyle
		});
		
		txSource = new ol.source.Vector({wrapX: false});
		
		var txs = new ol.layer.Vector({
			source: txSource,
			style: defaultStyle
		});
		
		slSource = new ol.source.Vector({wrapX: false});
		
		var streetlights = new ol.layer.Vector({
			source: slSource,
			style: defaultStyle
		});
		
		rustyTxSource = new ol.source.Vector({wrapX: false});
		
		var rustyTxs = new ol.layer.Vector({
			source:rustyTxSource,
			style: defaultStyle
		});
		
		routeSource = new ol.source.Vector({wrapX: false});
		
		routeStyle = new ol.style.Style({
			stroke: new ol.style.Stroke({
			  color: "#ff0000",
			  width: 5
			})
		});
		
		var routes = new ol.layer.Vector({
			source:	routeSource,
			style: 	routeStyle
		});

		view = new ol.View({
					center : [0, 0],
					zoom : 2
				});
		map = new ol.Map({
				layers : [
					new ol.layer.Tile({
						source : satelliteSource
					}),
					routes,
					vector,
					poles,
					txs,
					rustyTxs,
					streetlights
				],
				controls : ol.control.defaults({
					attribution : false
				}).extend([attribution]),
				target : 'map',
				view : view
			});
			
		$.ajax({
			url : "/initstreetviewsession",
			type : "GET",
			contentType : "application/json; charset=utf-8",
			dataType : "json",
			success : function (data) {
				//console.log("Streetview session established.");
				streetviewSessionToken = data;
			}
		});

		map.on("moveend", function (e) {
			//console.log("Map moved");
			updateAttribution(e.map);
		});
		
		map.on('singleclick', function(evt) {      
            var latLon = ol.proj.transform(evt.coordinate, 'EPSG:3857', 'EPSG:4326');                                           
			//console.log("Click event: " + latLon[0] + ", " + latLon[1]);	
			
			if (setOriginMode) {
				originCoord = latLon;
				setOriginMode = false;
				return;
			}
			
			if (setDestinationMode) {
				destCoord = latLon;
				setDestinationMode = false;
				
				setRoute(originCoord, destCoord);
				
				doFindRoute();
				
				return;
			}
			
			var aPromise = showStreetview(latLon);
			aPromise.then(function() {
				//console.log("Streetview display complete");
			});
		});  

		function checkSize() {
			var small = map.getSize()[0] < 600;
			attribution.setCollapsible(small);
			attribution.setCollapsed(small);
		}

		window.addEventListener('resize', checkSize);
		checkSize();
	});
	
	getStreetviewSession()
	.then(function() {
		//console.log("Got streetview session token.");
	});
}

// Converts from degrees to radians.
Math.radians = function(degrees) {
  return degrees * Math.PI / 180;
};
 
// Converts from radians to degrees.
Math.degrees = function(radians) {
  return radians * 180 / Math.PI;
};