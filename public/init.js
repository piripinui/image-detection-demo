var sessionToken,
map,view, markerFeature, markerSource, poleSource, heading,
routeSource, routeStyle, currentRoute, followBearing,
poleIntersectVectors, rustytxIntersectVectors,
setDestinationMode =false,
setOriginMode = false,
originCoord, destCoord, startFeature, endFeature,
downloadFeatures = {
	type: "FeatureCollection",
	features: []
},
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
			var d = new Date(0); // The 0 there is the key, which sets the date to the epoch

			switch (maptype) {
				case 'satellite': {
						satelliteSessionToken = data.session;
						d.setUTCSeconds(data.expiry);
						console.log("Satellite session expiry: " + data.expiry +" (" + d + ")")
						break;
					}
				case 'roadmap': {
						roadSessionToken = data.session;
						break;
					}
				case 'streetview': {
						streetviewSessionToken = data.session;
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
	if (streetviewMetadata.heading < 0)
		streetviewMetadata.heading = 360 + streetviewMetadata.heading;
	return streetviewMetadata.heading;
}

function initPanorama(dfd) {
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

		});
		
		panorama.addListener('position_changed', function() {

			var pos = panorama.getPosition();
			var coord = ol.proj.transform([pos.lng(), pos.lat()], 'EPSG:4326', 'EPSG:3857'); 
			view.setCenter(coord);
			setMarker(coord);
			heading = panorama.getPov().heading;
		});
		
		panorama.addListener('pov_changed', function() {
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
			if (panorama.getPano() === getPano()) {
				panorama.getLinks().push({
				  description: makeAddressString(),
				  heading: getHeading(),
				  pano: getPano()
				});
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
  
function createDownloadLink() {
	if ($("#download_link"))
		$("#download_link").remove();
	
	$("#download").append('<a id="download_link" href="data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(downloadFeatures)) + '" download="downloadFeatures.geojson">Download GeoJSON</a>');
	$("#download").css("background-color", "#F2F2F2");
	$("#download").css("border", "0.1em solid #FFFFFF");
}

function addFeaturesForDownload(aFeature, gCoord, type) {
	downloadFeatures.features.push({
		type: "Feature",
		properties: {
			type: type
		},
		geometry: {
			type: "Point",
			coordinates: [gCoord.lng(), gCoord.lat()]
		}
	});
	if (downloadFeatures.features.length > 0)
		createDownloadLink();
}

function getTelemetry(detectionType, detectionClass, imgWidth, pos) {
	var xmin = Math.round(detectionClass.xmin * imgWidth);
	var xmax = Math.round(detectionClass.xmax * imgWidth);
	// Use the min corner as position rather than the midpoint between the width of the pole? Ok for "L" poles but not "T" poles. Should classify and train for these types separately.
	//var xmid = xmin + (xmax - xmin) / 2;
	var xmid = xmin;
	var zoom = typeof panorama.getZoom() !== 'undefined' ? panorama.getZoom() : 1;
	var fov = 180 / Math.pow(2, zoom);
	$("#fov").text(fov.toFixed(2) + "°");
	var angRatio = fov / imgWidth;
	var ang = xmid * angRatio - (fov / 2);
	var heading = panorama.getPov().heading;
	
	var direction = heading + ang;
	var startPoint = turf.point([pos[0], pos[1]]);
	var options = {
		units: 'kilometers'
	};
	var vectorDist = 35 / 1000; // 30 metres.

	if (direction > 180)
		direction = -(360 - direction);
	
	var endPoint = turf.rhumbDestination(startPoint, vectorDist, direction, options);
	var locVector = turf.lineString([startPoint.geometry.coordinates, endPoint.geometry.coordinates]);
	
	locVector.properties.routeheading = heading;

	return locVector;	
}

async function doAnalyse(evt, position, bearing, dfd) {
	// Sleep to give streetview time to render image.
	await sleep(800);
	
	if (!position) {
		var pos = panorama.getPosition();
		position = {
			lat: pos.lat(),
			lng: pos.lng()
		}
	}
	else {
		position = {
			lat: position[1],
			lng: position[0]
		}
	}
	if (!bearing)
		bearing = getHeading();
	
	var cvs = $(".widget-scene-canvas");
	var data = cvs[cvs.length - 1];
	
	if (typeof data == "undefined") {
		console.log("No streetview image to process");
		if ($("#processed")) {
			$("#processed").remove();
		}
		if ($("#object_table"))
			$("#object_table").remove();
		
		$("#objects").append('<div id="object_table" style="position:relative;margin-top:50%;padding=10px;"><span>Please select a Streetview location first</span></div>');
		return;
	}
	
	$("#analysis").append('<div class="loader">Processing...</div>');
	
	var imageInfo = {
		base64Data: data.toDataURL(),
		position: position,
		bearing: bearing
	};
	
	$.ajax({
		url: "/analyseimage",
		type: "POST",
		contentType: "application/json; charset=utf-8",
		data: JSON.stringify(imageInfo),
		dataType: 'json',
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
			
			tab = '<table id="object_table"><tr><th>Equipment</th><th>Probability</th><th>Heading</th>';
			
			for (i = 0; i < result.classes.length; i++) {
				var type = result.classes[i].type;
				var percent = result.classes[i].probability;
				
				// Figure out direction of identified object.
				var xmin = Math.round(result.classes[i].xmin * result.imgWidth);
				var xmax = Math.round(result.classes[i].xmax * result.imgWidth);
				var xmid = xmin + (xmax - xmin) / 2;
				var fov = 180 / Math.pow(2,panorama.getZoom()); 
				$("#fov").text(fov.toFixed(2) + "°");
				var angRatio = fov / result.imgWidth;
				var ang = xmid * angRatio - (fov / 2);
				var gCoord= panorama.getPosition();
				var coord = ol.proj.transform([gCoord.lng(), gCoord.lat()], 'EPSG:4326', 'EPSG:3857');
				var pos = [gCoord.lng(), gCoord.lat()];
				var heading = panorama.getPov().heading;
				
				tab += "<tr><td>" + type + "</td><td>" + percent + "</td><td>" + ang.toFixed(2) + "°</td></tr>";
				
				// Add markers.
				switch(type) {
					case 'pole': 
						poleFeature = new ol.Feature({
							geometry: new ol.geom.Point(coord),
							streetviewBearing: heading,
							detectionBearing: ang
						});
						
						var poleStyle = new ol.style.Style({
							image: new ol.style.Icon({
								src: 'pole_circle.png',
								scale: 0.005,
								rotation: Math.radians(heading)
							})
						});
						poleFeature.setStyle(poleStyle);
	
						poleSource.addFeature(poleFeature);
						
						addFeaturesForDownload(poleFeature, gCoord, type);	

						var locVector = getTelemetry(type, result.classes[i], result.imgWidth, pos);
						poleIntersectVectors.features.push(locVector);
						
						// Show the vector on the map.
						var geojsonFormat = new ol.format.GeoJSON();
						
						var vecFeature = geojsonFormat.readFeature(locVector,
						{
							dataProjection: 'EPSG:4326',
							featureProjection: 'EPSG:3857'
						});
						
						var vecStyle = new ol.style.Style({
							stroke: new ol.style.Stroke({
								color: '#319FD3',
								width: 2
							}),
						});
						vecFeature.setStyle(vecStyle);
						
						poleSource.addFeature(vecFeature);
						
						break;
					case 'streetlight': 
						slFeature = new ol.Feature({
							geometry: new ol.geom.Point(coord),
							streetviewBearing: bearing,
							detectionBearing: ang
						});
						
						var slStyle = new ol.style.Style({
							image: new ol.style.Icon({
								src: 'streetlight.png',
								scale: 0.01,
								// rotation: Math.radians(panorama.getPov().heading).
							})
						});
						slFeature.setStyle(slStyle);
	
						slSource.addFeature(slFeature);
						
						addFeaturesForDownload(slFeature, gCoord, type);
						
						break;
					case 'transformer':
						txFeature = new ol.Feature({
							geometry: new ol.geom.Point(coord),
							streetviewBearing: bearing,
							detectionBearing: ang
						});
						
						var txStyle = new ol.style.Style({
							image: new ol.style.Icon({
								src: 'tx_arrow.png',
								scale: 0.05,
								rotation: Math.radians(panorama.getPov().heading)
							})
						});
						txFeature.setStyle(txStyle);
	
						txSource.addFeature(txFeature);
						addFeaturesForDownload(txFeature, gCoord, type);
						
						var locVector = getTelemetry(type, result.classes[i], result.imgWidth, pos);
						txIntersectVectors.features.push(locVector);
						
						break;
					case 'rusty_tx':
						txFeature = new ol.Feature({
							geometry: new ol.geom.Point(coord),
							streetviewBearing: bearing,
							detectionBearing: ang
						});
						
						var txStyle = new ol.style.Style({
							image: new ol.style.Icon({
								src: 'rusty_tx_arrow.png',
								scale: 0.05,
								rotation: Math.radians(panorama.getPov().heading)
							})
						});
						txFeature.setStyle(txStyle);
	
						txSource.addFeature(txFeature);
						
						addFeaturesForDownload(txFeature, gCoord, type);
						
						var locVector = getTelemetry(type, result.classes[i], result.imgWidth, pos);
						rustytxIntersectVectors.features.push(locVector);
						
						break;
					case 'bad_tx':
						txFeature = new ol.Feature({
							geometry: new ol.geom.Point(coord),
							streetviewBearing: bearing,
							detectionBearing: ang
						});
						
						var txStyle = new ol.style.Style({
							image: new ol.style.Icon({
								src: 'tx_bad.png',
								scale: 0.05,
								rotation: Math.radians(panorama.getPov().heading)
							})
						});
						txFeature.setStyle(txStyle);
	
						txSource.addFeature(txFeature);
						
						addFeaturesForDownload(txFeature, gCoord, type);
						
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
	
/* function doSweep() {
	console.log("Sweeping...");
}
 */
function doSetRoute() {
	console.log("Setting route...");
	map.getTarget().style.cursor = 'pointer';
	setOriginMode = true;
	setDestinationMode = true;
}

function setRoute(startCoord, endCoord) {
	originCoord = startCoord;
	destCoord = endCoord;
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
	
	if (typeof data == "undefined") {
		console.log("No streetview image to process");
		if ($("#processed")) {
			$("#processed").remove();
		}
		if ($("#object_table"))
			$("#object_table").remove();
		
		$("#objects").append('<span id="object_table">Please select a Streetview location first</span>');
	}	
	
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

function createPointsFromIntersections(intersectVectors, mapSource, desc, icon) {
	// Loop over intersect vectors to find points.			
	for (i = 0; i < intersectVectors.features.length - 1; i++) {
		var line1 = intersectVectors.features[i];
		for (j = i + 1; j < intersectVectors.features.length; j++) {
			var line2 = intersectVectors.features[j];
			
			if (line1.geometry.coordinates[0][0] != line2.geometry.coordinates[0][0] && line1.geometry.coordinates[0][1] != line2.geometry.coordinates[0][1]) {
				// Only check if the intersection line is not co-incident.
				var intersects = turf.lineIntersect(line1, line2);

				if (intersects.features.length > 0) {
					var intersectPoint = intersects.features[0];
					var start = turf.point(line1.geometry.coordinates[0]);
					var end = turf.point(intersectPoint.geometry.coordinates);
					var distance = turf.distance(start, end, { units: 'kilometers'});
					var rb = turf.rhumbBearing(start, end);
					var ang = 90 - (rb + 90 - line1.properties.routeheading);
					var x = Math.abs(Math.cos(ang) * distance);
					var y = Math.abs(Math.sin(ang) * distance);
					var comp = Math.min(x, y);

					if (comp < 7 / 1000) {
						console.log("Intersection point is too close - ignoring.");
					}
					else {
						// Remove intersection vector from array so that it won't be processed later.
						var index = intersectVectors.features.indexOf(line2);
						if (index > -1)
							intersectVectors.features.splice(index, 1);
						// Add as a feature to the map.
						var geojsonFormat = new ol.format.GeoJSON();
							
						var vecFeature = geojsonFormat.readFeature(intersectPoint,
						{
							dataProjection: 'EPSG:4326',
							featureProjection: 'EPSG:3857'
						});
						
						var vecStyle = new ol.style.Style({
							image: new ol.style.Icon({
									src: icon,
									scale: 0.02
							})
						});
						vecFeature.setStyle(vecStyle);
						
						mapSource.addFeature(vecFeature);
						
						map.getView().setCenter(vecFeature.getGeometry().getCoordinates());
						
						var marker = new google.maps.Marker({
							position: {lat: intersectPoint.geometry.coordinates[1], lng: intersectPoint.geometry.coordinates[0]},
							map: panorama,
							title: desc
						});
					}
				}
			}
		}
	}
	console.log("Intersection points created.");
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
		
		var followIncrement = 10;
		
		var chunks = turf.lineChunk(JSON.parse(line), followIncrement, {units: 'metres'});
		var tasks = []
		
		function createTask(coord, bearing) {
			tasks.push(function() {
				var dfd = $.Deferred();
				
				followBearing = bearing;
				
				var svPromise = showStreetview(coord);
				
				svPromise.then(function() {
					doAnalyse(null, coord, bearing, dfd);
				});
				return dfd;
			});
		};
		
		poleIntersectVectors = {
			type: "FeatureCollection",
			features: []
		};
		
		rustytxIntersectVectors = {
			type: "FeatureCollection",
			features: []
		};
		
		txIntersectVectors = {
			type: "FeatureCollection",
			features: []
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
			var result = cur.then(next);
			var fail = cur.fail(next);
			return result ? result : fail;
		}, $.Deferred().resolve()).then(function() {
			createPointsFromIntersections(poleIntersectVectors, poleSource, "Potential Pole Location", 'calculated_route_icon.png');
			createPointsFromIntersections(rustytxIntersectVectors, poleSource, "Potential Rusty Transformer", 'round_blue.png');
			createPointsFromIntersections(txIntersectVectors, poleSource, "Potential Transformer Location", 'round_orange.png');
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
	
	/* var el = document.getElementById("sweep");
	if (el.addEventListener)
		el.addEventListener("click", doSweep, false);
	else if (el.attachEvent)
		el.attachEvent('onclick', doSweep); */
	
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
			streetviewMetadata = data;
			
			if (followBearing) {
				streetviewMetadata.heading = followBearing;
				followBearing = null;
			}

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
					poles,
					txs,
					rustyTxs,
					streetlights,
					vector
				],
				controls : ol.control.defaults({
					attribution : false
				}).extend([attribution]),
				target : document.getElementById('map'),
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
				originCoord = latLon
				var coord = evt.coordinate;
				
				if (startFeature)
					routeSource.removeFeature(startFeature);
				
				startFeature = new ol.Feature(new ol.geom.Point(coord));
				
				var startStyle = new ol.style.Style({
					image: new ol.style.Icon({
							src: 'route_icon.png',
							scale: 0.02
					})
				});
				startFeature.setStyle(startStyle);

				routeSource.addFeature(startFeature);
				
				setOriginMode = false;
				return;
			}
			
			if (setDestinationMode) {
				var coord = evt.coordinate;
				destCoord = latLon;
				setDestinationMode = false;
				
				if (endFeature)
					routeSource.removeFeature(endFeature);
				
				endFeature = new ol.Feature(new ol.geom.Point(coord));
				
				var endStyle = new ol.style.Style({
					image: new ol.style.Icon({
							src: 'route_icon.png',
							scale: 0.02
					})
				});
				endFeature.setStyle(endStyle);

				routeSource.addFeature(endFeature);
				
				setRoute(originCoord, destCoord);
				
				map.getTarget().style.cursor = '';
				
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