# image-detection-demo

This app demonstrates how a map-based client would use a Machine Learning-based image recognition service to find utility equipment (specifically poles, transformers and streetlights) from panoramic imagery (in this case, Google Streetview).

The map client is defined in the public directory by the file *image-detection-demo.html*. It is a basic [Openlayers](https://openlayers.org/) client using Google Streetview. When the "Press to Analyse..." button is pushed, it captures the Streetview image from the DOM and makes a POST request to the /saveimage endpoint hosted by the server. The request contains the image in its body, which is received by the server and saved as a file to disk. The server then makes a GET request to the ML service, which processes all JPEG files in the directory and produces new images with the detected equipment labelled on them. The request to the ML service is then responded to as successful and the app server then finds the processed file and the detection results and returns it to the client as a JSON object.

## The Application Server

The app's nodejs-based server is defined in *ImageDetectionProcessor.js* and started by *server.js*. It acts as the web server for the client and also middleware for passing requests for imagery processing to the ML backend. 

To see the command line options for the server, type:

`node server.js -h` or `node server.js --help`

A typical server invocation is something like this:

`node server.js --imagedir /foo/bar/images/`

By default this server runs on port 3100 but it can be changed by setting the PORT environment variable. The command line parameter shown in the example above defines the directory the server will write image files to. Note that this directory should exist and should also have subdirectories called `processed` and `stored` beneath it. The `processed` directory is used by the image recognition service to store processed images (see below). The `stored` directory is used by the application server to create copies of the source images and a matching [Pascal VOC](http://host.robots.ox.ac.uk/pascal/VOC/) XML metadata file based on the returned detection results that can be used for further image training refinement if desired. The server also creates a JSON file associated with the image that contains the lat/lon position and heading passed to it by the requesting client in the request body (see below).

### Services
The nodejs server creates several endpoints used in the demo:

|Service Name       |Description                                                  |Body|
|-------------------|-------------------------------------------------------------|----|
|`/analyseimage`    |POST request to analyse a JSON object that contains a JPEG Base64 encoded image plus position/bearing info in order to detect utility equipment from the image. Returns a JSON object containing the image with detected objects overlaid plus bounding metadata for each detection area. |JSON string with 3 properties `lat`, `lng` for the image's location and `base64Data` for the Base64 encoded image data |
|`/storeimage`      |POST request that stores a JPEG Base64 encoded image in a directory local to the server. Returns success or failure. |Base64 encoded image|
|`/getdirections`   |GET request that asks the [Google Directions API](https://developers.google.com/maps/documentation/directions/start) to retrieve quickest route between a start and an end coordinate. The two coordinates are specified as decimal degree latlons using the parameters `origin` and `destination`. Returns a GeoJSON feature containing a LineString representing the route.|N/A|

## Demo Client

The client is in the `public` directory and is served up by the nodejs server. To start it, type the following into a Chrome browser:

`http://localhost:3100/image-detection-demo.html`

## The Image Recognition Service
The image recognition is based on a Tensorflow image recognition example you can find here...

https://github.com/bourdakos1/Custom-Object-Detection

Some modifications to this example have been done to specifically detect poles, transformers and streetlights. These can be found in the `Custom-Object-Detection` directory. These should be overlaid over a clone of the repo above.
The main file is in a subdirectory called `object_detection` and is called `google_pole_object_detection_runner.py`. This is the script that should be run and when running it creates a web service that will process image files in a directory called specified by the second command line parameter (see example below). It will create new images labelled with detected equipment in a subdirectory called `/processed` below the nominated directory.

### Training
The service needs to be trained with a set of images containing the elements to be detected (currently poles, streetlights, transformers, rusty transformers and bad transformers). The definition of the number of detection classes is held in the configuration file `faster_rcnn_resnet101_poles.config`, specifically in the `num_classes` property. The definition of the classes themselves is held in `pole_annotations/label.pbtxt` (as specified in `faster_rcnn_resnet101_poles.config`) and you'll see the code words used to describe the objects types listed above in that file.

As described in the [original example](https://github.com/bourdakos1/Custom-Object-Detection) you need to download a Base Model to train from and this can be obtained from the [Model Zoo](https://github.com/bourdakos1/Custom-Object-Detection/blob/master/object_detection/g3doc/detection_model_zoo.md). As the configuration file name above suggests, I used the `faster_rcnn_resnet101_coco` model. These models consist of a number of files zipped up and the model checkpoint files should be placed in `Custom-Object-Detection` alongside the configuration file (`faster_rcnn_resnet101_poles.config`) which refers to that checkpoint name.

The image set used for training should be in a directory called `pole_images`. The images should be JPEG files that have associated [Pascal VOC](http://host.robots.ox.ac.uk/pascal/VOC/) metadata defining where the objects to be detected are in that image. That metadata is stored in an XML file with the same name as the JPEG file it refers to stored in `pole_annotations/xmls`. These XML files define the areas within the associated JPEG file which represent instances of the objects of interest i.e. pole, transformers etc. and so are critical for training. The location of the JPEG file is embedded in the XML document as well. Building up a healthy set of these images and Pascal VOC metadata is crucial for training - the more the better but at least 200 images plus metadata is a good start.

The Pascal VOC metadata in these XML files cannot be used directly by the image detection routines, instead it must be converted to Tensorflow Records first. This conversion is done by running `object_detection/create_tf_pole_record.py` (which also has the directory where the XML files are expected to be i.e. `pole_annotations/xml` hardwired into it). The result of running this successfully will be two files called `train.record` and `val.record` stored in the `Custom-Object-Detection` directory.

Once you have done this you can start the actual training. To do this, run the script execute a command line like this:

`python object_detection/train.py --logtostderr --train_dir=train --pipeline_config_path=faster_rcnn_resnet101_poles.config`

This code will use `train.record` and `val.record` to train against the image set in `pole_images`, minimising the loss. Its progress can be visualised using [TensorBoard](https://www.tensorflow.org/guide/summaries_and_tensorboard) against the content of the `train` directory if desired.

Training will take a long time (~2 days to complete the 200k iteration default) and should be performed on a machine that has a GPU.

Training will create checkpoint files in the `train` directory. At any point in training you can stop it and export an inference graph from the latest checkpoint. The interference graph is created in `pole_output_interference_graph` using the command something like:

`python object_detection/export_inference_graph.py --input_type image_tensor --pipeline_config_path faster_rcnn_resnet101_poles.config --trained_checkpoint_prefix model.ckpt-xxxxxx --output_directory pole_output_inference_graph`

...where xxxxxx is the checkpoint number of the checkpoint you are using to create the inference graph.

Note that the `model.ckpt-xxxxxxx` files are expected to be in the `Custom-Object-Detection` directory i.e. you would need to copy those files from `train` to that location.

### Running the Image Detection Service
Once the inference graph exists, you can actually detect objects in image files issuing a command something like this:

`python object_detection/google_pole_object_detection_runner.py 3200 /foo/bar/images`

The first parameter defines the port number the service will run on. The last parameter defines the directory from which the Tensorflow script should read images from. This directory should match the directory the server writes to (see above).

### Services
The Tensorflow-based server creates a single endpoint used in the demo:

|Service Name       |Description                                                  |
|-------------------|-------------------------------------------------------------|
|`/startdetection`    |GET request to analyse a JPEG file placed into a nominated directory in order to detect utility equipment. Returns a JSON string containing information about what was detected and creates processed image showing the detected objects in the a subdirectory called `processed` beneath the nominated directory. |


## Log Files

Both of the server create log files. The nodejs server creates its log files in the directory called `logs`. The Tensorflow server create its log files in the directory called `Custom-Object-Detection/logs`.

## Installation

### Nodejs Server

Do an `npm install`

### Tensorflow Server

Download the original example from https://github.com/bourdakos1/Custom-Object-Detection before installing this repo. Create am empty directory to put this repo in but put the contents of the original example in that directory (in `Custom-Object-Detection`) before putting the contents of this repo in the same parent directory. In this way you'll have the base example which will be overlaid with my modifications on top.

For the image recognition services and Tensorflow generally, [Python](https://www.python.org/) 3.6.5 must be installed. Once installed, the environment needs to be adjusted to point at the relevant paths.

Update the PATH variable as required by Python.

Create a PYTHONPATH variable while in `image-detection-demo/Custom-Object-Detection` directory as follows:

``export PYTHONPATH=`pwd`:`pwd`/slim``

Load all the Python dependencies using pip. Note that one of the dependencies is for the web component - you can find instructions on how to load this at http://webpy.org/.

Load the TensorFlow dependencies by running `pip install -r requirements.txt` in `Custom-Object-Detection`.

### Google API Keys
Keys to access the [Google Maps](https://developers.google.com/maps/documentation/javascript/tutorial), [Directions](https://developers.google.com/maps/documentation/directions/intro) and [Tile](https://developers.google.com/maps/documentation/tile/) APIs are required to run the app. These should be obtained from Google and stored in text files named according to the API in the `public` directory as follows:

|Filename                        |Description                                     |
|--------------------------------|------------------------------------------------|
|`public/maps_api_key.txt`       |Holds the API key for the Google Maps API       |
|`public/directions_api_key.txt` |Holds the API key for the Google Directions API |
|`public/tile_api_key.txt`       |Holds the API for the Google Tile API           |



