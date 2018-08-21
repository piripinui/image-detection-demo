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
imageDir = process.argv[2],
jpeg = require('jpeg-js');

const { createLogger, format, transports } = require('winston');
const { combine, timestamp, label, printf } = format;

const myFormat = printf(info => {
  return `${info.timestamp} ${info.level}: ${info.message}`;
});

var logger = createLogger({
	format: combine(
		timestamp(),
		myFormat
	),
	transports: [
		new transports.Console(),
		new transports.File({ filename: 'logs/server.log' })
	]
});

if (!imageDir)
	imageDir = "images";

logger.info("Writing images to " + imageDir);

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
					var d = new Date(0); // The 0 there is the key, which sets the date to the epoch

					switch (maptype) {
						case 'satellite': {
								satelliteSessionToken = data.session;
								d.setUTCSeconds(data.expiry);
								logger.log({
									level: 'info',
									message: "Satellite session expiry: " + data.expiry +" (" + d + ")"
								});
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
				logger.error("Error getting Streetview metadata: " + err);

				reject(err);
			}
			else {
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
	
	var panoPromise = getPanoId(locations);
	
	// Get the Streetview metadata.
	
	return panoPromise.then(
		function() {
			return getStreetviewMetadata()
		},
		function() {
			logger.error("Rejected");
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
		logger.info("Returning session response");
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
		//console.log("Returning init response - " + streetviewMetadata.panoId);
		res.send(streetviewMetadata)
		res.status(200).end();
	});
})

app.get('/gettileapikey', function(req, res) {
	logger.info("Got Tile API key request: " + req.url);

	res.send(tileApiKey);
	res.status(200).end();
});

app.get('/getmapsapikey', function(req, res) {
	//console.log("Got Maps API key request: " + req.url);

	res.send(mapsApiKey);
	res.status(200).end();
});

app.get('/getdirectionsapikey', function(req, res) {
	//console.log("Got Directions API key request: " + req.url);

	res.send(directionsApiKey);
	res.status(200).end();
});

app.get('/getdirections', function(req, res) {
	//console.log("Got Directions request: " + req.url);
	
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
				logger.error("Error from Directions API request: " + err);
				res.status(500).end();
			}
			else {
				//console.log("Directions request succeeded");
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
		logger.error("Bad directions request (" + results + ")");
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
			
			//console.log("File " + fullFilename);
			
			imagemin([fullFilename], 'images', {
				plugins: [
					pngToJpeg({quality: 90})
				]
			}).then((files) => {		
				var newFn = fullFilename.replace("png", "jpg");
				fs.rename(fullFilename, newFn, function(err) {
					if ( err ) logger.error('ERROR: ' + err);
					logger.info("Renamed " + fullFilename + " to " + newFn + "...stored in Custom-Object-Detection/pole_images.");
					var result = {};
					
					fs.readFile(fullFilename.replace("png", "jpg"), (err, data) => {
						if (err) {
							res.status(500).end();
							return;
						}
						else {
							logger.info("Returning jpeg image in base64 encoding...");

							var imgBuf = new Buffer(data);
							try {
								var buf = imgBuf.toString('base64');
							}
							catch(err) {
								logger.error("Failed to return processed image: " + err);
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

function createAnnotation(filename, dir, detectionData, width, height) {
	// Creates Pascal VOC XML data from the supplied parameters.
	var buf = "";
	
	buf += "<annotation>\n";
	buf += "<folder>" + dir + "</folder>\n";
	buf += "<filename>" + filename + "</filename>\n";
	buf += "<path>" + "</path>\n";
	buf += "<size>\n";

	buf += "<width>" + width + "</width>\n";
	buf += "<height>" + height + "</height>\n";
	buf += "<depth>3</depth>\n";

	buf += "</size>\n";
	buf += "<segmented>" + "</segmented>\n";
	buf += "<source>\n<database>Unknown</database>\n</source>\n";
	
	
	for (i = 0; i < detectionData.classes.length; i++) {
		buf += "<object>\n";
		buf	+= "<name>" + detectionData.classes[i].type + "</name>\n";

		buf += "<pose>Unspecified</pose>\n";
		buf += "<truncated>0</truncated>\n";
		buf += "<difficult>0</difficult>\n";
		buf += "<bndbox>\n";
		buf += "<xmin>" + Math.round(width * detectionData.classes[i].xmin) + "</xmin>\n";
		buf += "<ymin>" + Math.round(height * detectionData.classes[i].ymin) + "</ymin>\n";
		buf += "<xmax>" + Math.round(width * detectionData.classes[i].xmax) + "</xmax>\n";
		buf += "<ymax>" + Math.round(height * detectionData.classes[i].ymax) + "</ymax>\n";
		buf += "</bndbox>\n";
		buf += "</object>\n";
	}
	
	buf += "</annotation>\n";
	
	return buf;
}

app.post('/analyseimage', function (req, res) {
  
	logger.info("analyseimage request received from " + req.headers.referer);
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
	
	// Before writing the image out, check there are no existing JPEG files in the image directory. If
	// there are, delete them first.
	
	var aPromise = new Promise(function (resolve, reject) {
		fs.readdir(imageDir, function(err, files) {
			for (i = 0; i < files.length; i++) {
				var aFile = files[i];
				
				var found = aFile.match(/jp[e]?g/g);
				
				if (found) {
					// Got a jpg file - delete it.
					logger.info("Deleting file: " + imageDir + "/" + aFile);
					fs.unlinkSync(imageDir + aFile);
				}
			}
			
			resolve();
		});
	});
	
	aPromise.then(function() {
		fs.writeFile(imageDir + filename, buf, function(err) {
			if (err) 
				res.status(500).end();
			else {
				var fullFilename = imageDir + filename;
				
				imagemin([fullFilename], imageDir, {
					plugins: [
						pngToJpeg({quality: 90})
					]
				}).then((files) => {
					var newFn = fullFilename.replace("png", "jpg");
					fs.rename(fullFilename, newFn, function(err) {
						if ( err ) logger.error('ERROR: ' + err);
						logger.info("Renamed " + fullFilename + " to " + newFn + "...making detection request.");
						
						request({
							uri: "http://localhost:3200/startdetection",
							method: "GET"
						}, function (detectionErr, resp, data) {
							if (detectionErr) {
								logger.error("Problem during image detection: " + detectionErr);
								res.status(500).end();
								return;
							}
							
							if (resp.statusCode >= 500 && resp.statusCode < 600) {
								logger.error("Got error for detection server: " + resp.statusCode);
								res.status(resp.statusCode).end();
								return;
							}
							
							logger.info("Start detection request succeeded..." + data);
							
							result = JSON.parse(data);

							// Return the processed image to the requestor but also store the source image with Pascal VOC XML metadata based
							// on the detection results.
							
							var targetFile = imageDir + 'processed/' + filename.replace("png", "jpg");
						  
							fs.readFile(targetFile, (err, imgData) => {
								if (err) {
									res.status(500).end();
									return;
								}
								else {
									var fn = filename.replace("png", "jpg");
									var srcFile = imageDir + fn;
									var storeFile = imageDir + "stored/" + fn;
									// Move source image to stored images with annotations in a subdirectory called "stored".
									fs.rename(srcFile, storeFile, (err, data) => {
										if (err) {
											logger.error("Error copying " + srcFile + " to " + storeFile + " (" + err.message + ")");
											res.status(500).end();
											return;
										}
										else {
											logger.info("File " + srcFile + " moved to /stored");
											
											var jpegData = jpeg.decode(imgData, true);
											
											// Create a Pascal VOC XML file alongside the stored image to be used later for training if required.
											var anno = createAnnotation(filename.replace("png", "jpg"), 'pole_images', result, jpegData.width, jpegData.height);
											var annoFile = imageDir + "/stored/" + fn.replace("jpg", "xml");
											fs.writeFile(annoFile, anno, (err, data) => {
												if (err) {
													res.status(500).end();
													return;
												}
												else 
													logger.info("File " + annoFile + " written successfully");
											});

											// Return the annotated file back to the requesting client along with the detection metadata.
											var imgBuf = new Buffer(imgData);
											try {
												var buf = imgBuf.toString('base64');
											}
											catch(err) {
												logger.error("Failed to return processed image: " + err);
												res.status(500).end();
												return;
											}
											result.data = buf;
											res.writeHead(200, {'Content-Type': 'application/json'});
											res.end(JSON.stringify(result));
										}
									});
								}
							});
						});
					});
				});
			}
		});
	});
})

app.listen(listenPort, function () {
	logger.info('google_maptiles_demo app listening on port ' + listenPort + '!');
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
