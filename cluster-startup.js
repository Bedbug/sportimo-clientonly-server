#!/usr/bin/env node


/*
 * How to set-up a daemon service in linux to host the node application:
 * https://www.axllent.org/docs/view/nodejs-service-with-systemd/
 */



"use strict";



const http = require('http');
const currentEnv = process.env.NODE_ENV || "development";
const cluster = require('cluster');
const logger = console;

const bootstrap = function () {

    if (currentEnv == "production") {
        if (cluster.isMaster) {
            const numWorkers = require('os').cpus().length;

            logger.log('Master cluster setting up ' + numWorkers + ' workers...');

            for (let i = 0; i < numWorkers; i++) {
                cluster.fork();
            }

            cluster.on('online', function (worker) {
                logger.log('Worker ' + worker.process.pid + ' is online');
            });

            cluster.on('exit', function (worker, code, signal) {
                logger.log('Worker ' + worker.process.pid + ' died with code: ' + code + ', and signal: ' + signal);
                logger.log('Starting a new worker');
                cluster.fork();
            });
        } else {
            const app = require('./server');
            const http = require('http');

            /**
             * Get port from environment and store in Express.
             */

            let port = normalizePort(process.env.PORT || '3000');
            app.set('port', port);

            /**
             * Create HTTP server.
             */
            http.globalAgent.maxSockets = Infinity;
            let server = http.createServer(app);

            /**
             * Listen on provided port, on all network interfaces.
             */

            server.listen(port, function () {
                //logger.log('Express server listening on port ' + server.address().port);
                logger.log("------------------------------------------------------------------------------------");
                logger.log("-------  Sportimo v2.0 Game CLIENTS-ONLY Server listening on port %d --------", server.address().port);
                logger.log("-------  Environment: " + process.env.NODE_ENV);
                logger.log("------------------------------------------------------------------------------------");
            });
            server.on('error', onError);
            server.on('listening', onListening);


            /**
             * Normalize a port into a number, string, or false.
             */

            function normalizePort(val) {
                let port = parseInt(val, 10);

                if (isNaN(port)) {
                    // named pipe
                    return val;
                }

                if (port >= 0) {
                    // port number
                    return port;
                }

                return false;
            }

            /**
             * Event listener for HTTP server "error" event.
             */

            function onError(error) {
                if (error.syscall !== 'listen') {
                    throw error;
                }

                const bind = typeof port === 'string'
                    ? 'Pipe ' + port
                    : 'Port ' + port;

                // handle specific listen errors with friendly messages
                switch (error.code) {
                    case 'EACCES':
                        logger.error(bind + ' requires elevated privileges');
                        process.exit(1);
                        break;
                    case 'EADDRINUSE':
                        logger.error(bind + ' is already in use');
                        process.exit(1);
                        break;
                    default:
                        throw error;
                }
            }

            /**
             * Event listener for HTTP server "listening" event.
             */

            function onListening() {
                const addr = server.address();
                const bind = typeof addr === 'string'
                    ? 'pipe ' + addr
                    : 'port ' + addr.port;
                logger.log('Listening on ' + bind);
            }
        }
    } else {

        // Dead simple server in local and development environments

        let app = require('./server');
        const http = require('http');

        app.set('port', process.env.PORT || 3000);

        http.globalAgent.maxSockets = 1024;
        let server = app.listen(app.get('port'), function () {
            //logger.log('Express server listening on port ' + server.address().port);
            logger.log("------------------------------------------------------------------------------------");
            logger.log("-------  Sportimo v2.0 Game CLIENTS-ONLY Server listening on port %d --------", server.address().port);
            logger.log("-------  Environment: " + process.env.NODE_ENV);
            logger.log("------------------------------------------------------------------------------------");
        });
    }
};

bootstrap();