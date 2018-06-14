/*
 *  Notifications Module
 *  Created by MasterBug on 22/10/15.
 *
 *  Module usage:
 *  Clients inform the module everytime there is an action by 
 *  calling PUT "/v1/notifications/users/". This endpoint records 
 *  data to the DB. A dashboard module request users by calling
 *  GET "/v1/notifications/users/" and can sort users by filters.
 *  Then it can call the endpoint POST "/v1/notifications/push" to
 *  order the module to send push notifications to the list. 
*/

var needle = require('needle');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var moment = require('moment');

var app;



/* ================================
 *  PUSHWOOSH API
 ** ==============================*/
var PushOptions = {
    api: "https://cp.pushwoosh.com/json/1.3/createMessage",
    application: "F18C2-2FBDB",
    auth: "RjBCef0fkWWCw0tI8Jw0fvHQbBCGZJUvtE4Z14OlCAeKAWNRk5RHhQnYbqW03ityah2wiPVsA2qzX2Kz7E2l",
};


function log(text) {
  //  console.log("[Notifications Module] " + text);
}

/* ================================
 *  MONGODB SCHEMAS
 ** ==============================*/
var user = mongoose.Schema({
    name: String,
    userid: String,
    pushtoken: String,
    last_match_visited: String,
    matches_visited: [mongoose.Schema.Types.Mixed],
    visit_after_kickoff: String,
    last_action_time: Date
});

var Users = mongoose.model("User", user);

var notifications = {
    /* ================================
 *  MONGODB CONNECTION
 ** ==============================*/
    setMongoConnection: function (uri) {
        mongoose.connect(uri);
        log("Connected to MongoDB");
    },
    SetupServer: function (server) {
        app = server;
        app.use(bodyParser.json());
        app.use(function (req, res, next) {
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
            res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
            next();
        });


        /* =========================
         * -----------------------------------
         *   USER ENDPOINTS
         * -----------------------------------
         =========================*/
        app.put('/v1/notifications/users/', function (req, res) {

            req.body.last_action_time = moment();


            return Users.findOne({ userid: req.body.userid }, function (err, user) {


                if (user) {

                    //console.log("Found User");

                    var update = 0;

                    for (var i = 0; i < user.matches_visited.length; i++) {
                        if (user.matches_visited[i].match == req.body.last_match_visited) {
                            update = 1;
                            user.name = req.body.name;
                            user.matches_visited[i].afterKickoff = req.body.visit_after_kickoff;

                            //console.log("Found match: "+ req.body.last_match_visited+". updating it to: "+ user.matches_visited[i].afterKickoff);
                        }
                    }

                    if (update == 0) user.matches_visited.push({ match: req.body.last_match_visited, afterKickoff: req.body.visit_after_kickoff });

                    user.markModified('matches_visited');

                     user.last_match_visited = req.body.last_match_visited;
                     user.pushtoken = req.body.pushtoken;
                     user.last_action_time = moment();

                    user.save(function (err) {
                        if (!err)
                            return res.sendStatus(200);
                    })
                } else {
                    req.body.matches_visited = [];
                    req.body.matches_visited.push({ match: req.body.last_match_visited, afterKickoff: req.body.visit_after_kickoff });
                    Users.update({ userid: req.body.userid }, req.body, { upsert: true }, function () {
                        return res.sendStatus(200);
                    });
                }

            });



        });

        app.get('/v1/notifications/users/', function (req, res) {
            log("Get Users");
            Users.find({}, function (err, list) {

                return res.send(list);
            })
        });


        /* =========================
         * -----------------------------------
         *   PUSH ENDPOINTS
         * -----------------------------------
         =========================*/

        /**
         * @api {post} api/tests/push/:token Send  push to Token
         * @apiName SendPush
         * @apiGroup Pushes
         * @apiVersion 0.0.1
         * @apiParam [String] tokens    The tokens list for the devices to push the message
         * @apiParam [String] messages  {"language":"message"}
         * @apiParam [String] data      data payload for the notification
         *
         *
         */

        app.post('/v1/notifications/push', function (req, res) {
            log("Push request received");
            /*
            *   NotificationMessage can be multilingual in the form of
            *   {
            *      "en": ENGLISH_MESSAGE,
            *      "ru": RUSIAN_MESSAGE
            *   }
            */
            var PushRequest = {
                NotificationMessage: req.body.message,
                NotificationData: req.body.data,
                tokens: req.body.tokens,
                application: req.body.application
            }
           return pushUser(PushRequest.tokens, PushRequest.NotificationMessage, PushRequest.NotificationData, res, PushRequest.application);
            // return res.status(200).send(JSON.stringify(PushRequest));
        });
    }
}


var indxer = 0;

var pushUser = function (tokens, NotificationMessage, data, callerResponse, application) {

    //console.log("[PUSH] Sending pushes with data: " + JSON.parse(data));
    
    // for (var i = 0; i < tokens.length; i++) {
    //     //console.log(i);
         console.log("[PUSH] Send push to app: " + (application || PushOptions.application));
    // }

    var options = {
        headers: { 'content_type': 'application/json' }
    }



    var payload;

    if (data != undefined) {
        payload =
        {
            "request": {
                "application":  application || PushOptions.application,
                "auth": PushOptions.auth,
                "notifications": [
                    {
                        "send_date": "now",
                        "ignore_user_timezone": true,
                        "content": (typeof NotificationMessage === 'string' || NotificationMessage instanceof String)? JSON.parse(NotificationMessage): NotificationMessage,
                        "devices": tokens,
                        "data": (typeof data === 'string' || data instanceof String)? JSON.parse(data): data,

                    }
                ]
            }
        }
    }
    else {
        payload =
        {
            "request": {
                "application": application || PushOptions.application,
                "auth": PushOptions.auth,
                "notifications": [
                    {
                        "send_date": "now",
                        "ignore_user_timezone": true,
                        "content": (typeof NotificationMessage === 'string' || NotificationMessage instanceof String)? JSON.parse(NotificationMessage): NotificationMessage,
                        "devices": tokens

                    }
                ]
            }
        }
    }

    //);

   return needle.post(PushOptions.api, payload, { json: true }, function (err, resp, body) {

        if (!err) {

            return callerResponse.send("[PUSH] Sent push to app: " + (application || PushOptions.application));
        }
        else {
            console.log(err);
            return callerResponse.send(err);
        }
        // in this case, if the request takes more than 5 seconds
        // the callback will return a [Socket closed] error
    });

}


module.exports = notifications;