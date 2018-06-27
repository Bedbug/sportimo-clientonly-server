var express = require('express'),
    router = express.Router(),
    log = require('winston'),
    moment = require('moment');


module.exports = function (gamecardModule) {

    /*

    // Used to test easily award handling on gamecard wins
    router.get('/v1/gamecards/testawards', function(req, res) {
        gamecardModule.testAwardsHandling(function(error, data) {
            if (error)
                return res.status(400).json(error);
            return res.status(200).json(data);
        });
    });


    // Get existing template gamecards
    // Used by the dashboard
    router.get('/v1/gamecards/templates', function(req, res) {
        gamecardModule.getTemplates(function(error, data) {
            if (error)
                return res.status(400).json(error);
            return res.status(200).json(data);
        });
    });
    */

    // Get server time
    router.get('/v1/gamecards/time', function(req, res) {        
            res.status(200).json({"time":moment.utc().format()});    
    });
    /*
     // Create match definitions from schedule
    // Used by the dashboard
    router.get('/v1/gamecards/:mid/createdefs', function(req, res) {
        gamecardModule.createMatchDefinitions(req.params.mid, function(error, data) {
            if (error)
                return res.status(400).json(error);
            return res.status(200).json(data);
        });
    });
    
    
    // upsert existing template gamecards
    // Used by the dashboard
    router.post('/v1/gamecards/templates', function (req, res) {
        gamecardModule.upsertTemplate(req.body, function (error, data) {
            if (error) {
                log.log('error', error.stack, req.body);
                return res.status(400).send(error.message);
            }
            return res.status(200).json(data);
        });
    });
    
    // upsert existing template gamecards
    // Used by the dashboard
    router.put('/v1/gamecards/templates/:defid', function(req, res) {
        gamecardModule.upsertTemplate(req.body, function (error, data) {
            if (error) {
                log.log('error', error.stack, req.body);
                return res.status(400).send(error.message);
            }
            return res.status(200).json(data);
        });
    });

    router.delete('/v1/gamecards/templates/:defid', function(req, res) {
        gamecardModule.removeTemplate(req.params.defid, function (error, data) {
            if (error) {
                log.log('error', error.stack, req.body);
                return res.status(500).json(error);
            }
            return res.send(data);
         });
    });
    */

    // Get existing definition gamecards for a specific matchId
    // Used by both the dashboard and the clients
    router.get('/v1/gamecards/:matchId/definitions', function(req, res) {
        gamecardModule.getDefinitions(function(error, data) {
            if (error)
                res.status(400).json( { error: error });
            res.status(200).json({ error: null, data: data });
        });
    });

    /*
    // Get existing definition gamecards for a specific matchId
    // Used only by the dashboard. Removes complex response for easier mapping.
    router.get('/v1/gamecards/:matchId/matchdefinitions', function(req, res) {
        gamecardModule.getMatchDefinitions(req.params.matchId, function(error, data) {
            if (error)
                return res.status(400).json(error);
            res.status(200).json(data);
        });
    });
    
    // upsert existing definition gamecards for a specific matchId
    // Used by the dashboard. Changed for easier Restangular actions on the API
    router.post('/v1/gamecards/:matchId/matchdefinitions', function(req, res) {
        gamecardModule.addMatchDefinition(req.body, function(error, data) {
            if (error) {
                log.log('error', error.stack, req.body);
                return res.status(400).json(error);
            }
            return res.status(200).json(data);                
        });
    });
    
     router.put('/v1/gamecards/:matchId/matchdefinitions/:cardid', function(req, res) {
        gamecardModule.updateMatchDefinition(req.body, function(error, data) {
            if (error) {
                log.log('error', error.stack, req.body);
                return res.status(400).json(error);
            }
            return res.status(200).json(data);                
        });
    });
    

     // Delete method to remove gamecard match definitions
    router.delete('/v1/gamecards/:matchId/matchdefinitions/:cardid', function (req, res) {
        gamecardModule.deleteMatchDefinition(req.params.cardid, function(error, data) {
            if (error) {
                log.log('error', error.stack, req.body);
                return res.status(500).json(error);
            }
            return res.status(200).json(data);
        });
    });
    */


    /**
     * GET user gamecards
     * used by clients to populate their gamecard rolodex.
     */
    router.get('/v1/gamecards/:matchId/user/:userId', function (req, res) {
        gamecardModule.getUserInstances(req.params.matchId, req.params.userId, function(error, data) {
            if (error)
                return res.status(500).json({ error: error.message });
            log.debug(data);
            return res.status(200).json({ error: null, data: data });
        });
    });

    /**
     * ADD
     * Adds a new gamecard. Data for the gamecard are incorporated
     * in the post body. Look in /models/gamecards.js for more info.
     * 
     * Post body sample:
     * {
            "wildcardDefinitionId": "",
            "userId": "",
            "creationTime": "",
            
     * }
     *
     * Returns the created userGamecard document
     *
     * Used by clients
     */
    router.post('/v1/gamecards/:matchId/users', function (req, res) {
        gamecardModule.addUserInstance(req.params.matchId, req.body, function(error, validationError, data) {
            if (error) {
                log.log('error', error.stack, req.body);
                return res.status(500).json({ error: error.message, userGamecard: data });
            }
            if (validationError)
            {
                var itsNow = moment.utc();
                return res.status(400).json({ error: validationError.message, responseTimeUtc: itsNow });
            }
            // console.log("Created card:\n"+ JSON.stringify(data));
            return res.status(200).json({ error: null, userGamecard: data });
        });
    });
    
        
    router.put('/v1/gamecards/:userGamecardId/users', function (req, res) {
        gamecardModule.updateUserInstance(req.params.userGamecardId, req.body, function(error, validationError, data) {
            if (error) {
                log.log('error', error.stack, req.body);
                return res.status(500).json({ error: error.message, errorCode: 10000, userGamecard: data });
            }
            if (validationError)
            {
                var itsNow = moment.utc();
                return res.status(403).json({ error: validationError.message, errorCode: validationError.code, responseTimeUtc: itsNow });
            }
            log.debug(data);
            return res.status(200).json({ error: null, errorCode: null, userGamecard: data });
        });
    });
    
    
    /**
     * DELETE
     * Delete function is only available for unit testing. No real
     * other functionality.
     */

    /*
    router.delete('/v1/gamecards/:matchId/users', function (req, res) {
        gamecardModule.deleteUserInstance(req.body.id, function(error, data) {
            if (error) {
                log.log('error', error.stack, req.body);
                return res.status(500).json({ error: error.message });
            }
            return res.status(200).json({ error: null, data: data });
        });
    });
    */

    /* ReEvaluate UserGamecards */
    /*
    router.put('/v1/gamecards/:matchId/users/reload', function(req, res) {
        var matchId = req.params.matchId;
        gamecardModule.ReEvaluateAll(matchId, function(error, success) {
            if (error) {
                log.log('error', error.stack, req.body);
                return res.status(500).json({ error: error.message });
            }
            return res.status(200).json({ error: null, data: success });
       });
    });
    */


    return router;
};
