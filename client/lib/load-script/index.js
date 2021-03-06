/**
 * A little module for loading a external script
 */

var JQUERY_URL = 'https://s0.wp.com/wp-includes/js/jquery/jquery.js',
	callbacksForURLsInProgress = {};

var loadScript = function( url, callback ) {
	var script = document.createElement( 'script' ),
		loaded = false;

	function handleCompletedRequest( event ) {
		var errorArgument = null;
		if ( loaded || ( this.readyState && this.readyState !== 'complete' ) ) {
			return;
		}
		loaded = true;
		if ( callbacksForURLsInProgress[ url ] ) {
			if ( event.type === 'error' ) {
				errorArgument = { src: event.target.src };
			}
			callbacksForURLsInProgress[ url ].forEach( function ( callback ) {
				if ( callback ) {
					callback( errorArgument );
				}
			} );
		}
		delete callbacksForURLsInProgress[ url ];
		this.onload = this.onreadystatechange = this.onerror = null;
	}

	// if this url is already being loaded, just add the callback to the queue
	if ( callbacksForURLsInProgress.hasOwnProperty( url ) ) {
		callbacksForURLsInProgress[ url ].push( callback );
		return;
	}

	script.src = url;
	script.type = 'text/javascript';
	script.async = true;
	callbacksForURLsInProgress[ url ] = [ callback ];
	script.onload = script.onreadystatechange = script.onerror = handleCompletedRequest;

	document.getElementsByTagName( 'head' )[0].appendChild( script );
};

var loadjQueryDependentScript = function( scriptURL, callback ) {
	if ( window.jQuery ) {
		loadScript( scriptURL, callback );
		return;
	}
	loadScript( JQUERY_URL, function( error ) {
		if( error ) {
			callback( error );
		}
		loadScript( scriptURL, callback );
	} );
};

module.exports = {
	loadScript: loadScript,
	loadjQueryDependentScript: loadjQueryDependentScript,
	JQUERY_URL: JQUERY_URL
};
