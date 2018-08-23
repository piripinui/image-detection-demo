const express = require('express'),
request = require('request'),
app = express(),
fs = require('fs'),
urlPattern = require('url-pattern'),
helmet = require('helmet'),
Promise = require('promise'),
path = require('path'),
shell = require('shelljs'),
bodyParser = require('body-parser'),
imagemin = require('imagemin'),
pngToJpeg = require('png-to-jpeg'),
cp = require('child_process'),
polyline = require( 'google-polyline'),
jpeg = require('jpeg-js');

class ImageDetectionProcessor {
	constructor(listenPort, imageDir) {
		this.app = app;
		this.listenPort = listenPort;

		if (!imageDir)
			imageDir = "images";
		this.imageDir = imageDir;

		this.initialise();
	}
	
	initialise() {		
		const processor = this;
		this.initialiseLogger();
		
		this.app.use(express.static(path.join(__dirname, 'public')));

		this.app.use(helmet());
		this.app.listen(this.listenPort, function () {
			processor.logger.info('Image Detection Server listening on port ' + processor.listenPort + '!');
		});
		
		fs.readFile(path.join("public", "tile_api_key.txt"), function(err, data) {
			if (err) throw err;
			
			processor.tileApiKey = data;
		});
		fs.readFile(path.join("public", "maps_api_key.txt"), function(err, data) {
			if (err) throw err;
			
			processor.mapsApiKey = data;
		});
		fs.readFile(path.join("public", "directions_api_key.txt"), function(err, data) {
			if (err) throw err;
			
			processor.directionsApiKey = data;
		});
		
		this.streetviewOptions = {
			"mapType" : "streetview",
			"language" : "gb-GB",
			"region" : "GB"
		};
			
		this.logger.info("Writing images to " + this.imageDir);
		this.initialiseEndpoints();
	}
	
	initialiseLogger() {
		const { createLogger, format, transports } = require('winston');
		const { combine, timestamp, label, printf } = format;

		const myFormat = printf(info => {
		  return `${info.timestamp} ${info.level}: ${info.message}`;
		});

		this.logger = createLogger({
			format: combine(
				timestamp(),
				myFormat
			),
			transports: [
				new transports.Console(),
				new transports.File({ filename: 'logs/server.log' })
			]
		});
	}
	
	initialiseEndpoints() {
		const processor = this;
				
		this.app.use(bodyParser.text({
			type: "application/base64",
			limit: "5MB"
		}));

		this.app.use(bodyParser.text({
			type: "application/json",
			limit: "5MB"
		}))
		
		this.app.get('/initstreetviewsession*', function (req, res) {
			// Creates the streetview session token and returns it to the requestor.
			const pattern = new urlPattern(
				  "/initstreetviewsession"
				);
				
			const results = pattern.match(req.url);
			
			const aPromise = processor.getStreetviewSession();
			
			aPromise
			.then(function() {
				processor.logger.info("Returning session response");
				res.send(processor.streetviewSessionToken)
				res.status(200).end();
			});
		});
		
		this.app.get('/initstreetview*', function (req, res) {
			const pattern = new urlPattern(
				  /^\/initstreetview\?lat=([-+]?[0-9]*\.?[0-9]+)&lon=([-+]?[0-9]*\.?[0-9]+)$/,
				  ['lat', 'lon']
				);
				
			const results = pattern.match(req.url);
			
			processor.initialiseStreetview(req, res, results)
			.then(function() {
				res.send(processor.streetviewMetadata)
				res.status(200).end();
			});
		});
		
		this.app.get('/gettileapikey', function(req, res) {
			processor.logger.info("Got Tile API key request: " + req.url);

			res.send(processor.tileApiKey);
			res.status(200).end();
		});

		this.app.get('/getmapsapikey', function(req, res) {
			res.send(processor.mapsApiKey);
			res.status(200).end();
		});

		this.app.get('/getdirectionsapikey', function(req, res) {
			res.send(processor.directionsApiKey);
			res.status(200).end();
		});
		
		this.app.get('/getdirections', function(req, res) {	
			const pattern = new urlPattern(
				/\/getdirections\?origin=([-+]?[0-9]*\.?[0-9]+)\,([-+]?[0-9]*\.?[0-9]+)\&destination=([-+]?[0-9]*\.?[0-9]+)\,([-+]?[0-9]*\.?[0-9]+)/,
				['originLat', 'originLon', 'destLat', 'destLon']
			);
			
			pattern.isRegex = true;
				
			const results = pattern.match(req.url);
			
			if (results) {
				request({
					uri: "https://maps.googleapis.com/maps/api/directions/json?origin=" + results.originLat + "," + results.originLon + "&destination=" + results.destLat + "," + results.destLon + "&key=" + processor.directionsApiKey,
					method: "GET",
					json: true
				},
				function (err, resp, data) {
					if (err) {
						processor.logger.error("Error from Directions API request: " + err);
						res.status(500).end();
					}
					else {
						const coords = polyline.decode(data.routes[0].overview_polyline.points);
						const txCoords = [];
						
						for (let i = 0; i < coords.length; i++) {
							txCoords.push([coords[i][1], coords[i][0]]);
						}
						
						const overviewLine = {
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
				processor.logger.error("Bad directions request (" + results + ")");
				res.status(500).end();
			}
		});
		
		this.app.post('/storeimage', function (req, res) { 
			const mt = processor.base64MimeType(req.body);  
			var filename;
			const d = new Date();
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
		  
			const data = req.body.replace(/^data:image\/\w+;base64,/, "");
			const buf = new Buffer(data, 'base64');
		  
			var fullFilename = path.join("Custom-Object-Detection", "pole_images", filename);
			
			fs.writeFile(fullFilename, buf, function(err) {
				if (err) 
					res.status(500).end();
				else {
					imagemin([fullFilename], 'images', {
						plugins: [
							pngToJpeg({quality: 90})
						]
					}).then((files) => {		
						var newFn = fullFilename.replace("png", "jpg");
						fs.rename(fullFilename, newFn, function(err) {
							if ( err ) processor.logger.error('ERROR: ' + err);

							var result = {};
							
							fs.readFile(fullFilename.replace("png", "jpg"), (err, data) => {
								if (err) {
									res.status(500).end();
									return;
								}
								else {
									processor.logger.info("Returning jpeg image in base64 encoding...");

									var imgBuf = new Buffer(data);
									try {
										var buf = imgBuf.toString('base64');
									}
									catch(err) {
										processor.logger.error("Failed to return processed image: " + err);
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
		
		this.app.post('/analyseimage', function (req, res) {
			processor.logger.info("analyseimage request received from " + req.headers.referer);
			const bodyData = JSON.parse(req.body);
			const mt = processor.base64MimeType(bodyData.base64Data);  
			var filename;
			const d = new Date();
			const fnPrefix = (d.getTime() / 1000).toString();
		  
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
			
			const imgData = bodyData.base64Data.replace(/^data:image\/\w+;base64,/, "");
			const buf = new Buffer(imgData, 'base64');
			
			// Before writing the image out, check there are no existing JPEG files in the image directory. If
			// there are, delete them first.
			
			const aPromise = new Promise(function (resolve, reject) {
				fs.readdir(processor.imageDir, function(err, files) {
					for (let i = 0; i < files.length; i++) {
						var aFile = files[i];
						
						var found = aFile.match(/jp[e]?g/g);
						
						if (found) {
							// Got a jpg file - delete it.
							var fn = path.join(processor.imageDir, aFile);
							processor.logger.info("Deleting file: " + fn);
							fs.unlinkSync(fn);
						}
					}
					
					resolve();
				});
			});
			
			aPromise.then(function() {
				var fullFilename = path.join(processor.imageDir, filename);
				
				fs.writeFile(fullFilename, buf, function(err) {
					if (err) 
						res.status(500).end();
					else {
						imagemin([fullFilename], processor.imageDir, {
							plugins: [
								pngToJpeg({quality: 90})
							]
						}).then((files) => {
							const newFn = fullFilename.replace("png", "jpg");
							fs.rename(fullFilename, newFn, function(err) {
								if ( err ) processor.logger.error('ERROR: ' + err);
								processor.logger.info("Renamed " + fullFilename + " to " + newFn + "...making detection request.");
								
								request({
									uri: "http://localhost:3200/startdetection",
									method: "GET"
								}, function (detectionErr, resp, data) {
									if (detectionErr) {
										processor.logger.error("Problem during image detection: " + detectionErr);
										res.status(500).end();
										return;
									}
									
									if (resp.statusCode >= 500 && resp.statusCode < 600) {
										processor.logger.error("Got error for detection server: " + resp.statusCode);
										res.status(resp.statusCode).end();
										return;
									}
									
									processor.logger.info("Start detection request succeeded..." + data);
									
									const result = JSON.parse(data);

									// Return the processed image to the requestor but also store the source image with Pascal VOC XML metadata based
									// on the detection results.
									
									const targetFile = path.join(processor.imageDir, 'processed', filename.replace("png", "jpg"));
								  
									fs.readFile(targetFile, (err, imgData) => {
										if (err) {
											res.status(500).end();
											return;
										}
										else {
											const fn = filename.replace("png", "jpg");
											const srcFile = path.join(processor.imageDir, fn);
											const storeFile = path.join(processor.imageDir, "stored", fn);
											// Move source image to stored images with annotations in a subdirectory called "stored".
											fs.rename(srcFile, storeFile, (err, data) => {
												if (err) {
													processor.logger.error("Error copying " + srcFile + " to " + storeFile + " (" + err.message + ")");
													res.status(500).end();
													return;
												}
												else {
													processor.logger.info("File " + srcFile + " moved to /stored");
													
													const jpegData = jpeg.decode(imgData, true);
													
													// Create a Pascal VOC XML file alongside the stored image to be used later for training if required.
													const anno = processor.createAnnotation(filename.replace("png", "jpg"), 'pole_images', result, jpegData.width, jpegData.height);
													const annoFile = path.join(processor.imageDir, "stored", fn.replace("jpg", "xml"));
													fs.writeFile(annoFile, anno, (err, data) => {
														if (err) {
															processor.logger.error("Problem writing file " + annoFile);
															res.status(500).end();
															return;
														}
														else 
															processor.logger.info("VOC file " + annoFile + " written successfully");
													});
													
													// Create metadata file for position and bearing.
													const locFile = path.join(processor.imageDir, "stored", fn.replace("jpg", "json"));
													const posData = {
														lat: bodyData.position.lat,
														lng: bodyData.position.lng,
														heading: bodyData.bearing	
													};
													fs.writeFile(locFile, JSON.stringify(posData), (err, data) => {
														if (err) {
															processor.logger.error("Problem writing file " + locFile);
															res.status(500).end();
															return;
														}
														else 
															processor.logger.info("Position metadata file " + locFile + " written successfully");
													});

													// Return the annotated file back to the requesting client along with the detection metadata.
													const imgBuf = new Buffer(imgData);
													
													try {
														var buf = imgBuf.toString('base64');
													}
													catch(err) {
														processor.logger.error("Failed to return processed image: " + err);
														res.status(500).end();
														return;
													}
													result.data = buf;
													result.imgWidth = jpegData.width;
													result.imgHeight = jpegData.height;
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
		});
	}
	
	base64MimeType(encoded) {
		var result = null;

		if (typeof encoded !== 'string') {
			return result;
		}

		const mime = encoded.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/);

		if (mime && mime.length) {
			result = mime[1];
		}

		return result;
	}
	
	getSession(options, maptype) {
		const processor = this;
		
		const aPromise = new Promise(function (resolve, reject) {
			
			request({
				uri : "https://www.googleapis.com/tile/v1/createSession?key=" + processor.tileApiKey,
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
									processor.satelliteSessionToken = data.session;
									d.setUTCSeconds(data.expiry);
									processor.logger.log({
										level: 'info',
										message: "Satellite session expiry: " + data.expiry +" (" + d + ")"
									});
									break;
								}
							case 'roadmap': {
									processor.roadSessionToken = data.session;
									break;
								}
							case 'streetview': {
									processor.streetviewSessionToken = data.session;
								}
						}
						resolve(res);
					}
				});
		});

		return aPromise;
	}
	
	getStreetviewSession() {
		return this.getSession(this.streetviewOptions, 'streetview');
	}
	
	getPanoId(locations) {
		const processor = this;
		
		const aPromise = new Promise(function (resolve, reject) {
			request({
				uri: "https://www.googleapis.com/tile/v1/streetview/panoIds?key=" + processor.tileApiKey + "&session=" + processor.streetviewSessionToken,
				method: "POST",
				body: locations,
				json: true
			},
			function (err, res, data) {
				if (err) 
					reject(err);
				else {
					processor.streetviewPanos = data;
					resolve(res);
				}
			});
		});
		
		return aPromise;
	}

	getStreetviewMetadata() {
		const processor = this;
		
		const aPromise = new Promise(function(resolve, reject) {
			request({
				uri: "https://www.googleapis.com/tile/v1/streetview/metadata?key=" + processor.tileApiKey + "&panoId=" + processor.streetviewPanos.panoIds[0] + "&session=" + processor.streetviewSessionToken,
				method: "GET",
				json: true
			},
			function (err, res, data) {
				if (err) {
					processor.logger.error("Error getting Streetview metadata: " + err);

					reject(err);
				}
				else {
					processor.streetviewMetadata = data;
					resolve(res);
				}
			});
		});
		
		return aPromise;
	}
	
	initialiseStreetview(req, res, results) {
		const processor = this;
		// Get a pano id based on the coordinates in results.
		const locations = {
			'locations' : [
				{
					'lat' : results.lat,
					'lng' : results.lon						
				}
			],
			'radius' : 50
		};
		
		const panoPromise = this.getPanoId(locations);
		
		// Get the Streetview metadata.
		
		return panoPromise.then(
			function() {
				return processor.getStreetviewMetadata()
			},
			function() {
				processor.logger.error("Panorama request rejected");
			}
		);
	}

	createAnnotation(filename, dir, detectionData, width, height) {
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
		
		
		for (let i = 0; i < detectionData.classes.length; i++) {
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
}

module.exports = ImageDetectionProcessor;