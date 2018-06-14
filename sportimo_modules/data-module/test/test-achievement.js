var request = require('supertest'),
express = require('express');

process.env.NODE_ENV = 'test';

var app = require('../app.js');
var _id = '';


describe('POST New Achievement', function(){
  it('creates new achievement and responds with json success message', function(done){
    request(app)
    .post('/api/achievement')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .send({"achievement": {"uniqueid":"Margaret Crooke, another witness seen by Nowell that day, claimed that her brother had fallen sick and died after having had a disagreement with Redferne, and that he had frequently blamed her for his illness Based on the evidence and confessions he had obtained, Nowell committed Demdike, Chattox, Anne Redferne and Alizon Device to Lancaster Gaol, to be tried for maleficium – causing harm by witchcraft – at the next assizes.","icon":"In April of that same year the King signed the Treaty of Salvaterra de Magos with King Juan I of Castile.","title":"In the western desert communities such as Kintore, Yuendumu, Balgo, and on the outstations, people were beginning to create art works expressly for exhibition and sale.","text":"If this is correct, the extinction of the fossa may take as much as 100 years to occur as the species gradually declines.","has":-1.2436314020305872,"total":51.03105241432786,"completed":false,"created":"2002-03-24T20:54:36.759Z"}})
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

describe('GET List of Achievements', function(){
  it('responds with a list of achievement items in JSON', function(done){
    request(app)
    .get('/api/achievements')
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200, done);
  });
});

describe('GET Achievement by ID', function(){
  it('responds with a single achievement item in JSON', function(done){
    request(app)
    .get('/api/achievement/'+ _id )
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .expect(200, done);
  });
});


describe('PUT Achievement by ID', function(){
  it('updates achievement item in return JSON', function(done){
    request(app)
    .put('/api/achievement/'+ _id )
    .set('Accept', 'application/json')
    .expect('Content-Type', /json/)
    .send({ "achievement": { "title": "Hell Is Where There Are No Robots" } })    
    .expect(200, done);
  });
});

describe('DELETE Achievement by ID', function(){
  it('should delete achievement and return 200 status code', function(done){
    request(app)
    .del('/api/achievement/'+ _id) 
    .expect(204, done);
  });
});