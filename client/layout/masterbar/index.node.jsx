/**
 * External dependencies
 */
import React from 'react';

/**
 * Internal dependencies
 */
import Item from './item';

export default () => (
	<header id="header" className="masterbar">
		<Item url="/" icon="my-sites" className="masterbar__item-logo">
			WordPress<span className="tld">.com</span>
		</Item>
	</header>
);
