
'use strict';

/**
 * Setup
 */

var chai = require('chai');
var restify = require('restify');
var restifyCache = require('../');
var redis = require('redis');
var async = require('async');

var should = chai.should();
var expect = chai.expect();
var redisClient = redis.createClient( 6379, 'localhost' );

var serverName = 'myRestifyCache';
var serverErrorRoute = '/errorRoute';
var serverCacheRoute = '/cacheRoute';
var serverCacheRouteResponse = { cache: 'this!' };
var serverCacheConfig = {
  payloadPrefix: 'RestifyCachePayloadPrefix#',
  headerPrefix: 'RestifyCacheHeaderPrefix#'
};

var client = restify.createJsonClient({
  url: 'http://localhost:8080',
  version: '1.0.0'
});

/**
 * Server
 */

var startServer = function( done ) {

  var server = restify.createServer({
    name: serverName,
    version: '1.0.0'
  });

  restifyCache.config( serverCacheConfig );
  server.use( restifyCache.before );
  server.on( 'after', restifyCache.after );

  server.get( '/', function( req, res, next ) {
    res.send({ msg: 'okay' });
    return next();
  });

  server.get( serverErrorRoute, function( req, res, next ) {
    return next( new Error('Test error!') );
  });

  server.get( serverCacheRoute, function( req, res, next ) {
    res.send( serverCacheRouteResponse );
    return next();
  });

  server.listen( 8080, done );

};

/**
 * Tests
 */

describe('Restify cache', function() {

  describe('Server', function() {

    it( 'runs', startServer );

    it( 'accepts requests', function( done ) {
      client.get('/', function( err ) {
        if ( !!err ) {
          throw new Error( err.msg );
        }
        done();
      });
    });

  });

  describe( 'Cache', function() {

    it( 'won\'t save errors', function( done ) {
      client.get( serverErrorRoute, function( err, req, res, obj ) {
        if ( !err || !obj || res.statusCode !== 500 ) {
          return done( 'Server didn\'t respond /w 500!' );
        }
        async.parallel({
          header: function( fn ) { redisClient.get( serverCacheConfig.headerPrefix + serverErrorRoute, fn ); },
          payload: function( fn ) { redisClient.get( serverCacheConfig.payloadPrefix + serverErrorRoute, fn ); }
        },
        function( err, results ) {
          if ( !!err ) {
            return done( err );
          }
          if ( results.header === null && results.payload === null ) {
            done();
          }
        });
      });
    });

    it( 'saves responses', function( done ) {
      client.get( serverCacheRoute, function( err, req, res, obj ) {
        if ( !!err ) {
          return done( err );
        }
        async.parallel({
          header: function( fn ) { redisClient.get( serverCacheConfig.headerPrefix + serverCacheRoute, fn ); },
          payload: function( fn ) { redisClient.get( serverCacheConfig.payloadPrefix + serverCacheRoute, fn ); }
        },
        function( err, results ) {
          if ( !!err ) {
            return done( err );
          }
          if ( results.header !== null && obj.should.deep.equal(JSON.parse(results.payload)) ) {
            done();
          }
        });
      });
    });

    it( 'retrieves responses', function( done ) {
      client.get( serverCacheRoute, function( err, req, res, obj ) {
        if ( !!err ) {
          return done( err );
        }
        res.header('x-cache').should.equal('HIT');
        obj.should.deep.equal( serverCacheRouteResponse );
        done();
      });
    });

  });

});
