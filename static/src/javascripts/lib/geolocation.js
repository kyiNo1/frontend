// @flow
import fetchJSON from 'lib/fetch-json';
import config from 'lib/config';
import { local as storage } from 'lib/storage';

type Currency = {
    // https://www.iban.com/currency-codes.html
    isoCode: string,
    symbol: string,
};

const storageKey = 'gu.geolocation';
const editionToGeolocationMap = {
    UK: 'GB',
    US: 'US',
    AU: 'AU',
};
const daysBeforeGeolocationRefresh = 10;

const getFromStorage = (): string => storage.get(storageKey);

const get = (): Promise<string> =>
    new Promise((resolve, reject) => {
        const geolocationFromStorage = getFromStorage();

        if (geolocationFromStorage) {
            return resolve(geolocationFromStorage);
        }

        fetchJSON('/geolocation', {
            headers: {
                'Content-Type': 'application/json',
            },
            mode: 'cors',
        })
            .then(response => {
                if (response.country) {
                    resolve(response.country);
                } else {
                    reject('No country in geolocation response');
                }
            })
            .catch(reject);
    });

const setGeolocation = (geolocation: string): void => {
    const currentDate = new Date();
    storage.set(storageKey, geolocation, {
        expires: currentDate.setDate(
            currentDate.getDate() + daysBeforeGeolocationRefresh
        ),
    });
};

const init = (): void => {
    get().then(setGeolocation);
};

const editionToGeolocation = (editionKey: string = 'UK'): string =>
    editionToGeolocationMap[editionKey];

const getSync = (): string => {
    const geolocationFromStorage = getFromStorage();
    return geolocationFromStorage || editionToGeolocation(config.page.edition);
};

const regionCountryCodes = ['AU', 'CA', 'GB', 'US'];

const europeCountryCodes = [
    'AD',
    'AL',
    'AT',
    'BA',
    'BE',
    'BG',
    'BL',
    'CH',
    'CY',
    'CZ',
    'DE',
    'DK',
    'EE',
    'ES',
    'FI',
    'FO',
    'FR',
    'GF',
    'GL',
    'GP',
    'GR',
    'HR',
    'HU',
    'IE',
    'IT',
    'LI',
    'LT',
    'LU',
    'LV',
    'MC',
    'ME',
    'MF',
    'IS',
    'MQ',
    'MT',
    'NL',
    'NO',
    'PF',
    'PL',
    'PM',
    'PT',
    'RE',
    'RO',
    'RS',
    'SE',
    'SI',
    'SJ',
    'SK',
    'SM',
    'TF',
    'TR',
    'WF',
    'YT',
    'VA',
    'AX',
];

// Returns one of { GB, US, AU, CA, EU, INT }
// These are the different 'regions' we accept when taking payment.
// See https://membership.theguardian.com/uk/supporter# for more context.
const getSupporterPaymentRegion = (location: string): string => {
    if (regionCountryCodes.includes(location)) {
        return getSync();
    }
    if (europeCountryCodes.includes(location)) {
        return 'EU';
    }
    return 'INT';
};

const isInEurope = (): boolean => {
    const countryCode = getSync();
    return europeCountryCodes.includes(countryCode) || countryCode === 'GB';
};

const getCurrency = (location: string): Currency => {
    const region = getSupporterPaymentRegion(location);

    const currency = (isoCode: string, symbol: string): Currency => ({
        isoCode,
        symbol,
    });

    switch (region) {
        case 'GB':
            return currency('GBP', '£');
        case 'US':
            return currency('USD', '$');
        case 'AU':
            return currency('AUD', 'AUD$');
        case 'CA':
            return currency('CAD', 'CAD$');
        case 'EU':
            return currency('EUR', '€');
        default:
            return currency('USD', '$');
    }
};

export {
    get,
    getSupporterPaymentRegion,
    getSync,
    isInEurope,
    init,
    setGeolocation,
    getCurrency,
};
