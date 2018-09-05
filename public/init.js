var sessionToken,
map,view, markerFeature, markerSource, poleSource, intersectSource, heading,
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

function addFeaturesForDownload(aFeature) {
	downloadFeatures.features.push(aFeature);
	if (downloadFeatures.features.length > 0)
		createDownloadLink();
}

function getTelemetry(detectionType, detectionClass, imgWidth, pos) {
	var xmin = Math.round(detectionClass.xmin * imgWidth);
	var xmax = Math.round(detectionClass.xmax * imgWidth);

	var xmid;
	
	if (detectionClass.xmin > 0.5 && detectionClass.xmax > 0.5)
		xmid = xmax;
	else if (detectionClass.xmin < 0.5 && detectionClass.xmax < 0.5)
			xmid = xmin;
		else
			xmid = xmin + (xmax - xmin) / 2;
	
	var zoom = typeof panorama.getZoom() !== 'undefined' ? panorama.getZoom() : 1;
	var fov = calculateFOV();
	$("#fov").text(fov.toFixed(2) + "°");
	var angRatio = fov / imgWidth;
	var ang = xmid * angRatio - (fov / 2);
	var heading = panorama.getPov().heading;
	
	var direction = heading + ang;
	var startPoint = turf.point([pos[0], pos[1]]);
	var options = {
		units: 'kilometers'
	};
	var vectorDist = 35 / 1000; // Distance from current position to create a vector from in kilometres.

	if (direction > 180)
		direction = -(360 - direction);
	
	var endPoint = turf.rhumbDestination(startPoint, vectorDist, direction, options);
	var locVector = turf.lineString([startPoint.geometry.coordinates, endPoint.geometry.coordinates]);
	
	locVector.properties.routeheading = heading;
	locVector.properties.detectionType = detectionType;

	return locVector;	
}

function calculateFOV() {
	var fov = 180 / Math.pow(2, panorama.getZoom()); 
	return fov;
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
				var fov = calculateFOV();
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

						var locVector = getTelemetry(type, result.classes[i], result.imgWidth, pos);
						poleIntersectVectors[poleIntersectVectors.length - 1].features.push(locVector);
						
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
						
						var locVector = getTelemetry(type, result.classes[i], result.imgWidth, pos);
						txIntersectVectors[txIntersectVectors.length - 1].features.push(locVector);
						
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
						
						var locVector = getTelemetry(type, result.classes[i], result.imgWidth, pos);
						rustytxIntersectVectors[rustytxIntersectVectors.length - 1].features.push(locVector);
						
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

var poleIntersections = {
	type: "FeatureCollection",
	features: []
};

var txIntersections = {
	type: "FeatureCollection",
	features: []
};

var rustytxIntersections = {
	type: "FeatureCollection",
	features: []
};

var svMarkers = [];

function placeIntersectClustersOnMap(intersections, mapSource, desc, icon, markerIcon) {
	var maxDistance = 0.015; // Maximum distance to consider points as part of a cluster in kilometres.
	var options = {
		minPoints: 1
	};
	var clustered = turf.clustersDbscan(intersections, maxDistance, options);

	// Add as a feature to the map.
	var geojsonFormat = new ol.format.GeoJSON();
	
	var clusters = {};
	
	// Gather all the points within a cluster.
	for (i = 0; i < clustered.features.length; i++) {
		var intersectPoint = clustered.features[i];
		
		if (intersectPoint.properties.dbscan != "noise") {
			// Defines the cluster number this point is part of.
			var clusterNum = intersectPoint.properties.cluster;
			// Defines the type of point - can be "core" or "edge".
			var clusterType = intersectPoint.properties.cluster;
			
			if (typeof clusters[clusterNum] == "undefined")
				clusters[clusterNum] = {
					type: "FeatureCollection",
					features: []
				};
				
			clusters[clusterNum].features.push(intersectPoint);
		}
	}
	
	// Calculate the centre of mass for each cluster.
	for (var property in clusters) {
		if (clusters.hasOwnProperty(property)) {
			var fc = clusters[property];
			var centre = turf.centerOfMass(fc);
			
			centre.properties.detectionType = fc.features[0].properties.detectionType;
			
			addFeaturesForDownload(centre);
			
			var vecFeature = geojsonFormat.readFeature(centre,
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
			
			var marker;
			
			if (markerIcon) {
				marker = new google.maps.Marker({
					position: {lat: centre.geometry.coordinates[1], lng: centre.geometry.coordinates[0]},
					map: panorama,
					label: desc,
					title: desc,
					icon: markerIcon
				});
			}
			else {
				marker = new google.maps.Marker({
					position: {lat: centre.geometry.coordinates[1], lng: centre.geometry.coordinates[0]},
					map: panorama,
					label: desc,
					title: desc
				});
			}
			
			svMarkers.push(marker);
		}
	}
}

function createPointsFromIntersections(intersectVectors, intersectPoints, mapSource, desc, icon, markerIcon) {
	// Loop over intersect vectors to find points.	Each element of intersectVectors array contains a FeatureCollection of
	// lines representing vectors pointing at detected objects in the image taken at that location. We then look for intersections
	// between the vectors at one location with those at the next location - an intersection point is probably the actual location
	// of the detected object in the real world. We then create a Feature and place it in the map at that location. We also create
	// a marker to be displayed in Streetview at the same location.
	
	for (locIndex = 0; locIndex < intersectVectors.length - 1; locIndex++) {
		var currentIntersects = intersectVectors[locIndex];
		var nextIntersects = intersectVectors[locIndex + 1];
		
		for (i = 0; i < currentIntersects.features.length; i++) {
			var line1 = currentIntersects.features[i];
			for (j = 0; j < nextIntersects.features.length; j++) {
				var line2 = nextIntersects.features[j];
				
				if (line1.geometry.coordinates[0][0] != line2.geometry.coordinates[0][0] && line1.geometry.coordinates[0][1] != line2.geometry.coordinates[0][1]) {
					// Only check if the intersection line is not co-incident.
					var intersects = turf.lineIntersect(line1, line2);

					if (intersects.features.length > 0) {
						var intersectPoint = intersects.features[0];
						
						intersectPoint.properties.detectionType = line1.properties.detectionType;
						intersectPoints.features.push(intersectPoint);
					}
				}
			}
		}
	}
	
	placeIntersectClustersOnMap(intersectPoints, mapSource, desc, icon, markerIcon);

	console.log("Intersection points created.");
}

function setupIntersectVectors() {	
	poleIntersectVectors = [];
	rustytxIntersectVectors = [];
	txIntersectVectors = [];
}

function clearMarkers() {
	svMarkers.forEach(function(marker) {
		marker.setMap(null);
	});
	
	svMarkers = [];
}

function clearDownload() {
	downloadFeatures.features = [];
}

// If you add more angles here, when following a route the code will adjust the streeview bearing according to the angle list.
var detectionAngles = [0];

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
					poleIntersectVectors.push({
						type: "FeatureCollection",
						features: []
					});
					rustytxIntersectVectors.push({
						type: "FeatureCollection",
						features: []
					});
					txIntersectVectors.push({
						type: "FeatureCollection",
						features: []
					});
					doAnalyse(null, coord, bearing, dfd);
				});
				return dfd;
			});
		};
		
		setupIntersectVectors();
		
		for (i = 0; i < chunks.features.length; i++) {
			var aFeature = chunks.features[i];
			var firstPoint = aFeature.geometry.coordinates[0];
			var lastPoint = aFeature.geometry.coordinates[1];
			var bearing = turf.bearing(firstPoint, lastPoint);
			
			if (i == 0) {
				detectionAngles.forEach(ang => {
					createTask(firstPoint, bearing + ang);
				});
			}
			
			detectionAngles.forEach(ang => {
				createTask(lastPoint, bearing + ang);
			});
		};
		
		tasks.reduce(function(cur, next) {
			var result = cur.then(next);
			var fail = cur.fail(next);
			return result ? result : fail;
		}, $.Deferred().resolve()).then(function() {
				
			poleSource.clear();
			clearMarkers();
			clearDownload();
			
			createPointsFromIntersections(poleIntersectVectors, poleIntersections, poleSource, "Pole", 'calculated_route_icon.png');
			createPointsFromIntersections(rustytxIntersectVectors, rustytxIntersections, poleSource, "Rusty Transformer", 'round_blue.png');
			createPointsFromIntersections(txIntersectVectors, txIntersections, poleSource, "Transformer", 'round_orange.png', 'google_push_pin_orange.png');
		});
	}
	else {
		console.log("No route to follow");
	};
}

function doAnalyseOneShot() {
	setupIntersectVectors();
	poleIntersectVectors.push({
		type: "FeatureCollection",
		features: []
	});
	rustytxIntersectVectors.push({
		type: "FeatureCollection",
		features: []
	});
	txIntersectVectors.push({
		type: "FeatureCollection",
		features: []
	});
	doAnalyse();
}

function init() {	
	var el = document.getElementById("analyse");
	if (el.addEventListener)
		el.addEventListener("click", doAnalyseOneShot, false);
	else if (el.attachEvent)
		el.attachEvent('onclick', doAnalyseOneShot);
	
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
		
		intersectSource = new ol.source.Vector({wrapX: false});
		
		var routes = new ol.layer.Vector({
			source:	routeSource,
			style: 	routeStyle
		});
		
		var hmLayer = new ol.layer.Heatmap({
			source: intersectSource,
			blur: 50,
			radius: 50
		});

		view = new ol.View({
					center : ol.proj.transform([-76.180480, 42.601210], 'EPSG:4326', 'EPSG:3857'),
					zoom : 15
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
					vector,
					hmLayer
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