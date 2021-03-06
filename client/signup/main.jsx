/**
 * External dependencies
 */
import debugModule from 'debug';
const debug = debugModule( 'calypso:signup' );
import React from 'react';
import TimeoutTransitionGroup from 'timeout-transition-group';
import page from 'page';
import startsWith from 'lodash/string/startsWith';
import sortBy from 'lodash/collection/sortBy';
import last from 'lodash/array/last';
import find from 'lodash/collection/find';
import some from 'lodash/collection/some';
import defer from 'lodash/function/defer';
import delay from 'lodash/function/delay';
import assign from 'lodash/object/assign';
import matchesProperty from 'lodash/utility/matchesProperty';
import indexOf from 'lodash/array/indexOf';
import reject from 'lodash/collection/reject';

/**
 * Internal dependencies
 */
import SignupDependencyStore from 'lib/signup/dependency-store';
import SignupProgressStore from 'lib/signup/progress-store';
import SignupFlowController from 'lib/signup/flow-controller';
import LocaleSuggestions from './locale-suggestions';
import FlowProgressIndicator from './flow-progress-indicator';
import steps from './config/steps';
import stepComponents from './config/step-components';
import flows from './config/flows';
import WpcomLoginForm from './wpcom-login-form';
import userModule from 'lib/user';
const user = userModule();
import analytics from 'analytics';
import SignupProcessingScreen from 'signup/processing-screen';
import utils from './utils';

/**
 * Constants
 */
const MINIMUM_TIME_LOADING_SCREEN_IS_DISPLAYED = 1000;

const Signup = React.createClass( {
	displayName: 'Signup',

	getInitialState() {
		return {
			login: false,
			progress: SignupProgressStore.get(),
			dependencies: SignupDependencyStore.get(),
			loadingScreenStartTime: undefined,
			resumingStep: undefined
		};
	},

	loadDependenciesFromStore() {
		this.setState( { dependencies: SignupDependencyStore.get() } );
	},

	loadProgressFromStore() {
		var newProgress = SignupProgressStore.get(),
			invalidSteps = some( newProgress, matchesProperty( 'status', 'invalid' ) ),
			waitingForServer = ! invalidSteps && this.isEveryStepSubmitted(),
			startLoadingScreen = waitingForServer && ! this.state.loadingScreenStartTime;

		this.setState( { progress: newProgress } );

		if ( this.isEveryStepSubmitted() ) {
			this.goToFirstInvalidStep();
		}

		if ( startLoadingScreen ) {
			this.setState( { loadingScreenStartTime: Date.now() } );
		}

		if ( invalidSteps ) {
			this.setState( { loadingScreenStartTime: undefined } );
		}
	},

	componentWillMount() {
		analytics.tracks.recordEvent( 'calypso_signup_start', {
			flow: this.props.flowName,
			ref: this.props.refParameter
		} );

		this.signupFlowController = new SignupFlowController( {
			flowName: this.props.flowName,
			onComplete: function( dependencies, destination ) {
				var timeSinceLoading = this.state.loadingScreenStartTime ?
					Date.now() - this.state.loadingScreenStartTime :
					undefined;

				if ( timeSinceLoading && timeSinceLoading < MINIMUM_TIME_LOADING_SCREEN_IS_DISPLAYED ) {
					return delay(
						this.handleFlowComplete.bind( this, dependencies, destination ),
						MINIMUM_TIME_LOADING_SCREEN_IS_DISPLAYED - timeSinceLoading
					);
				}

				return this.handleFlowComplete( dependencies, destination );
			}.bind( this )
		} );

		this.loadProgressFromStore();

		if ( SignupProgressStore.get().length > 0 ) {
			// we loaded progress from local storage, attempt to resume progress
			return this.resumeProgress();
		}

		if ( this.positionInFlow() !== 0 ) {
			// no progress was resumed and we're on a non-zero step
			// redirect to the beginning of the flow
			return page.redirect(
				utils.getStepUrl(
					this.props.flowName,
					flows.getFlow( this.props.flowName ).steps[ 0 ],
					this.props.locale
				)
			);
		}

		this.recordStep();
	},

	componentWillReceiveProps( { stepName } ) {
		if ( this.props.stepName !== stepName ) {
			this.recordStep( stepName );
		}

		if ( stepName === this.state.resumingStep ) {
			this.setState( { resumingStep: undefined } );
		}
	},

	recordStep( stepName = this.props.stepName ) {
		analytics.tracks.recordEvent( 'calypso_signup_step_start', { flow: this.props.flowName, step: stepName } );
	},

	handleFlowComplete( dependencies, destination ) {
		debug( 'The flow is completed. Logging you in...' );

		analytics.tracks.recordEvent( 'calypso_signup_complete', { flow: this.props.flowName } );

		if ( user.get() ) {
			// deferred in case the user is logged in and the redirect triggers a dispatch
			defer( function() {
				page( destination );
			}.bind( this ) );
		} else {
			this.setState( {
				bearerToken: dependencies.bearer_token,
				username: dependencies.username,
				redirectTo: this.loginRedirectTo( destination )
			} );
		}

		this.signupFlowController.reset();
	},

	componentDidMount() {
		debug( 'Signup component mounted' );
		SignupProgressStore.on( 'change', this.loadProgressFromStore );
		SignupProgressStore.on( 'change', this.loadDependenciesFromStore );
	},

	componentWillUnmount() {
		debug( 'Signup component unmounted' );
		SignupProgressStore.off( 'change', this.loadProgressFromStore );
		SignupProgressStore.off( 'change', this.loadDependenciesFromStore );
	},

	loginRedirectTo( path ) {
		var redirectTo;

		if ( startsWith( path, 'https://' ) || startsWith( path, 'http://' ) ) {
			return path;
		}

		redirectTo = window.location.protocol + '//' + window.location.hostname; // Don't force https because of local development

		if ( window.location.port ) {
			redirectTo += ':' + window.location.port;
		}
		return redirectTo + path;
	},

	firstUnsubmittedStepName() {
		const signupProgress = SignupProgressStore.get(),
			currentSteps = flows.getFlow( this.props.flowName ).steps,
			nextStepName = currentSteps[ signupProgress.length ],
			firstInProgressStep = find( signupProgress, { status: 'in-progress' } ) || {},
			firstInProgressStepName = firstInProgressStep.stepName;

		return firstInProgressStepName || nextStepName || last( currentSteps );
	},

	resumeProgress() {
		const signupProgress = SignupProgressStore.get(),
			lastUpdatedStep = sortBy( signupProgress, 'lastUpdated' ).reverse()[ 0 ],
			lastUpdatedStepName = lastUpdatedStep.stepName,
			stepSectionName = lastUpdatedStep.stepSectionName,
			resumingStep = lastUpdatedStepName || this.firstUnsubmittedStepName();

		// set `resumingStep` so we don't render/animate anything until we have mounted this step
		this.setState( { resumingStep } );

		return page.redirect( utils.getStepUrl(
			this.props.flowName,
			resumingStep,
			stepSectionName,
			this.props.locale
		) );
	},

	goToNextStep() {
		if ( this.state.scrolling ) {
			return;
		}

		this.setState( { scrolling: true } );

		this.windowScroller = setInterval( () => {
			if ( window.pageYOffset > 0 ) {
				window.scrollBy( 0, -10 );
			} else {
				this.setState( { scrolling: false } );
				this.loadNextStep();
			}
		}, 1 );
	},

	loadNextStep() {
		var flowSteps = flows.getFlow( this.props.flowName ).steps,
			currentStepIndex = indexOf( flowSteps, this.props.stepName ),
			nextStepName = flowSteps[ currentStepIndex + 1 ],
			nextStepSection = this.state.progress[ currentStepIndex + 1 ] ?
				this.state.progress[ currentStepIndex + 1 ].stepSectionName :
				'';

		clearInterval( this.windowScroller );

		if ( ! this.isEveryStepSubmitted() && nextStepName ) {
			page( utils.getStepUrl( this.props.flowName, nextStepName, nextStepSection, this.props.locale ) );
		} else if ( this.isEveryStepSubmitted() ) {
			this.goToFirstInvalidStep();
		}
	},

	goToFirstInvalidStep() {
		var firstInvalidStep = find( SignupProgressStore.get(), { status: 'invalid' } );

		if ( firstInvalidStep ) {
			analytics.tracks.recordEvent( 'calypso_signup_goto_invalid_step', {
				step: firstInvalidStep.stepName,
				flow: this.props.flowName
			} );
			page( utils.getStepUrl( this.props.flowName, firstInvalidStep.stepName, this.props.locale ) );
		}
	},

	isEveryStepSubmitted() {
		var flowSteps = flows.getFlow( this.props.flowName ).steps;
		return flowSteps.length === reject( SignupProgressStore.get(), { status: 'in-progress' } ).length;
	},

	positionInFlow() {
		return indexOf( flows.getFlow( this.props.flowName ).steps, this.props.stepName );
	},

	localeSuggestions() {
		return 0 === this.positionInFlow() && ! user.get() ?
			<LocaleSuggestions path={ this.props.path } locale={ this.props.locale } /> :
			null;
	},

	loginForm() {
		return this.state.bearerToken ?
			<WpcomLoginForm
				authorization={ 'Bearer ' + this.state.bearerToken }
				log={ this.state.username }
				redirectTo={ this.state.redirectTo } /> :
			null;
	},

	currentStep() {
		let currentStepProgress = find( this.state.progress, { stepName: this.props.stepName } ),
			CurrentComponent = stepComponents[ this.props.stepName ],
			propsFromConfig = assign( {}, this.props, steps[ this.props.stepName ].props ),
			stepKey = this.state.loadingScreenStartTime ? 'processing' : this.props.stepName;

		return (
			<div className="signup__step" key={ stepKey }>
				{ this.localeSuggestions() }
				{
					this.state.loadingScreenStartTime ?
					<SignupProcessingScreen steps={ this.state.progress } /> :
					<CurrentComponent
						path={ this.props.path }
						step={ currentStepProgress }
						goToNextStep={ this.goToNextStep }
						flowName={ this.props.flowName }
						signupProgressStore={ this.state.progress }
						signupDependencies={ this.state.dependencies }
						stepSectionName={ this.props.stepSectionName }
						positionInFlow={ this.positionInFlow() }
						{ ...propsFromConfig } />
				}
			</div>
		);
	},

	render() {
		if ( ! this.props.stepName ||
			( this.positionInFlow() > 0 && this.state.progress.length === 0 ) ||
			this.state.resumingStep ) {
			return null;
		}

		return (
			<span>
				{
					this.state.loadingScreenStartTime ?
					null :
					<FlowProgressIndicator
						positionInFlow={ this.positionInFlow() }
						flowName={ this.props.flowName } />
				}
				<TimeoutTransitionGroup
					className="signup__steps"
					transitionName="signup__step"
					enterTimeout={ 500 }
					leaveTimeout={ 300 }>
					{ this.currentStep() }
				</TimeoutTransitionGroup>
				{ this.loginForm() }
			</span>
		);
	}
} );

export default Signup;
