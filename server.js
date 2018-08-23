var ImageDetectionProcessor = require('./ImageDetectionProcessor.js'),
listenPort = process.env.PORT || 3100,
imageDir = process.argv[2],
processor;

processor = new ImageDetectionProcessor(listenPort, imageDir);
