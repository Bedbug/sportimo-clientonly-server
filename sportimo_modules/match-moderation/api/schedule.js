/**
 * API Routes that handle Scheduled Matches
 */

var express = require('express'),
    router = express.Router(),
    log = require('winston');

module.exports = function(ModerationModule) {

    // GET all schedule
    // router.get('/v1/schedule/country/:country', function(req, res) {
    //     log("[SCHEDULE] Request all Matches Schedule.", "info");
    //     ModerationModule.GetSchedule(res);
    // });
    
    // GET all schedules from the mongo data store
    router.get('/v1/schedule/', function(req, res) {
        log.info("[SCHEDULE] Request all Matches Schedule.");
        ModerationModule.GetSchedule(function(err, schedules) {
            if (err)
                return res.status(500).json({error: err.message});
            
            if (schedules == null)
                return res.status(400).send("Schedules not found");
                
            return res.status(200).send(schedules);
        });
    });

    // GET a match from a selected schedule
    router.put('/v1/schedule/:id', function(req, res) {
        log.info("[SCHEDULE] Updating Match info.");
        ModerationModule.UpdateScheduleMatch(req.body, function(err, schedule) {
            if (err)
                return res.status(500).json({error: err.message});

            return res.status(200).send(schedule);                
        });
    });

    // GET a match from a selected schedule
    router.get('/v1/schedule/:id', function(req, res) {
        // console.log(req.params.id);
        log.info("[SCHEDULE] Match request from schedule.");
        var matchFound = ModerationModule.GetMatch(req.params.id);
        log.debug("Do we have a match: " + matchFound);
       
        if (!matchFound)
            return res.status(404).json({ error: 'match id ' + req.params.id + ' was not found.' });
       
        return res.status(200).send(matchFound);
    });

    /** POST schedules a new match. 
     *  ModerationModule should handle creation in database.
    */
    router.post('/v1/schedule/', function(req, res) {
        log.info("[SCHEDULE] Request to schedule a new match.");
        ModerationModule.AddScheduleMatch(req.body, function(err, newSchedule) {
            if (err)
            {
                log.warn(err.message);
                return res.status(500).json({error: err.message});
            }
            
            return res.status(200).send(newSchedule);
        });
      
    });

    /** DELETE removes a match from schedule. 
     *  ModerationModule should handle deletion from database.
     */
    router.delete('/v1/schedule/:id', function(req, res) {

        log.info("[SCHEDULE] Request to remove match from schedule.");
        ModerationModule.RemoveScheduleMatch(req.params.id, function(err) {
            if (err)
            {
                log.warning(err.message);
                return res.status(500).json({error: err.message});
            }
            return res.status(200).send();                
        });
    });


    return router;
};
