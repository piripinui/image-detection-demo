var ImageDetectionProcessor = require('./ImageDetectionProcessor.js'),
listenPort = process.env.PORT || 3100,
imageDir = process.argv[2],
saveImageData = process.argv[3],
processor;

if (saveImageData == "true") {
	saveImageData = true;
}

processor = new ImageDetectionProcessor(listenPort, imageDir, saveImageData);
