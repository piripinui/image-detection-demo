const ImageDetectionProcessor = require('./ImageDetectionProcessor.js'),
commandLineArgs = require('command-line-args'),
optionDefinitions = [
	{ name: 'imagedir', alias: 'd', type: String, defaultValue: './images' },
	{ name: 'saveimagedata', alias: 's', type: Boolean, defaultValue: false },
	{ name: 'port', alias: 'p', type: Number },
	{ name: 'help', alias: 'h', type: Boolean, defaultValue: false }
],
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
        name: optionDefinitions[0].name,
		alias: optionDefinitions[0].alias,
        typeLabel: '{underline path}',
        description: 'The directory in which images are stored for detection processing.'
      },
	  {
        name: optionDefinitions[1].name,
		alias: optionDefinitions[1].alias,
        description: 'Save images with metadata from detection processing.'
      },
	  {
        name: optionDefinitions[2].name,
		alias: optionDefinitions[2].alias,
		typeLabel: '{underline port number}',
        description: 'Sets the port number for the server to use. If not used, the PORT environment variable is used. If that is not defined, the server defaults to port 3100.'
      },
      {
        name: optionDefinitions[3].name,
		alias: optionDefinitions[3].alias,
        description: 'Print this usage guide.'
      }
    ]
  }
],
usage = commandLineUsage(sections),
options = commandLineArgs(optionDefinitions);

var listenPort = process.env.PORT || 3100;

if (options.port)
	listenPort = options.port;

if (options.help)
	console.log(usage);
else 
	new ImageDetectionProcessor(listenPort, options.imagedir, options.saveimagedata);
