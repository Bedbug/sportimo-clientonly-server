'use strict';

var expect = require('chai').expect,
    request = require('supertest'),
    mitm = require('mitm'),
    url = require('url'),
    assert = require('assert'),
    _ = require('lodash');

/****************************************************
 * Test helper objects
 */
var eventobj = require("./testObjects/eventYellow");
var playCard = require("./testObjects/playCard");
var mockMatch = require("./testObjects/mockMatch_withfeed.js");
var matchResponse = require('./testObjects/statsMatchShort.js');

var addEventData = {
    type: "Add",
    match_id: "56a38549e4b067030e9f8111",
    data: eventobj
};

var removeEventData = {
    type: "Delete",
    match_id: "56a38549e4b067030e9f8111",
    data: eventobj
};

/***************************************************/


// var mockgoose = require('mockgoose');
// mockgoose(mongoose);  

/*
   mockMatch.start = new Date(); //Date.parse(mockMatch.start);
//   // Set the match start 10  seconds from now
   mockMatch.start.setMinutes(mockMatch.start.getMinutes() + 1);




describe('Unit-Test the rss-service and Parser modules', function() {
    let service = require("../sportimo_modules/match-moderation/services/rss-feed");
    service.parsername = "Stats";
    service.type = "rss-feed";
    service.active = mockMatch.moderation[0].active || true;
    service.parsed_eventids = mockMatch.moderation[0].parsed_eventids || [];
    service.parserid = mockMatch.moderation[0].parserid;

   
    // Set up the mitm module's http request interception
    var interceptor = null;
    beforeEach(function() { interceptor = mitm(); });
    afterEach(function() { interceptor.disable() });
   
   
    let serviceInitialized = false;
    service.init(mockMatch, function(err, done) {
        if (err) {
            console.log(err.message);
            return;
        }
        serviceInitialized = true;
    });
   
   
    let segmentEventsNumber = 0;
    let eventsNumber = 0;
    let endOfMatch = false;
    
    service.emitter.on('nextMatchSegment', function(match) {
        segmentEventsNumber ++;
    });
    service.emitter.on('matchEvent', function(match) {
        eventsNumber ++;
    });
    service.emitter.on('endOfMatch', function(match) {
        endOfMatch = true;
    });
    service.emitter.on('error', function(error) {
        assert(false, 'An error event just came in: ' + error.message);
    });

    var matchResponseEvents = matchResponse.apiResults[0].league.season.eventType[0].events[0].pbp;
    
    it('the service emitter ended within time', function(done) { 
        var timeout = setTimeout(function() {
            done();
        }, 60000);
        
        // http request interception: Return ready-made responses for known endpoints
        // see: https://github.com/moll/node-mitm
        var responseIndex = 1;
        interceptor.on('request', function(req, res) {
            var uri = url.parse(req.url);
            if (req.headers.host == 'api.stats.com') {
                switch(uri.pathname) {
                case '/v1/stats/soccer/epl/events/1547146' :
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'application/json');
                    // Simulate event generation in time:
                    // Fabricate a progressively increased list of events by following the responseIndex sequence, and send them in the response
                    let clonedResponse = _.cloneDeep(matchResponse);
                    clonedResponse.apiResults[0].league.season.eventType[0].events[0].pbp = _.take(matchResponseEvents, responseIndex++);
                    res.end(JSON.stringify(clonedResponse));
                    break;
                case '/v1/stats/soccer/epl/scores/1547146' :
                    res.statusCode = 200;
                    res.setHeader('Content-Type', 'application/json');
                    res.end(JSON.stringify(matchResponse));
                    break;
                default :
                    break;
                }
            }
            else
            {
                // default behavior
                res.statusCode = 404;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({error: 'Not a known endpoint. Blocking http request.'}));
            }
        });
            
    });
    
    it('should have a service started without errors', function() {
        expect(serviceInitialized).to.be.equal(true);
    });
    it('should have a service started with a valid parser', function() {
    expect(service.parser).to.not.be.equal(null);
    });

        
    it('should emit messages to event subscribers without errors', function() {
        expect(eventsNumber).to.not.be.equal(0);
    });
    it('should emit segment advances to event subscribers without errors', function() {
        expect(segmentEventsNumber).to.not.be.equal(0);
    });
    it('should emit the end of match to event subscribers without errors', function() {
        expect(endOfMatch).to.be.equal(true);
    });
});
*/



var TestSuite = require('../server');
TestSuite.moderation.testing = true;

before(function (done) {
    // TestSuite.moderation.mock = true;
    TestSuite.moderation.callback = done;
    // setTimeout(done, 6000);
});

describe('Moderation Module', function () {

    describe('Init - Mongodb database', function () {

        it('expect to be connected to the database', function () {
            expect(TestSuite.moderation.mongoose).to.not.be.equal(null);
        });
    });
    
    
    

    // describe('Init - Load scheduled matches', function () {

    //     //   TestSuite.moderation.mock = true;

    //     // it('expect to not be set to mock enviroment', function () {
    //     //     expect(TestSuite.moderation.mock).to.be.false;
    //     // })

    //     it('expect to have loaded matches from database', function () {
    //         expect(TestSuite.moderation.count()).to.not.equal(0);
    //     });
    // });

    //    describe("Services", function () {
    //        describe("Manual Service", function () {
    // describe('- Post Match [/v1/live/match]', function () {
    //     it('should return the match with id 56a38549e4b067030e9f8111', function (done) {
    //         request(TestSuite.server)
    //             .post('/v1/live/match')
    //             .send({
    //                 id: '56a38549e4b067030e9f8111'
    //             })
    //             .expect(200)
    //             .end(function (err, res) {
    //                 if (err) return done(err);
    //                 expect(err).to.equal(null);
    //                 expect(res.body.id).to.equal("56a38549e4b067030e9f8111");
    //                 match = res.body;
    //                 done();
    //             })
    //     });
    // });
    // describe("SCHEDULE", function () {
 
        describe('Schedule new match [/v1/schedule]', function () {
            it('should add a new match to Scheduled Matches', function (done) {
                // TestSuite.moderation.Add(mockMatch);
                // done();
                request(TestSuite.server)
                    .post('/v1/schedule')
                    .send(mockMatch)
                    .expect(200)
                    .end(function (err, res) {
                       
                        if (err) return done(err);
                        expect(res.status).to.equal(200);
                        expect(res.body.id).to.equal('56a38549e4b067030e9f8111');
                        done();
                    });
            });

        });

        describe('Get match from schedule [/v1/schedule/56a38549e4b067030e9f8111]', function () {

            it('should return the match with ID 56a38549e4b067030e9f8111', function (done) {
                request(TestSuite.server)
                    .get('/v1/schedule/56a38549e4b067030e9f8111')
                    .expect(200)
                    .end(function (err, res) {
                       //  console.log("TEST Get Match:"+ err);
                    //    console.log(res.body);
                        expect(err).to.equal(null);
                        expect(res.body.id).to.equal("56a38549e4b067030e9f8111");
                       
                        match = res.body;
                        
                        done();
                    })
            })
        });
        
        
        

    // });

 

    // describe('GET [/v1/live/match/56a38549e4b067030e9f8111]', function () {

    //     it('should return the match with id 56a38549e4b067030e9f8111', function (done) {
    //         request(TestSuite.server)
    //             .get('/v1/live/match/56a38549e4b067030e9f8111')
    //             .expect(200)
    //             .end(function (err, res) {
    //                 expect(err).to.equal(null);
    //                 expect(res.body.id).to.equal("56a38549e4b067030e9f8111");
    //                 match = res.body;
    //                 done();
    //             })
    //     })
    // });

    describe('Send Event commands [/v1/moderation/:id/event]', function () {



        var returnedEvent;
        it('event type: Add, should add a new event', function (done) {
            request(TestSuite.server)
                .post('/v1/moderation/56a38549e4b067030e9f8111/event')
                .send(addEventData)
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    returnedEvent = res.body.data.timeline[res.body.data.state].events[res.body.data.timeline[res.body.data.state].events.length - 1];
                    removeEventData.data = returnedEvent;
                    expect(res.body.data.timeline[0].events.length).to.equal(1);
                    done();
                })
        });

        it('should have 3 new stat modifications', function () {

            var length = returnedEvent.linked_mods.length;
            expect(length).to.equal(3);
            //                    setTimeout(function(){console.log("done");done();}, 5000);
        });

        it('event type: Delete, should delete the last event', function (done) {
            request(TestSuite.server)
                .post('/v1/moderation/56a38549e4b067030e9f8111/event')
                .send(removeEventData)
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.data.timeline[0].events.length).to.equal(0);
                    done();
                })
        });

    });
    
    
    //        });
    describe('RSS-Feed Service', function () {
        it('match should have an RSS-Feed service registered', function () {
            service = _.findWhere(match.MODERATION_SERVICES, {
                type: 'rss-feed'
            });
            expect(service).to.not.be.equal(null);
        });

        it('should use a STATS parser', function () {
            //                console.log(service);
            expect(service.parsername).to.be.equal("Stats");
        });
    });



    //    });
});
var match = null;
var service = null;



describe('Wildcards Module', function () {


    var cardid = "";
    describe('Play card / 2 yellows', function () {
        it('should add a new wildacard', function (done) {
            request(TestSuite.server)
                .post('/v1/wildcards')
                .send(playCard)
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    cardid = res.body.id;
                    expect(res.body.model.userid).to.equal("56a6800f6304484833115a2c");
                    done();
                })
        });

        it('expect CardsInPlay to have been raised to 1', function () {
            expect(TestSuite.wildcards.CardsInPlay.length).to.be.equal(1);
        });
    });

    var returnedYellowOne;
    var returnedYellowTwo;

    //** ***********************************************
    //   2 Yellow Events to test winning wildcard
    //
    describe('Sent two yellow events', function () {

        it('first one should incerement stat "yellow" to 1', function (done) {
            request(TestSuite.server)
                .post('/v1/moderation/56a38549e4b067030e9f8111/event')
                .send(addEventData)
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    returnedYellowOne = res.body.data.timeline[res.body.data.state].events[res.body.data.timeline[res.body.data.state].events.length - 1];

                    var stats = TestSuite.moderation.GetMatch("56a38549e4b067030e9f8111").data.stats;

                    var stat = _.find(stats, {
                        id: "56ebd1add299e8ed04e93df5"
                    });

                    expect(stat.yellow).to.be.equal(1);
                    done();
                })
        });

        it('second one should incerement stat "yellow" to 2', function (done) {
            request(TestSuite.server)
                .post('/v1/moderation/56a38549e4b067030e9f8111/event')
                .send(addEventData)
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);

                    returnedYellowTwo = res.body.data.timeline[res.body.data.state].events[res.body.data.timeline[res.body.data.state].events.length - 1];

                    var stats = TestSuite.moderation.GetMatch("56a38549e4b067030e9f8111").data.stats;

                    var stat = _.find(stats, {
                        id: "56ebd1add299e8ed04e93df5"
                    });

                    expect(stat.yellow).to.be.equal(2);
                    done();
                })
        });

        it('should win the played card', function (done) {
           console.log("This fails as expected  - Not implemented yet");
            expect(TestSuite.wildcards.CardsInPlay[0].model.won).to.not.be.equal(null);
        })



        it('should delete the first yellow event', function (done) {
            removeEventData.data = returnedYellowOne;
            request(TestSuite.server)
                .post('/v1/moderation/56a38549e4b067030e9f8111/event')
                .send(removeEventData)
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.data.timeline[0].events.length).to.equal(1);
                    done();
                })
        });

        it('should delete the second yellow event', function (done) {
            removeEventData.data = returnedYellowTwo;
            request(TestSuite.server)
                .post('/v1/moderation/56a38549e4b067030e9f8111/event')
                .send(removeEventData)
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(res.body.data.timeline[0].events.length).to.equal(0);
                    done();
                })
        });

    })

    //************************************************************


    // describe('Send match series of events', function() {
    //     // Set up the mitm module's http request interception
    //     var interceptor = null;
    //     beforeEach(function() { interceptor = mitm(); });
    //     afterEach(function() { interceptor.disable() });
        
    //     it('the service emitter ended within time', function(done) { 
    //         var timeout = setTimeout(function() {
    //             done();
    //         }, 90000);
            
    //         // http request interception: Return ready-made responses for known endpoints
    //         // see: https://github.com/moll/node-mitm
    //         interceptor.on('request', function(req, res) {
    //             var uri = url.parse(req.url);
    //             if (req.headers.host == 'api.stats.com') {
    //                 switch(uri.pathname) {
    //                 case '/v1/stats/soccer/epl/events/1547146' :
    //                     res.statusCode = 200;
    //                     res.setHeader('Content-Type', 'application/json');
    //                     res.end(JSON.stringify(matchResponse));
    //                     break;
    //                 default :
    //                     break;
    //                 }
    //             }
    //             else
    //             {
    //                 // default behavior
    //                 res.statusCode = 404;
    //                 res.setHeader('Content-Type', 'application/json');
    //                 res.end(JSON.stringify({error: 'Not a known endpoint. Blocking http request.'}));
    //             }
    //         });
            
            
    //     });
        
    //     // it('should have added 5 events', function() {
    //     //     expect(match.GetCurrentSegment()).to.equal("First Half");
    //     // }); 
    // });



    describe('Clean Up', function () {

        it('should delete the last wildacard from the database', function (done) {
            request(TestSuite.server)
                .delete('/v1/wildcards')
                .send({
                    id: cardid
                })
                .expect(200)
                .end(function (err, res) {
                    if (err) return done(err);
                    expect(TestSuite.wildcards.CardsInPlay.length).to.be.equal(0);
                    done();
                })
        });

        it('expect CardsInPlay to fall back to 0', function (done) {

            expect(TestSuite.wildcards.CardsInPlay.length).to.be.equal(0);
            done();

        });
        
         it('should delete the match from Scheduled Matches', function (done) {

                request(TestSuite.server)
                    .delete('/v1/schedule/'+mockMatch._id)
                    .send(mockMatch)
                    .expect(200)
                    .end(function (err, res) {
                        if (err) return done(err);
                        expect(res.status).to.equal(200);
                        done();
                    })
            });

    });

    // describe("SCHEDULE", function () {
// 
        // describe('Delete [/v1/schedule]', function () {
            // it('should delete the match from Scheduled Matches', function (done) {

            //     request(TestSuite.server)
            //         .delete('/v1/schedule/'+mockMatch._id)
            //         .send(mockMatch)
            //         .expect(200)
            //         .end(function (err, res) {
            //             if (err) return done(err);
            //             expect(res.status).to.equal(200);
            //             done();
            //         })
            // });
        // });
    // });

});

