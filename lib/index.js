
'use strict';

/**
 * Module dependencies
 */

var redis = require('redis'),
    async = require('async'),
    config,
    setConfig,
    client,
    determineCacheTTL;

/**
 * Constants
 */

var PAYLOAD_PREFIX = 'payload_',
    HEADER_PREFIX = 'header_';

/**
 * Sets the things
 */

exports.config = setConfig = function( cfg ) {
  config = cfg || {};
  config.redisPort = config.redisPort || 6379;
  config.redisHost = config.redisHost || 'localhost';
  config.ttl = config.ttl || 60 * 60; //1 hour
  config.PAYLOAD_PREFIX = cfg.payloadPrefix || PAYLOAD_PREFIX;
  config.HEADER_PREFIX = cfg.headerPrefix || HEADER_PREFIX;
  client = redis.createClient( config.redisPort, config.redisHost, config.redisOptions );
};

/**
 * Checks if we have the response in Redis
 */

exports.before = function( req, res, next ) {

  var url = req.url;

  // if config wasn't called, lets set it now.
  if ( !client ) {
    setConfig();
  }

  async.parallel({
    headers: function( fn ) {
      client.get( config.HEADER_PREFIX + url, fn );
    },
    payload: function( fn ) {
      client.get(config.PAYLOAD_PREFIX + url, fn );
    }
  },
  function( err, caches ) {

    if ( !!err ) {
      return next( err );
    }

    var headers = JSON.parse( caches.headers );
    var payload = caches.payload;

    if ( !payload || !headers ) {
      res.header( 'X-Cache', 'MISS' );
      return next();
    }

    Object.keys( headers ).forEach(function( headerField ) {
      res.header( headerField, headers[headerField] );
    });

    res.header( 'X-Cache', 'HIT' );
    res.writeHead( 200 );
    res.end( payload );

    return next();

  });

};

/**
 * Put the response into Redis
 */

exports.after = function( req, res, route, err, callback ) {

  if ( !!err ) {
    if ( callback ) {
      return callback( err );
    }
    return;
  }

  // if config wasn't called, lets set it now.
  if ( !client ) {
    setConfig();
  }

  async.parallel([
    function( fn ) {
      client.set( config.HEADER_PREFIX + req.url, JSON.stringify(res.headers()), function() {
        client.expire( config.HEADER_PREFIX + req.url, determineCacheTTL(res), fn );
      });
    },
    function( fn ) {
      client.set(config.PAYLOAD_PREFIX + req.url, res._data, function() {
        client.expire( config.PAYLOAD_PREFIX + req.url, determineCacheTTL(res), fn );
      });
    },
  ],
  function( err, results ) {
    if ( !!err ) {
      return callback( err );
    }
    return callback( null, results );
  });

};

/**
 * Determine the cache TTL
 */

determineCacheTTL = function( res ) {

  var cacheControl = res.getHeader('cache-control');

  if ( cacheControl ) {
    var maxAgeMatch = /max-age=(\d+)/.exec( cacheControl );
    if ( maxAgeMatch ) {
      return maxAgeMatch[1];
    }
  }

  return config.ttl;

};
