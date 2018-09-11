const ImageDetectionProcessor = require('./ImageDetectionProcessor.js'),
commandLineArgs = require('command-line-args'),
optionDefinitions = [
	  { name: 'imagedir', alias: 'd', type: String, defaultValue: './images' },
	  { name: 'saveimagedata', alias: 's', type: Boolean, defaultValue: false},
	  { name: 'help', alias: 'h', type: Boolean, defaultValue: false }
],
listenPort = process.env.PORT || 3100,
imageDir = process.argv[2],
commandLineUsage = require('command-line-usage'),
sections = [
  {
    header: 'Image Detection Server',
    content: 'Creates web services for image detection dedmo.'
  },
  {
    header: 'Options',
    optionList: [
      {
        name: 'imagedir',
        typeLabel: '{underline path}',
        description: 'The directory in which images are stored for detection processing.'
      },
	  {
        name: 'saveimagedata',
        description: 'Save images with metadata from detection processing.'
      },
      {
        name: 'help',
        description: 'Print this usage guide.'
      }
    ]
  }
],
usage = commandLineUsage(sections),
options = commandLineArgs(optionDefinitions);

if (options.help)
	console.log(usage);
else 
	new ImageDetectionProcessor(listenPort, options.imagedir, options.saveimagedata);
