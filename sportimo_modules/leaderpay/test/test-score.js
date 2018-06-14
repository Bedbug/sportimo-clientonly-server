var request = require('supertest'),
express = require('express');

process.env.NODE_ENV = 'test';

var app = require('../app.js');
var _id = '';


describe('POST New Score', function(){
  it('creates new score and responds with json success message', function(done){
    request(app)
    .post('/api/score')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .send({"score": {"user_id":"The accused witches lived in the area around Pendle Hill in Lancashire, a county which, at the end of the 16th century, was regarded by the authorities as a wild and lawless region: an area \"fabled for its theft, violence and sexual laxity, where the church was honoured without much understanding of its doctrines by the common people\".","match_id":"However, Abdul-Jabbar, who was now 38 years old, scored 30 points and grabbed 17 rebounds in Game 2, and his 36 points in a Game 5 win were instrumental in establishing a 3–2 lead for Los Angeles.","score":-72.48782650567591,"country_id":"The following year he was attached to the Air Ministry in London.","created":"1985-06-14T04:29:30.187Z"}})
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

describe('GET List of Scores', function(){
  it('responds with a list of score items in JSON', function(done){
    request(app)
    .get('/api/scores')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200, done);
  });
});

describe('GET Score by ID', function(){
  it('responds with a single score item in JSON', function(done){
    request(app)
    .get('/api/score/'+ _id )
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200, done);
  });
});


describe('PUT Score by ID', function(){
  it('updates score item in return JSON', function(done){
    request(app)
    .put('/api/score/'+ _id )
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .send({ "score": { "title": "Hell Is Where There Are No Robots" } })    
    .expect(200, done);
  });
});

describe('DELETE Score by ID', function(){
  it('should delete score and return 200 status code', function(done){
    request(app)
    .del('/api/score/'+ _id) 
    .expect(204, done);
  });
});