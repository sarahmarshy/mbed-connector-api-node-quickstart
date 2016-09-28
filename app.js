// Load .env config (silently fail if no .env present)
require('dotenv').config({ silent: true });

// Require necessary libraries
var async = require('async');
var ioLib = require('socket.io');
var http = require('http');
var path = require('path');
var express = require('express');
var MbedConnectorApi = require('mbed-connector-api');

// CONFIG (change these)
var accessKey = process.env.ACCESS_KEY || "ChangeMe";
var port = process.env.PORT || 8080;

// Paths to resources on the endpoints
var blinkPatternResourceURI = '/LED/0/DoBlink';
var nameResourceURI = '/NAME/0/DeviceName';

// Instantiate an mbed Device Connector object
var mbedConnectorApi = new MbedConnectorApi({
  accessKey: accessKey
});

// Create the express app
var app = express();
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'hbs');
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function (req, res) {
  // Get all of the endpoints and necessary info to render the page
  mbedConnectorApi.getEndpoints(function(error, endpoints) {
    console.log(endpoints)
    if (error) {
      throw error;
    } else {
      // Setup the function array
      var functionArray = endpoints.map(function(endpoint) {
        return function(mapCallback) {
          mbedConnectorApi.getResourceValue(endpoint.name, nameResourceURI, function(error, value) {
            endpoint.deviceName = value;
            mapCallback(error);
          });
        };
      });

      // Fetch all blink patterns in parallel, finish when all HTTP
      // requests are complete (uses Async.js library)
      async.parallel(functionArray, function(error) {
        if (error) {
          res.send(String(error));
        } else {
          res.render('index', {
            endpoints: endpoints
          });
        }
      });
    }
  });
});

// Handle unexpected server errors
app.use(function(err, req, res, next) {
  console.log(err.stack);
  res.status(err.status || 500);
  res.render('error', {
    message: err.message,
    error: err
  });
});

var sockets = [];
var server = http.Server(app);
var io = ioLib(server);

// Setup sockets for updating web UI
io.on('connection', function (socket) {
  // Add new client to array of client upon connection
  sockets.push(socket);

  socket.on('blink', function(data) {
    // POST to resource '/LED/0/DoBlink' (start blinking LED)
    mbedConnectorApi.postResource(data.endpointName, blinkPatternResourceURI, null, function(error) {
      if (error) throw error;
    });
  });

  socket.on('disconnect', function() {
    // Remove this socket from the array when a user closes their browser
    var index = sockets.indexOf(socket);
    if (index >= 0) {
      sockets.splice(index, 1);
    }
  })
});

// Start the app
server.listen(port, function() {
  // Set up the notification channel (pull notifications)
  mbedConnectorApi.startLongPolling(function(error) {
    if (error) throw error;
    console.log('mbed Device Connector Quickstart listening at http://localhost:%s', port);
  })
});
