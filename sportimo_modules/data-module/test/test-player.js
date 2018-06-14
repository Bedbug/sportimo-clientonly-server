var request = require('supertest'),
express = require('express');

process.env.NODE_ENV = 'test';

var app = require('../app.js');
var _id = '';


describe('POST New Player', function(){
  it('creates new player and responds with json success message', function(done){
    request(app)
    .post('/api/player')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .send({"player": {"name":"21/453 Squadron), operating obsolescent Brewster Buffalos.","team_id":"It is not known where this battle was, or who was the victor.","pic":"A railway was among the inducements for British Columbia to join the Confederation in 1871, but the Pacific Scandal and arguments over the use of Chinese labour delayed construction until the 1880s.","team_name":"Fifteen other towns and cities were also badly affected, including Guano, which was devastated.","created":"1985-04-24T10:15:49.248Z"}})
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

describe('GET List of Players', function(){
  it('responds with a list of player items in JSON', function(done){
    request(app)
    .get('/api/players')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200, done);
  });
});

describe('GET Player by ID', function(){
  it('responds with a single player item in JSON', function(done){
    request(app)
    .get('/api/player/'+ _id )
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200, done);
  });
});


describe('PUT Player by ID', function(){
  it('updates player item in return JSON', function(done){
    request(app)
    .put('/api/player/'+ _id )
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .send({ "player": { "title": "Hell Is Where There Are No Robots" } })    
    .expect(200, done);
  });
});

describe('DELETE Player by ID', function(){
  it('should delete player and return 200 status code', function(done){
    request(app)
    .del('/api/player/'+ _id) 
    .expect(204, done);
  });
});