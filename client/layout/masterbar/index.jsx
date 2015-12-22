/**
 * External dependencies
 */
import React from 'react';
import classNames from 'classnames';

/**
 * Internal dependencies
 */
import LoggedIn from './logged-in';
import LoggedOut from './logged-out';

export default React.createClass( {
	displayName: 'Masterbar',

	propTypes: {
		user: React.PropTypes.object,
	},

	render() {
		const classes = classNames( 'masterbar', {
			collapsible: !! this.props.user,
		} );

		return (
			<header id="header" className={ classes }>
				{ this.props.user
					? <LoggedIn { ...this.props } />
					: <LoggedOut /> }
			</header>
		);
	}
} );
