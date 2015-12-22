/**
 * External dependencies
 */
import React from 'react';
import classNames from 'classnames';

/**
 * Internal dependencies
 */

export default React.createClass( {
	displayName: 'Masterbar',

	propTypes: {
		collapsible: React.PropTypes.bool,
		children: React.PropTypes.element
	},

	render() {
		const classes = classNames( 'masterbar', {
			collapsible: this.props.collapsible,
		} );

		return (
			<header id="header" className={ classes }>
				{ this.props.children }
			</header>
		);
	}
} );
