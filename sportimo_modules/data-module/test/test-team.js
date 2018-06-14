var request = require('supertest'),
express = require('express');

process.env.NODE_ENV = 'test';

var app = require('../app.js');
var _id = '';


describe('POST New Team', function(){
  it('creates new team and responds with json success message', function(done){
    request(app)
    .post('/api/team')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .send({"team": {}})
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

describe('GET List of Teams', function(){
  it('responds with a list of team items in JSON', function(done){
    request(app)
    .get('/api/teams')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200, done);
  });
});

describe('GET Team by ID', function(){
  it('responds with a single team item in JSON', function(done){
    request(app)
    .get('/api/team/'+ _id )
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200, done);
  });
});


describe('PUT Team by ID', function(){
  it('updates team item in return JSON', function(done){
    request(app)
    .put('/api/team/'+ _id )
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .send({ "team": { "title": "Hell Is Where There Are No Robots" } })    
    .expect(200, done);
  });
});

describe('DELETE Team by ID', function(){
  it('should delete team and return 200 status code', function(done){
    request(app)
    .del('/api/team/'+ _id) 
    .expect(204, done);
  });
});