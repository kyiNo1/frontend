define([
    'lodash/utilities/template',
    'lib/config',
    'lib/fetch',
    'lib/load-script',
    'lib/geolocation',
    'lib/mediator',
    'common/modules/commercial/acquisitions-copy',
    'common/modules/commercial/contributions-utilities',
    'ophan/ng',
    'raw-loader!common/views/acquisitions-epic-pay-in-epic.html'
], function (
    template,
    config,
    fetch,
    loadScript,
    geolocation,
    mediator,
    acquisitionsCopy,
    contributionsUtilities,
    ophan,
    payInEpicTemplate
) {

    // Click event listener added to contribution button with this id.
    var CONTRIBUTION_BUTTON_ID = 'pay-in-epic-contribution-button';

    // Values required by the token function in the stripe config, that
    // (1) can only be (easily) inferred at run-time; and
    // (2) can not be passed to the function directly.
    var state = {
        amount: null,
        campaignCode: null
    };

    function getReadersCurrency() {

        var region = geolocation.getSupporterPaymentRegion();

        function currency(isoCode, symbol) {
            return {
                // Used for Stripe and form submitted to contributions endpoint.
                // https://www.iban.com/currency-codes.html
                isoCode: isoCode,
                // Used client-side
                symbol: symbol
            }
        }

        if (region === 'GB') {
            return currency('GBP', '£')
        }

        if (region === 'US') {
            return currency('USD', '$')
        }

        if (region === 'AU') {
            return currency('AUD', 'AUD$')
        }

        if (region === 'CA') {
            return currency('CAD', 'CAD$')
        }

        if (region === 'EU') {
            return currency('EUR', "€")
        }

        // International and default currency.
        return currency('USD', '$')
    }

    var readersCurrency = getReadersCurrency();

    // The callback used to execute a charge for a reader using a token provided by Stripe.
    // https://stripe.com/docs/checkout/tutorial#tokens
    function processStripeContribution(token) {

        function getFormData(token) {

            function getOphanField(field) {
                // Default value not_found keeps with convention set in contribution utilities.
                return (config.ophan && config.ophan[field]) || 'not_found'
            }

            // In https://github.com/guardian/contributions-frontend see:
            // controllers.forms.ContributionRequest.contributionForm
            return {
                // We don't collect the reader's name in-Epic currently.
                name: 'unknown',
                currency: readersCurrency.isoCode,
                amount: state.amount,
                email: token.email,
                token: token.id,
                // Since we don't ask for marketing opt-in, assume the reader doesn't want to be contacted.
                marketing: false,
                ophanPageviewId: getOphanField('pageViewId'),
                ophanBrowserId: getOphanField('browserId'),
                intcmp: state.campaignCode,
            }
        }

        function handleResponse() {
            // FIXME

        }

        fetch('https://contribute.theguardian.com/stripe/pay', {
            credentials: 'same-origin',
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(getFormData(token))
        }).then(handleResponse);
    }

    function getStripeHandler() {
        // Script must be loaded. Using a local copy is unsupported.
        // https://stripe.com/docs/checkout#integration
        return loadScript.loadScript('https://checkout.stripe.com/checkout.js').then(function() {
            // See: https://stripe.com/docs/checkout#integration-custom - Configuration Options
            var conf = {
                key: 'pk_test_35RZz9AAyqErQshL410RDZMs',
                name: 'The Guardian',
                description: 'Make a contribution',
                allowRememberMe: false,
                token: processStripeContribution,
                currency: readersCurrency.isoCode
            };

            conf

            // StripeCheckout.configure(conf);

        });
    }

    function addEventListeners(handler) {

        // TODO: implement
        function getContributionAmount() {
            return 20;
        }

        function recordContributionButtonClicked() {
            ophan.record({
                component: 'epic_contribution_button',
                value: 'clicked'
            })
        }

        document.getElementById(CONTRIBUTION_BUTTON_ID).addEventListener('click', function(e) {
            // Recording this allows the success measure of contributions / views to be factored out as:
            // (contributions / clicks) * (clicks / views), which may prove insightful.
            // Note: to simplify we are assuming each reader clicks on the button at most once per impression.
            recordContributionButtonClicked();

            // Store the amount for use by the payment form.
            state.amount = getContributionAmount();

            // Amount configured here, since it is not known when the Stripe checkout is configured.
            handler.open({ amount: state.amount });
            e.preventDefault();
        });

        // Close Checkout on page navigation:
        window.addEventListener('popstate', function() {
            handler.close();
        });
    }

    return contributionsUtilities.makeABTest({
        id: 'AcquisitionsEpicPayInEpic',
        campaignId: 'epic_pay_in_epic',

        start: '2017-06-14',
        expiry: '2018-07-20',

        author: 'Guy Dawson',
        description: 'Test whether letting readers pay in-Epic will lead to a higher conversion rate',
        successMeasure: 'Conversion rate',
        idealOutcome: 'The pay in-Epic variant smashes the control out of the park',
        audienceCriteria: 'All',
        audience: 0.1,
        audienceOffset: 0,

        variants: [
            {
                id: 'control',
            },
            {
                id: 'pay_in_epic',

                isUnlimited: true,

                template: function(variant) {
                    return template(payInEpicTemplate, {
                        copy: acquisitionsCopy.control,
                        membershipUrl: variant.options.membershipURL,
                        contributionUrl: variant.options.contributeURL,
                        contributionButtonId: CONTRIBUTION_BUTTON_ID,
                        currencySymbol: readersCurrency.symbol
                    });
                },

                test: function(render, variant) {
                    // Store the generated campaign code for use by the payment form.
                    state.campaignCode = variant.options.campaignCode;
                    render().then(getStripeHandler).then(addEventListeners);
                },
            }
        ]
    });
});
