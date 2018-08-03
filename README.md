# google_maptile_demo

This app demonstrates how a map-based client would use a Machine Learning-based image recognition service to find utility equipment (specifically poles, transformers and streetlights) from panoramic imagery (in this case, Google Streetview).

The map client is defined in the public directory.

The app's server is defined in server.js. It acts as the web server for the client and also middleware for passing requests for imagery processing to the ML backend.