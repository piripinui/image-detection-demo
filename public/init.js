var sessionToken,
map,view, markerFeature, markerSource, heading,
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
			console.log("Session token request succeeded");
			var d = new Date(0); // The 0 there is the key, which sets the date to the epoch

			switch (maptype) {
				case 'satellite': {
						satelliteSessionToken = data.session;
						console.log("Satellite session: " + satelliteSessionToken);
						d.setUTCSeconds(data.expiry);
						console.log("Satellite session expiry: " + data.expiry +" (" + d + ")")
						break;
					}
				case 'roadmap': {
						roadSessionToken = data.session;
						console.log("Road session: " + roadSessionToken);
						break;
					}
				case 'streetview': {
						streetviewSessionToken = data.session;
						console.log("Streetview session: " + streetviewSessionToken);
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
			console.log("Streetview pano id request succeeded");
			console.log(data);
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
			console.log("Streetview metadata request request succeeded");
			console.log(data);
			streetviewMetadata = data;
			dfd.resolve();
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
	return streetviewMetadata.heading;
}

function initPanorama() {
		console.log("Creating panorama...");
		panorama = new google.maps.StreetViewPanorama(
			document.getElementById('street-view'),
			{
				pano: getPano()
			});
			
		panorama.addListener('pano_changed', function() {
			//console.log("Panorama moved");
		});
		
		panorama.addListener('position_changed', function() {
			var pos = panorama.getPosition();
			var coord = ol.proj.transform([pos.lng(), pos.lat()], 'EPSG:4326', 'EPSG:3857'); 
			//console.log("Panorama position changed: " + pos);
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
		  else {
			  //console.log("Panorama ids do not match");
		  }
		}); 
}

function Base64Encode(str, encoding = 'utf-8') {
    var bytes = new (TextEncoder || TextEncoderLite)(encoding).encode(str);        
    return base64js.fromByteArray(bytes);
}

function doAnalyse() {
	console.log("Performing analysis...");
	
	var cvs = $(".widget-scene-canvas");
	var data = cvs[cvs.length - 1];
	
	$("#analysis").append('<div class="loader">Processing...</div>');
	
	$.ajax({
		url: "/saveimage",
		type: "POST",
		contentType: "application/base64",
		data: data.toDataURL(),
		success: function(result) {
			console.log("Image save requested successful");
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
			}
			
			tab += "</table>";
			
			$("#objects").append(tab);
			
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
	
function doSweep() {
	console.log("Sweeping...");
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

function setupMap() {
	var attribution = new ol.control.Attribution({
		collapsible : false
	});
	getSatelliteSession()
	.then(function () {

		var satelliteSource = new ol.source.XYZ({
				url : 'https://www.googleapis.com/tile/v1/tiles/{z}/{x}/{y}?session=' + satelliteSessionToken + '&key=' + tileApiKey
			});

		console.log("Created Google tile source using " + satelliteSource.getUrls()[0]);
		
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

		view = new ol.View({
					center : [0, 0],
					zoom : 2
				});
		map = new ol.Map({
				layers : [
					new ol.layer.Tile({
						source : satelliteSource
					}),
					vector
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
				console.log("Streetview session established.");
				streetviewSessionToken = data;
			}
		});

		map.on("moveend", function (e) {
			//console.log("Map moved");
			updateAttribution(e.map);
		});
		
		map.on('singleclick', function(evt) {      
            var latLon = ol.proj.transform(evt.coordinate, 'EPSG:3857', 'EPSG:4326');                                           
			console.log("Click event: " + latLon[0] + ", " + latLon[1]);	
			
			setMarker(evt.coordinate);
			
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
					console.log("Tile server initialisation succeeded");
					streetviewMetadata = data;
					
					console.log("Pano id = " + streetviewMetadata.panoId + ", lat = " + streetviewMetadata.lat + ", lon = " + streetviewMetadata.lng);
					console.log("Request coordinates = " + latLon[1] + ", " + latLon[0]);
					
					initPanorama();
				}
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
		console.log("Got streetview session token.");
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