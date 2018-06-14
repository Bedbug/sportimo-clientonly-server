var request = require('supertest'),
express = require('express');

process.env.NODE_ENV = 'test';

var app = require('../app.js');
var _id = '';


describe('POST New Prize', function(){
  it('creates new prize and responds with json success message', function(done){
    request(app)
    .post('/api/prize')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .send({"prize": {}})
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

describe('GET List of Prizes', function(){
  it('responds with a list of prize items in JSON', function(done){
    request(app)
    .get('/api/prizes')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200, done);
  });
});

describe('GET Prize by ID', function(){
  it('responds with a single prize item in JSON', function(done){
    request(app)
    .get('/api/prize/'+ _id )
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200, done);
  });
});


describe('PUT Prize by ID', function(){
  it('updates prize item in return JSON', function(done){
    request(app)
    .put('/api/prize/'+ _id )
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .send({ "prize": { "title": "Hell Is Where There Are No Robots" } })    
    .expect(200, done);
  });
});

describe('DELETE Prize by ID', function(){
  it('should delete prize and return 200 status code', function(done){
    request(app)
    .del('/api/prize/'+ _id) 
    .expect(204, done);
  });
});