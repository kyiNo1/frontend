// @flow
/* eslint-disable no-useless-escape */
/*
 Module: history.js
 Description: Gets and sets users reading history
 */
import fastdom from 'fastdom';
import $ from 'lib/$';
import template from 'lodash/utilities/template';
import { local } from 'lib/storage';
import { getPath } from 'lib/url';
import viewTag from 'raw-loader!common/views/history/tag.html';
import viewMegaNav from 'raw-loader!common/views/history/mega-nav.html';
import isObject from 'lodash/objects/isObject';
import isNumber from 'lodash/objects/isNumber';
import pick from 'lodash/objects/pick';
import mapValues from 'lodash/objects/mapValues';

const editions = ['uk', 'us', 'au'];

const editionalised = [
    'business',
    'commentisfree',
    'culture',
    'environment',
    'media',
    'money',
    'sport',
    'technology',
];

const pageMeta = [
    {
        tid: 'section',
        tname: 'sectionName',
    },
    {
        tid: 'keywordIds',
        tname: 'keywords',
    },
    {
        tid: 'seriesId',
        tname: 'series',
    },
    {
        tid: 'authorIds',
        tname: 'author',
    },
];

const buckets = [
    {
        type: 'content',
        indexInRecord: 1,
    },
    {
        type: 'front',
        indexInRecord: 2,
    },
];

const summaryPeriodDays = 90;
const forgetUniquesAfter = 10;
const historySize = 50;
const storageKeyHistory = 'gu.history';
const storageKeySummary = 'gu.history.summary';

const today = Math.floor(Date.now() / 86400000); // 1 day in ms

let historyCache;
let summaryCache;
let popularFilteredCache;
let topNavItemsCache;
let inMegaNav = false;

const saveHistory = history => {
    console.log('saveHistory --------------->', saveHistory);

    historyCache = history;
    return local.set(storageKeyHistory, history);
};

const saveSummary = summary => {
    summaryCache = summary;
    return local.set(storageKeySummary, summary);
};

const getHistory = () => {
    historyCache = historyCache || local.get(storageKeyHistory) || [];
    return historyCache;
};

const getSummary = () => {
    if (!summaryCache) {
        summaryCache = local.get(storageKeySummary);

        if (
            !isObject(summaryCache) ||
            !isObject(summaryCache.tags) ||
            !isNumber(summaryCache.periodEnd)
        ) {
            summaryCache = {
                periodEnd: today,
                tags: {},
                showInMegaNav: true,
            };
        }
    }
    return summaryCache;
};

const seriesSummary = () => {
    const views = item => item.reduce((acc, record) => acc + record[1], 0);

    const seriesTags = pick(getSummary().tags, (v, k) => k.includes('series'));

    const seriesTagsSummary = mapValues(
        seriesTags,
        tag => views(tag[1]) + views(tag[2])
    );

    return seriesTagsSummary;
};

const mostViewedSeries = () =>
    seriesSummary().reduce(
        (best, views, tag, summary) =>
            views > (summary[best] || 0) ? tag : best,
        ''
    );

const deleteFromSummary = tag => {
    const summary = getSummary();

    delete summary.tags[tag];
    saveSummary(summary);
};

const isRevisit = pageId => {
    const visited = getHistory().find(page => page[0] === pageId);

    return visited && visited[1] > 1;
};

const pruneSummary = (summary, mockToday) => {
    const newToday = mockToday || today;
    const updateBy = newToday - summary.periodEnd;

    if (updateBy !== 0) {
        summary.periodEnd = newToday;

        Object.keys(summary.tags).forEach(tid => {
            const record = summary.tags[tid];

            const result = buckets.map(bucket => {
                if (record[bucket.indexInRecord]) {
                    const visits = record[bucket.indexInRecord]
                        .map(day => {
                            const newAge = day[0] + updateBy;
                            return newAge < summaryPeriodDays && newAge >= 0
                                ? [newAge, day[1]]
                                : false;
                        })
                        .filter(Boolean);

                    return visits.length > 1 ||
                        (visits.length === 1 &&
                            visits[0][0] < forgetUniquesAfter)
                        ? visits
                        : [];
                }

                return [];
            });

            if (result.some(r => r.length)) {
                summary.tags[tid] = [record[0]].concat(result);
            } else {
                delete summary.tags[tid];
            }
        });
    }

    return summary;
};

const tally = (visits, weight = 1, minimum = 1) => {
    let totalVisits = 0;

    const result = visits.reduce((t, day) => {
        const dayOffset = day[0];
        const dayVisits = day[1];

        totalVisits += dayVisits;
        return t + weight * (9 + dayVisits) * (summaryPeriodDays - dayOffset);
    }, 0);

    return totalVisits < minimum ? 0 : result;
};

const getPopular = opts => {
    const tags = getSummary().tags;
    let tids = Object.keys(tags);

    const op = Object.assign(
        {},
        {
            number: 100,
            weights: {},
            thresholds: {},
        },
        opts
    );

    tids = op.whitelist
        ? tids.filter(tid => op.whitelist.indexOf(tid) > -1)
        : tids;
    tids = op.blacklist
        ? tids.filter(tid => op.blacklist.indexOf(tid) === -1)
        : tids;

    return tids
        .map(tid => {
            const record = tags[tid];
            const rank = buckets.reduce(
                (r, bucket) =>
                    r +
                    tally(
                        record[bucket.indexInRecord],
                        op.weights[bucket.type],
                        op.thresholds[bucket.type]
                    ),
                0
            );

            return {
                idAndName: [tid, record[0]],
                rank,
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.rank - b.rank)
        .slice(-op.number)
        .map(tid => tid.idAndName)
        .reverse();
};

const getContributors = () => {
    const contibutors = [];
    const tags = getSummary().tags;

    Object.keys(tags).forEach(tagId => {
        if (tagId.indexOf('profile/') === 0) {
            contibutors.push(tags[tagId]);
        }
    });

    return contibutors;
};

const collapsePath = t => {
    const isEditionalisedRx = new RegExp(
        `^(${editions.join('|')})\/(${editionalised.join('|')})$`
    );
    const stripEditionRx = new RegExp(`^(${editions.join('|')})\/`);

    if (t) {
        let path = t.replace(/^\/|\/$/g, '');

        if (path.match(isEditionalisedRx)) {
            path = path.replace(stripEditionRx, '');
        }

        path = path.split('/');

        path = path.length === 2 && path[0] === path[1] ? [path[0]] : path;

        return path.join('/');
    }
    return '';
};

const getTopNavItems = () => {
    topNavItemsCache =
        topNavItemsCache ||
        $('.js-navigation-header .js-top-navigation a').map(item =>
            collapsePath(getPath($(item).attr('href')))
        );

    return topNavItemsCache;
};

const getPopularFiltered = opts => {
    const flush = opts && opts.flush;

    popularFilteredCache =
        (!flush && popularFilteredCache) ||
        getPopular({
            blacklist: getTopNavItems(),
            number: 10,
            weights: {
                content: 1,
                front: 5,
            },
            thresholds: {
                content: 5,
                front: 1,
            },
        });

    return popularFilteredCache;
};

const firstCsv = str => (str || '').split(',')[0];

const reset = () => {
    historyCache = undefined;
    summaryCache = undefined;
    local.remove(storageKeyHistory);
    local.remove(storageKeySummary);
};

const logHistory = pageConfig => {
    const pageId = pageConfig.pageId;
    let history;
    let foundCount = 0;

    if (!pageConfig.isFront) {
        history = getHistory().filter(item => {
            const isArr = Array.isArray(item);
            const found = isArr && item[0] === pageId;

            foundCount = found ? item[1] : foundCount;
            return isArr && !found;
        });

        history.unshift([pageId, foundCount + 1]);
        saveHistory(history.slice(0, historySize));
    }
};

const logSummary = (pageConfig, mockToday) => {
    const summary = pruneSummary(getSummary(), mockToday);
    const page = collapsePath(pageConfig.pageId);
    let isFront = false;

    const meta = pageMeta.reduceRight((tagMeta, tag) => {
        const tid = collapsePath(firstCsv(pageConfig[tag.tid]));
        const tname = tid && firstCsv(pageConfig[tag.tname]);

        if (tid && tname) {
            tagMeta[tid] = tname;
        }
        isFront = isFront || tid === page;
        return tagMeta;
    }, {});

    Object.keys(meta).forEach(tid => {
        const tname = meta[tid];
        const record = summary.tags[tid] || [];

        buckets.forEach(bucket => {
            record[bucket.indexInRecord] = record[bucket.indexInRecord] || [];
        });

        record[0] = tname;

        const visits = record[isFront ? 2 : 1];
        const todaysVisits = visits.find(day => day[0] === 0);

        if (todaysVisits) {
            todaysVisits[1] += 1;
        } else {
            visits.unshift([0, 1]);
        }

        summary.tags[tid] = record;
    });

    saveSummary(summary);
};

const getMegaNav = () => $('.js-global-navigation');

const removeFromMegaNav = () => {
    getMegaNav().each(megaNav => {
        fastdom.write(() => {
            $('.js-global-navigation__section--history', megaNav).remove();
        });
    });
    inMegaNav = false;
};

const tagHtml = (tag, index) =>
    template(viewTag, {
        id: tag[0],
        name: tag[1],
        index: index + 1,
    });

const showInMegaNav = () => {
    let tagsHTML;

    if (getSummary().showInMegaNav === false) {
        return;
    }

    if (inMegaNav) {
        removeFromMegaNav();
    }

    const tags = getPopularFiltered();

    if (tags.length) {
        tagsHTML = template(viewMegaNav, {
            tags: tags.map(tagHtml).join(''),
        });
        fastdom.write(() => {
            getMegaNav().prepend(tagsHTML);
        });
        inMegaNav = true;
    }
};

const showInMegaNavEnabled = () => getSummary().showInMegaNav !== false;

const showInMegaNavEnable = bool => {
    const summary = getSummary();

    summary.showInMegaNav = !!bool;

    if (summary.showInMegaNav) {
        showInMegaNav();
    } else {
        removeFromMegaNav();
    }

    saveSummary(summary);
};

export default {
    logHistory,
    logSummary,
    showInMegaNav,
    showInMegaNavEnable,
    showInMegaNavEnabled,
    getPopular,
    getPopularFiltered,
    getContributors,
    deleteFromSummary,
    isRevisit,
    reset,
    seriesSummary,
    mostViewedSeries,

    test: {
        getSummary,
        getHistory,
        pruneSummary,
        seriesSummary,
    },
};