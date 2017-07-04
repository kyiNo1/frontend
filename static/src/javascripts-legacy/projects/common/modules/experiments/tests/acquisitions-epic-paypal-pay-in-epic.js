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
    'raw-loader!common/views/acquisitions-epic-iframe.html',
    'raw-loader!common/views/acquisitions-epic-paypal-pay-in-epic-control.html'
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
    iframeTemplate,
    paypalPayInEpicControlTemplate
) {

    function createFormData(region, amounts) {
        var formDataByRegion =  {
            'GB': {
                amounts: amounts['GB'],
                symbol: '£',
                countryGroup: 'uk'
            },
            'EU': {
                amounts:  amounts['EU'],
                symbol: '€',
                countryGroup: 'eu',
            },
            'US': {
                amounts:  amounts['US'],
                symbol: '$',
                countryGroup: 'us',
            },
            'AU': {
                amounts:  amounts['AU'],
                symbol: '$',
                countryGroup: 'au'
            }
        };

        // INT and CA redirect to UK in contributions frontend.
        return formDataByRegion[region] || formDataByRegion['GB']
    }

    function pageContext(campaignCode, amounts) {
        var region = geolocation.getSupporterPaymentRegion(geolocation.getSync());

        return {
            intCmp: campaignCode,
            refererPageviewId: config.ophan.pageViewId,
            refererUrl: document.location.href,
            ophanBrowserId: config.ophan.browserId,
            formData: createFormData(region, amounts)
        };
    }

    function getIframeUrl() {
        var isDev = config.page.isDev || false;
        var baseUrl = 'https://contribute.theguardian.com';
        if (isDev) {
            baseUrl = 'https://contribute.thegulocal.com';
        }
        return baseUrl + '/components/epic/inline-payment';
    }

    function createVariant(id, amounts) {
        return {
            id: id,

            isUnlimited: true,

            template: function (variant) {
                return template(iframeTemplate, {
                    componentName: variant.options.componentName,
                    id: variant.options.iframeId,
                    iframeUrl: getIframeUrl(),
                })
            },

            test: function (render, variant) {
                window.addEventListener('message', function (event) {
                    if (event.data.type === 'PAGE_CONTEXT_REQUEST') {
                        var iframe = document.getElementById(variant.options.iframeId);

                        if (iframe) {
                            iframe.contentWindow.postMessage({
                                type: 'PAGE_CONTEXT',
                                pageContext: pageContext(variant.options.campaignCode, amounts)
                            }, '*');
                        }
                    }
                });

                loadScript.loadScript('https://www.paypalobjects.com/api/checkout.js')
                    .then(function () { return render(); });
            },

            usesIframe: true
        }
    }

    function createControl() {
        return {
            id: 'control',

            template: function (variant) {
                return template(paypalPayInEpicControlTemplate, {
                    contributionUrl: variant.options.contributeURL + '&disableStripe=true'
                })
            }
        }
    }

    return contributionsUtilities.makeABTest({
        id: 'AcquisitionsEpicPaypalPayInEpic',
        campaignId: 'epic_pay_in_epic',

        start: '2017-06-19',
        expiry: '2018-08-01',

        author: 'Guy Dawson & Sam Desborough',
        description: 'Test whether letting readers pay in-Epic with Paypal will lead to a higher conversion rate',
        successMeasure: 'Conversion rate',
        idealOutcome: 'The pay in-Epic variant smashes the control out of the park',
        audienceCriteria: 'All',
        audience: 0.2,
        audienceOffset: 0.1,

        variants: [

            createControl(),

            createVariant('default_amounts', {
                'GB': [25, 50, 100, 250],
                'EU': [25, 50, 100, 250],
                'US': [25, 50, 100, 250],
                'AU': [50, 100, 250, 500]
            }),

            createVariant('low_amounts', {
                'GB': [2, 5, 10, 25],
                'EU': [2, 5, 10, 25],
                'US': [2, 5, 10, 25],
                'AU': [5, 10, 25, 50]
            })
        ]
    });
});
