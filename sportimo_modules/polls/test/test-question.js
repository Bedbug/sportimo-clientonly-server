var request = require('supertest'),
express = require('express');

process.env.NODE_ENV = 'test';

var app = require('../app.js');
var _id = '';


describe('POST New Question', function(){
  it('creates new question and responds with json success message', function(done){
    request(app)
    .post('/api/question')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .send({"question": {}})
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

describe('GET List of Questions', function(){
  it('responds with a list of question items in JSON', function(done){
    request(app)
    .get('/api/questions')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200, done);
  });
});

describe('GET Question by ID', function(){
  it('responds with a single question item in JSON', function(done){
    request(app)
    .get('/api/question/'+ _id )
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200, done);
  });
});


describe('PUT Question by ID', function(){
  it('updates question item in return JSON', function(done){
    request(app)
    .put('/api/question/'+ _id )
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .send({ "question": { "title": "Hell Is Where There Are No Robots" } })    
    .expect(200, done);
  });
});

describe('DELETE Question by ID', function(){
  it('should delete question and return 200 status code', function(done){
    request(app)
    .del('/api/question/'+ _id) 
    .expect(204, done);
  });
});