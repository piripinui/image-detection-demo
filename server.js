var express = require('express'),
request = require('request'),
app = express(),
fs = require('fs'),
urlPattern = require('url-pattern'),
helmet = require('helmet'),
sessionToken,
mapsApiKey, tileApiKey, directionsApiKey,
streetviewSessionToken, streetviewPanos, streetviewMetadata,
Promise = require('promise'),
path = require('path'),
shell = require('shelljs'),
bodyParser = require('body-parser'),
imagemin = require('imagemin'),
pngToJpeg = require('png-to-jpeg'),
cp = require('child_process'),
polyline = require( 'google-polyline'),
imageDir = process.argv[2];

if (!imageDir)
	imageDir = "images";

console.log("Writing images to " + imageDir);

var resultDir = process.cwd() + "\\data";

var listenPort = process.env.PORT || 3100;

var streetviewOptions = {
	"mapType" : "streetview",
	"language" : "gb-GB",
	"region" : "GB"
};

app.use(express.static(__dirname + '/public'));

app.use(helmet());

function getSession(options, maptype) {
	var aPromise = new Promise(function (resolve, reject) {
		
		request({
			uri : "https://www.googleapis.com/tile/v1/createSession?key=" + tileApiKey,
			method : "POST",
			body : options,
			json: true 
		}, function (err, res, data) {
				if (err)
					reject(err);
				else {
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
					resolve(res);
				}
			});
	});

	return aPromise;
}

function getStreetviewSession() {
	return getSession(streetviewOptions, 'streetview');
}

function getPanoId(locations) {
	var aPromise = new Promise(function (resolve, reject) {
		request({
			uri: "https://www.googleapis.com/tile/v1/streetview/panoIds?key=" + tileApiKey + "&session=" + streetviewSessionToken,
			method: "POST",
			body: locations,
			json: true
		},
		function (err, res, data) {
			if (err) 
				reject(err);
			else {
				console.log("Streetview pano id request succeeded: " + err);
				console.log(data);
				streetviewPanos = data;
				resolve(res);
			}
		});
	});
	
	return aPromise;
}

function getStreetviewMetadata() {
	var aPromise = new Promise(function(resolve, reject) {
		request({
			uri: "https://www.googleapis.com/tile/v1/streetview/metadata?key=" + tileApiKey + "&panoId=" + streetviewPanos.panoIds[0] + "&session=" + streetviewSessionToken,
			method: "GET",
			json: true
		},
		function (err, res, data) {
			if (err) {
				console.log("error " + err);
				reject(err);
			}
			else {
				console.log("Streetview metadata request succeeded");
				//console.log(data);
				streetviewMetadata = data;
				resolve(res);
			}
		});
	});
	
	return aPromise;
}

function initialiseStreetview(req, res, results) {
	
	// Get a pano id based on the coordinates in results.
	var locations = {
		'locations' : [
			{
				'lat' : results.lat,
				'lng' : results.lon						
			}
		],
		'radius' : 50
	};
	
	console.log(locations);
	
	var panoPromise = getPanoId(locations);
	
	// Get the Streetview metadata.
	
	return panoPromise.then(
		function() {
			return getStreetviewMetadata()
		},
		function() {
			console.log("Rejected");
		}
	);
}

app.get('/initstreetviewsession*', function (req, res) {
	// Creates the streetview session token and returns it to the requestor.
	var pattern = new urlPattern(
		  "/initstreetviewsession"
		);
		
	var results = pattern.match(req.url);
	
	var aPromise = getStreetviewSession();
	
	aPromise
	.then(function() {
		console.log("Returning session response");
		res.send(streetviewSessionToken)
		res.status(200).end();
	});
})

app.get('/initstreetview*', function (req, res) {

	var pattern = new urlPattern(
		  /^\/initstreetview\?lat=([-+]?[0-9]*\.?[0-9]+)&lon=([-+]?[0-9]*\.?[0-9]+)$/,
		  ['lat', 'lon']
		);
		
	var results = pattern.match(req.url);
	
	initialiseStreetview(req, res, results)
	.then(function() {
		console.log("Returning init response - " + streetviewMetadata.panoId);
		res.send(streetviewMetadata)
		res.status(200).end();
	});
})

app.get('/gettileapikey', function(req, res) {
	console.log("Got Tile API key request: " + req.url);

	res.send(tileApiKey);
	res.status(200).end();
});

app.get('/getmapsapikey', function(req, res) {
	console.log("Got Maps API key request: " + req.url);

	res.send(mapsApiKey);
	res.status(200).end();
});

app.get('/getdirectionsapikey', function(req, res) {
	console.log("Got Directions API key request: " + req.url);

	res.send(directionsApiKey);
	res.status(200).end();
});

app.get('/getdirections', function(req, res) {
	console.log("Got Directions request: " + req.url);
	
	var pattern = new urlPattern(
		/\/getdirections\?origin=([-+]?[0-9]*\.?[0-9]+)\,([-+]?[0-9]*\.?[0-9]+)\&destination=([-+]?[0-9]*\.?[0-9]+)\,([-+]?[0-9]*\.?[0-9]+)/,
		['originLat', 'originLon', 'destLat', 'destLon']
	);
	
	pattern.isRegex = true;
		
	var results = pattern.match(req.url);
	
	if (results) {
		request({
			uri: "https://maps.googleapis.com/maps/api/directions/json?origin=" + results.originLat + "," + results.originLon + "&destination=" + results.destLat + "," + results.destLon + "&key=" + directionsApiKey,
			method: "GET",
			json: true
		},
		function (err, resp, data) {
			if (err) {
				console.log("error " + err);
				res.status(500).end();
			}
			else {
				console.log("Directions request succeeded");
				var coords = polyline.decode(data.routes[0].overview_polyline.points);
				var txCoords = [];
				
				for (i = 0; i < coords.length; i++) {
					txCoords.push([coords[i][1], coords[i][0]]);
				}
				
				var overviewLine = {
					type: "Feature",
					properties: {},
					geometry: {
						type: "LineString",
						coordinates: txCoords
					}
				};
				
				res.writeHead(200, {'Content-Type': 'application/json'});
				res.end(JSON.stringify(overviewLine));
			}
		});
	}
	else {
		console.log("Bad directions request");
		res.status(500).end();
	}
});

app.use(bodyParser.text({
	type: "application/base64",
	limit: "5MB"
}));

function base64MimeType(encoded) {
  var result = null;

  if (typeof encoded !== 'string') {
    return result;
  }

  var mime = encoded.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/);

  if (mime && mime.length) {
    result = mime[1];
  }

  return result;
}

app.post('/storeimage', function (req, res) {
  
	var mt = base64MimeType(req.body);  
	var filename;
	var d = new Date();
	var fnPrefix = (d.getTime() / 1000).toString();
  
	switch(mt) {
		case 'image/png':
			filename = fnPrefix + ".png";
			break;
		case 'image/jpeg':
			filename = fnPrefix + ".jpeg";
			break;
		default:
			break;
	}
  
	var data = req.body.replace(/^data:image\/\w+;base64,/, "");
	var buf = new Buffer(data, 'base64');
  
	var fullFilename = "Custom-Object-Detection/pole_images/" + filename;
	
	fs.writeFile(fullFilename, buf, function(err) {
		if (err) 
			res.status(500).end();
		else {
			
			console.log("File " + fullFilename);
			
			imagemin([fullFilename], 'images', {
				plugins: [
					pngToJpeg({quality: 90})
				]
			}).then((files) => {		
				var newFn = fullFilename.replace("png", "jpg");
				fs.rename(fullFilename, newFn, function(err) {
					if ( err ) console.log('ERROR: ' + err);
					console.log("Renamed " + fullFilename + " to " + newFn + "...stored in Custom-Object-Detection/pole_images.");
					var result = {};
					
					fs.readFile(fullFilename.replace("png", "jpg"), (err, data) => {
						if (err) {
							res.status(500).end();
							return;
						}
						else {
							console.log("Returning jpeg image in base64 encoding...");

							var imgBuf = new Buffer(data);
							try {
								var buf = imgBuf.toString('base64');
							}
							catch(err) {
								console.log("Failed to return processed image: " + err);
								res.status(500).end();
								return;
							}
							result.data = buf;
							res.writeHead(200, {'Content-Type': 'application/json'});
							res.end(JSON.stringify(result));
						}
					});
				});
			});
		}
  });
})

app.post('/saveimage', function (req, res) {
  
	var mt = base64MimeType(req.body);  
	var filename;
	var d = new Date();
	var fnPrefix = (d.getTime() / 1000).toString();
  
	switch(mt) {
		case 'image/png':
			filename = fnPrefix + ".png";
			break;
		case 'image/jpeg':
			filename = fnPrefix + ".jpeg";
			break;
		default:
			break;
	}
  
	var data = req.body.replace(/^data:image\/\w+;base64,/, "");
	var buf = new Buffer(data, 'base64');
  
	fs.writeFile(imageDir + filename, buf, function(err) {
		if (err) 
			res.status(500).end();
		else {
			var fullFilename = imageDir + filename;
			console.log("File " + fullFilename);
			
			imagemin([fullFilename], imageDir, {
				plugins: [
					pngToJpeg({quality: 90})
				]
			}).then((files) => {
				// Please keep in mind that all files now have the wrong extension
				// You might want to change them manually
				
				var newFn = fullFilename.replace("png", "jpg");
				fs.rename(fullFilename, newFn, function(err) {
					if ( err ) console.log('ERROR: ' + err);
					console.log("Renamed " + fullFilename + " to " + newFn + "...making detection request.");
					
					request({
						uri: "http://localhost:3200/startdetection",
						method: "GET"
					},
					function (err, resp, data) {
						// Delete the captured file
						try {
							fs.unlink(newFn, (err) => {
								if (err) throw err;
								console.log(newFn + ' was deleted');
							});
						}
						catch(err) {
							console.log("Problem deleting " + newFn);
							res.status(500).end();
							return;
						}
						
						if (err) {
							// node couldn't execute the command
							console.log("Problem running process_imagery: " + err);
							res.status(500).end();
							return;
						}
						
						console.log("Start detection request succeeded..." + data);
						
						result = JSON.parse(data);
						
						// Return the processed image to the requestor.
					  
						fs.readFile(imageDir + 'processed/' + filename.replace("png", "jpg"), (err, data) => {
							if (err) {
								res.status(500).end();
								return;
							}
							else {
								console.log("Returning jpeg image in base64 encoding...");

								var imgBuf = new Buffer(data);
								try {
									var buf = imgBuf.toString('base64');
								}
								catch(err) {
									console.log("Failed to return processed image: " + err);
									res.status(500).end();
									return;
								}
								result.data = buf;
								res.writeHead(200, {'Content-Type': 'application/json'});
								res.end(JSON.stringify(result));
							}
						});
					});
				});
			});
		}
  });
})

app.listen(listenPort, function () {
	console.log('google_maptiles_demo app listening on port ' + listenPort + '!');
});

function initialise() {
	fs.readFile("public/tile_api_key.txt", function(err, data) {
		if (err) throw err;
		
		tileApiKey = data;
	});
	fs.readFile("public/maps_api_key.txt", function(err, data) {
		if (err) throw err;
		
		mapsApiKey = data;
	});
	fs.readFile("public/directions_api_key.txt", function(err, data) {
		if (err) throw err;
		
		directionsApiKey = data;
	});
};

initialise();
