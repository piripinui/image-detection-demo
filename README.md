# google_maptile_demo

This app demonstrates how a map-based client would use a Machine Learning-based image recognition service to find utility equipment (specifically poles, transformers and streetlights) from panoramic imagery (in this case, Google Streetview).

The map client is defined in the public directory. It is a basic Openlayers client using Google Streetview. When the "Press to Analyse..." button is pushed, it captures the Streetview image from the DOM and makes a POST request to the /saveimage endpoint hosted by the server. The request contains the image in its body, which is received by the server and saved as a file to disk. The server then makes a GET request to the ML service, which processes all JPEG files in the directory and produces new images with the detected equipment labelled on them. The request to the ML service is then responded to as successful and the app server then finds the processed file and the detection results and returns it to the client as a JSON object.

The app's server is defined in `server.js`. It acts as the web server for the client and also middleware for passing requests for imagery processing to the ML backend. To run this server type:

`node server.js /foo/bar/images/`

By default this server runs on port 3100. The command line parameter shown in the example above defines the directory the server will write image files to.

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
## Installation
For the image recognition services, [Python](https://www.python.org/) 3.6.5 must be installed. Once installed, the environment needs to be adjusted to point at the relevant paths:

Update the PATH variable as required by Python.

Create a PYTHONPATH variable while in `google_maptiles_demo/Custom-Object-Detection` directory as follows:

``export PYTHONPATH=`pwd`:`pwd`/slim``

Load all the Python dependencies using pip. Note that one of the dependencies is for the web component - you can find instructions on how to load this at http://webpy.org/.

## Google API Keys
Keys to access the [Google Maps](https://developers.google.com/maps/documentation/javascript/tutorial), [Directions](https://developers.google.com/maps/documentation/directions/intro) and [Tile](https://developers.google.com/maps/documentation/tile/) APIs are required to run the app. These should be obtained from Google and stored in text files named according to the API in the `public` directory as follows:

|Filename                        |Description                                     |
|--------------------------------|------------------------------------------------|
|`public/maps_api_key.txt`       |Holds the API key for the Google Maps API       |
|`public/directions_api_key.txt` |Holds the API key for the Google Directions API |
|`public/tile_api_key.txt`       |Holds the API for the Google Tile API           |

