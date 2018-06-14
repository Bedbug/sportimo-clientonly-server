var request = require('supertest'),
express = require('express');

process.env.NODE_ENV = 'test';

var app = require('../app.js');
var _id = '';


describe('POST New Competition', function(){
  it('creates new competition and responds with json success message', function(done){
    request(app)
    .post('/api/competition')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .send({"competition": {}})
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

describe('GET List of Competitions', function(){
  it('responds with a list of competition items in JSON', function(done){
    request(app)
    .get('/api/competitions')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200, done);
  });
});

describe('GET Competition by ID', function(){
  it('responds with a single competition item in JSON', function(done){
    request(app)
    .get('/api/competition/'+ _id )
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200, done);
  });
});


describe('PUT Competition by ID', function(){
  it('updates competition item in return JSON', function(done){
    request(app)
    .put('/api/competition/'+ _id )
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .send({ "competition": { "title": "Hell Is Where There Are No Robots" } })    
    .expect(200, done);
  });
});

describe('DELETE Competition by ID', function(){
  it('should delete competition and return 200 status code', function(done){
    request(app)
    .del('/api/competition/'+ _id) 
    .expect(204, done);
  });
});