var request = require('supertest'),
express = require('express');

process.env.NODE_ENV = 'test';

var app = require('../app.js');
var _id = '';


describe('POST New Sponsor', function(){
  it('creates new sponsor and responds with json success message', function(done){
    request(app)
    .post('/api/sponsor')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .send({"sponsor": {"company":"Some of the accused Pendle witches, such as Alizon Device, seem to have genuinely believed in their guilt, but others protested their innocence to the end.","name":"This approach originated in the late 1950s, when city planners began to encourage the building of high-rise residential towers in Vancouver's West End, subject to strict requirements for setbacks and open space to protect sight lines and preserve green space.","banner":"Carrots were available in many variants during the Middle Ages: among them a tastier reddish-purple variety and a less prestigious green-yellow type.","video":"William, Prince of Orange was also considered a suitor, but because of his extravagant lifestyle in Paris, where he lived openly with a mistress, the Queen quickly vetoed the idea.","created":"2001-02-07T16:58:59.029Z"}})
    .expect(201)
    .end(function(err, res) {
      if (err) {
        throw err;
      }
      _id = res.body._id;
      done();
    });
  });
});

describe('GET List of Sponsors', function(){
  it('responds with a list of sponsor items in JSON', function(done){
    request(app)
    .get('/api/sponsors')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200, done);
  });
});

describe('GET Sponsor by ID', function(){
  it('responds with a single sponsor item in JSON', function(done){
    request(app)
    .get('/api/sponsor/'+ _id )
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200, done);
  });
});


describe('PUT Sponsor by ID', function(){
  it('updates sponsor item in return JSON', function(done){
    request(app)
    .put('/api/sponsor/'+ _id )
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .send({ "sponsor": { "title": "Hell Is Where There Are No Robots" } })    
    .expect(200, done);
  });
});

describe('DELETE Sponsor by ID', function(){
  it('should delete sponsor and return 200 status code', function(done){
    request(app)
    .del('/api/sponsor/'+ _id) 
    .expect(204, done);
  });
});