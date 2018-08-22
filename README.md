# google_maptile_demo

This app demonstrates how a map-based client would use a Machine Learning-based image recognition service to find utility equipment (specifically poles, transformers and streetlights) from panoramic imagery (in this case, Google Streetview).

The map client is defined in the public directory. It is a basic [Openlayers](https://openlayers.org/) client using Google Streetview. When the "Press to Analyse..." button is pushed, it captures the Streetview image from the DOM and makes a POST request to the /saveimage endpoint hosted by the server. The request contains the image in its body, which is received by the server and saved as a file to disk. The server then makes a GET request to the ML service, which processes all JPEG files in the directory and produces new images with the detected equipment labelled on them. The request to the ML service is then responded to as successful and the app server then finds the processed file and the detection results and returns it to the client as a JSON object.

## The Application Server

The app's nodejs-based server is defined in `server.js`. It acts as the web server for the client and also middleware for passing requests for imagery processing to the ML backend. To run this server type:

`node server.js /foo/bar/images/`

By default this server runs on port 3100 but it can be changed by setting the PORT environment variable. The command line parameter shown in the example above defines the directory the server will write image files to. Note that this directory should exist and should also have subdirectories called `processed` and `stored` beneath it. The `processed` directory is used by the image recognition service to store processed images (see below). The `stored` directory is used by the application server to create copies of the source images and a matching [Pascal VOC](http://host.robots.ox.ac.uk/pascal/VOC/) XML metadata file based on the returned detection results that can be used for further image training refinement if desired. The server also creates a JSON file associated with the image that contains the lat/lon position and heading passed to it by the requesting client in the request body (see below).

### Services
The nodejs server creates several endpoints used in the demo:

|Service Name       |Description                                                  |
|-------------------|-------------------------------------------------------------|
|`/analyseimage`    |POST request to analyse a JSON object that contains a JPEG Base64 encoded image plus position/bearing info in order to detect utility equipment from the image. Returns a JSON object containing the image with detected objects overlaid plus bounding metadata for each detection area. |
|`/storeimage`      |POST request that stores a JPEG Base64 encoded image in a directory local to the server. Returns success or failure. |
|`/getdirections`   |GET request that asks the [Google Directions API](https://developers.google.com/maps/documentation/directions/start) to retrieve quickest route between a start and an end coordinate. The two coordinates are specified as decimal degree latlons using the parameters `origin` and `destination`. Returns a GeoJSON feature containing a LineString representing the route.|

## Demo Client

The client is in the `public` directory. To start it, type the following into a Chrome browser:

`http://localhost:3100/ol3-example.html`

## The Image Recognition Service
The image recognition is based on a Tensorflow image recognition example you can find here...

https://github.com/bourdakos1/Custom-Object-Detection

Some modifications to this example have been done to specifically detect poles, transformers and streetlights. These can be found in the `Custom-Object-Detection` directory. These should be overlaid over a clone of the repo above.
The main file is in a subdirectory called `object_detection` and is called `google_pole_object_detection_runner.py`. This is the script that should be run and when running it creates a web service that will process image files in a directory called specified by the second command line parameter (see example below). It will create new images labelled with detected equipment in a subdirectory called `/processed` below the nominated directory.

For example, to run the script execute a command line like this

`python object_detection/google_pole_object_detection_runner.py 3200 /foo/bar/images`

The first parameter defines the port number the service will run on. The last parameter defines the directory from which the Tensorflow script should read images from. This directory should match the directory the server writes to (see above).

### Services
The Tensorflow-based server creates a single endpoint used in the demo:

|Service Name       |Description                                                  |
|-------------------|-------------------------------------------------------------|
|`/startdetection`    |GET request to analyse a JPEG file placed into a nominated directory in order to detect utility equipment. Returns a JSON string containing information about what was detected and creates processed image showing the detected objects in the a subdirectory called `processed` beneath the nominated directory. |

## Installation
For the image recognition services, [Python](https://www.python.org/) 3.6.5 must be installed. Once installed, the environment needs to be adjusted to point at the relevant paths:

Update the PATH variable as required by Python.

Create a PYTHONPATH variable while in `google_maptiles_demo/Custom-Object-Detection` directory as follows:

``export PYTHONPATH=`pwd`:`pwd`/slim``

Load all the Python dependencies using pip. Note that one of the dependencies is for the web component - you can find instructions on how to load this at http://webpy.org/.

### Google API Keys
Keys to access the [Google Maps](https://developers.google.com/maps/documentation/javascript/tutorial), [Directions](https://developers.google.com/maps/documentation/directions/intro) and [Tile](https://developers.google.com/maps/documentation/tile/) APIs are required to run the app. These should be obtained from Google and stored in text files named according to the API in the `public` directory as follows:

|Filename                        |Description                                     |
|--------------------------------|------------------------------------------------|
|`public/maps_api_key.txt`       |Holds the API key for the Google Maps API       |
|`public/directions_api_key.txt` |Holds the API key for the Google Directions API |
|`public/tile_api_key.txt`       |Holds the API for the Google Tile API           |


