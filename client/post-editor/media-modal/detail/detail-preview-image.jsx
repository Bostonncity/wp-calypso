/**
 * External dependencies
 */
import React, { PropTypes } from 'react';

/**
 * Internal dependencies
 */
import ImagePreloader from 'components/image-preloader';
import Spinner from 'components/spinner';
import MediaUtils from 'lib/media/utils';

export default React.createClass( {
	displayName: 'EditorMediaModalDetailPreviewImage',

	propTypes: {
		site: PropTypes.object,
		item: PropTypes.object.isRequired
	},

	render() {
		const src = MediaUtils.url( this.props.item, {
			photon: this.props.site && ! this.props.site.is_private
		} );

		return (
			<ImagePreloader
				src={ src }
				width={ this.props.item.width }
				height={ this.props.item.height }
				placeholder={ <Spinner /> }
				alt={ this.props.item.alt || this.props.item.title }
				className="editor-media-modal-detail__preview is-image" />
		);
	}
} );
