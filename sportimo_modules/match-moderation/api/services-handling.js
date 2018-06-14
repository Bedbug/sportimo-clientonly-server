var express = require('express'),
    router = express.Router();

module.exports = function (ModerationModule) {



    /* Moderation services Handling */
    
    // Get all active services on specified match id
    router.get('/v1/moderation/:id/service', function (req, res) {
        var match_id = req.params.id;
        var result = ModerationModule.GetMatch(match_id).GetServices();
        if (result.error != null)
            return res.status(500).json({ error: result.error });
        
        return res.status(200).send(result);
    });

    // Get all update object from Stats regarding possession and touches
    router.get('/v1/moderation/:id/service/:league/:parserid', function (req, res) {
        var match_id = req.params.id;
        // console.log(match_id);
        ModerationModule.GetMatch(match_id).updateFeedMatchStats(req.params.league, req.params.parserid, function(err, result){
        if(err)
            return res.status(500).json({ error:err });
        
        return res.status(200).send(result);
        });
        
    });
    


    // Add a new service on specified match id
    router.post('/v1/moderation/:id/service/add', function (req, res) {
        var match_id = req.params.id;
        ModerationModule.GetMatch(match_id).AddModerationService(req.body, function(error, result) {
            if (error != null)
                return res.status(500).json({ error: error.message });
            
            return res.status(200).send(result);            
        });
    });

    // Pause a service on specified match id
    router.put('/v1/moderation/:id/service/pause', function (req, res) {
        var match_id = req.params.id;
        ModerationModule.GetMatch(match_id).PauseService(req.body, function(error, result) {
            if (error != null)
                return res.status(500).json({ error: error.message });
        
            return res.status(200).send();
        });
    });

    // Resume a service on specified match id
    router.put('/v1/moderation/:id/service/resume', function (req, res) {
        var match_id = req.params.id;
        ModerationModule.GetMatch(match_id).ResumeService(req.body, function(error, result) {
            if (error != null)
                return res.status(500).json({ error: error });
            
            return res.status(200).send();
        });
    });
    
    return router;
}
