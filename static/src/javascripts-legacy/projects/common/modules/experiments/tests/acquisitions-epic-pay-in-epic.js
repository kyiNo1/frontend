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
    'raw-loader!common/views/acquisitions-epic-iframe.html'
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
    iframeTemplate
) {
    //var readersCurrency = geolocation.getCurrency(geolocation.getSync());

    return contributionsUtilities.makeABTest({
        id: 'AcquisitionsEpicPayInEpic',
        campaignId: 'epic_pay_in_epic',

        start: '2017-06-19',
        expiry: '2018-07-20',

        author: 'Guy Dawson & Sam Desborough',
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
                    return template(iframeTemplate, {
                        componentName: variant.options.componentName,
                        id: variant.options.iframeId,
                        iframeUrl: 'http://localhost:9111/components/epic/inline-payment',
                    })
                },

                test: function(render) {
                    loadScript.loadScript('https://www.paypalobjects.com/api/checkout.js')
                        .then(function() { render(); });
                },

                usesIframe: true
            }
        ]
    });
});
