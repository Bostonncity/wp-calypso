/**
 * External dependencies
 */
var debug = require( 'debug' )( 'calypso:two-step-authorization' );

/**
 * Internal Dependencies
 */
var emitter = require( 'lib/mixins/emitter' ),
	wpcom = require( 'lib/wp' ).undocumented(),
	userSettings = require( 'lib/user-settings' ),
	applicationPasswords = require( 'lib/application-passwords-data' ),
	connectedApplications = require( 'lib/connected-applications-data' ),
	profileLinks = require( 'lib/user-profile-links' ),
	analytics = require( 'analytics' );

/*
 * Initialize TwoStepAuthorization with defaults
 */
function TwoStepAuthorization() {
	if ( ! ( this instanceof TwoStepAuthorization ) ) {
		return new TwoStepAuthorization();
	}

	this.data = null;
	this.initialized = false;
	this.indvalidCode = false;
	this.smsResendThrottled = false;
	this.backupCodes = false;
	this.bumpMCStat = function( eventAction ) {
		analytics.mc.bumpStat( '2fa', eventAction );
	};

	this.fetch();
}

/*
 * fetch data about users two step configuration from /me/two-step
 */
TwoStepAuthorization.prototype.fetch = function( callback ) {
	wpcom.me().getTwoStep( function( error, data ) {
		if ( ! error ) {
			this.data = data;

			if ( this.isReauthRequired() && this.isTwoStepSMSEnabled() && ! this.initialized ) {
				this.sendSMSCode();
			}

			if ( this.isReauthRequired() && ! this.initialized ) {
				this.bumpMCStat( 'reauth-required' );
			}

			this.initialized = true;
			this.emit( 'change' );
		}

		if ( callback ) {
			callback( error, data );
		}
	}.bind( this ) );
};

/*
 * Given a code, validate the code which will update a user's twostep_auth cookie
 */
TwoStepAuthorization.prototype.validateCode = function( args, callback ) {
	wpcom.me().validateTwoStepCode( args, function( error, data ) {
		if ( ! error && data.success ) {
			// If the validation was successful AND reauth was required, fetch
			// data from the following modules.
			if ( this.isReauthRequired() ) {
				userSettings.fetchSettings();
				applicationPasswords.fetch();
				connectedApplications.fetch();
				profileLinks.fetchProfileLinks();
			}

			this.data.two_step_reauthorization_required = false;
			this.data.two_step_authorization_expires_soon = false;
			this.invalidCode = false;

			if ( 'enable-two-step' === args.action && data.backup_codes ) {
				this.backupCodes = data.backup_codes;
			}

			if ( args.action ) {
				this.bumpMCStat( 'enable-two-step' === args.action ? 'enable-2fa-successful' : 'disable-2fa-successful' );
			} else {
				this.bumpMCStat( 'reauth-successful' );
			}

			this.emit( 'change' );
		} else if ( ! error ) { // If code was invalid but API did not error
			this.invalidCode = true;

			if ( args.action ) {
				this.bumpMCStat( 'enable-two-step' === args.action ? 'enable-2fa-failed-invalid-code' : 'disable-2fa-failed-invalid-code' );
			} else {
				this.bumpMCStat( 'reauth-failed-invalid-code' );
			}
		}

		if ( callback ) {
			callback( error, data );
		}
	}.bind( this ) );
};

/*
 * Send an SMS authentication code to a user's SMS phone number by calling
 * /me/two-step/sms/new
 */
TwoStepAuthorization.prototype.sendSMSCode = function( callback ) {
	wpcom.me().sendSMSValidationCode( function( error, data ) {
		if ( error ) {
			debug( 'Sending SMS code failed: ' + JSON.stringify( error ) );

			if ( error.error && 'rate_limited' === error.error ) {
				debug( 'SMS resend throttled.' );
				this.bumpMCStat( 'sms-code-send-throttled' );
				this.smsResendThrottled = true;
			}
		} else {
			this.smsResendThrottled = false;
			this.bumpMCStat( 'sms-code-send-success' );
		}

		this.emit( 'change' );

		if ( callback ) {
			callback( error, data );
		}
	}.bind( this ) );
};

/*
 * Returns an array of backup codes.
 */
TwoStepAuthorization.prototype.getBackupCodes = function() {
	return this.backupCodes ? this.backupCodes : [];
};

/*
 * Similar to validateCode, but without the change triggers across the
 * TwoStepAuthorization objects, so that the caller can delay state
 * transition until it is ready
 */
TwoStepAuthorization.prototype.validateBackupCode = function( code, callback ) {
	var args = {
		code: code,
		action: 'create-backup-receipt'
	};

	wpcom.me().validateTwoStepCode( args, function( error, data ) {
		if ( error ) {
			debug( 'Validating Two Step Code failed: ' + JSON.stringify( error ) );
		}

		if ( data ) {
			this.bumpMCStat( data.success ? 'backup-code-validate-success' : 'backup-code-validate-failure' );
		}

		if ( callback ) {
			callback( error, data );
		}
	}.bind( this ) );
};

/*
 * Requests the authentication app QR code URL and time code
 * from me/two-step/app-auth-setup
 */
TwoStepAuthorization.prototype.getAppAuthCodes = function( callback ) {
	wpcom.me().getAppAuthCodes( function( error, data ) {
		if ( error ) {
			debug( 'Getting App Auth Codes failed: ' + JSON.stringify( error ) );
		}

		if ( callback ) {
			callback( error, data );
		}
	} );
};

TwoStepAuthorization.prototype.codeValidationFailed = function() {
	return this.invalidCode;
};

TwoStepAuthorization.prototype.isSMSResendThrottled = function() {
	return this.smsResendThrottled;
};

TwoStepAuthorization.prototype.isReauthRequired = function() {
	return this.data ? this.data.two_step_reauthorization_required : false;
};

TwoStepAuthorization.prototype.authExpiresSoon = function() {
	return this.data ? this.data.two_step_authorization_expires_soon : false;
};

TwoStepAuthorization.prototype.isTwoStepSMSEnabled = function() {
	return this.data ? this.data.two_step_sms_enabled : false;
};

TwoStepAuthorization.prototype.getSMSLastFour = function() {
	return this.data ? this.data.two_step_sms_last_four : null;
};

emitter( TwoStepAuthorization.prototype );

/**
 * Expose TwoStepAuthorization
 */
module.exports = new TwoStepAuthorization();