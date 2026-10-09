import { describe, it, expect, beforeEach } from 'vitest';
import { appState, ViewMode } from '../../src/lib/state.svelte.js';
import { Transform } from '../../src/lib/transforms.js';
import { parseUrlState, serializeUrlState, restoreFromUrl, writeUrlState } from '../../src/lib/url-state.js';

describe('parseUrlState', () => {
    it('parses every supported field', () => {
        expect(parseUrlState('#q=30&t=cdf97&cs=420&v=subbands&img=3')).toEqual({
            quality: 30,
            transformType: Transform.CDF97,
            csMode: 420,
            viewMode: ViewMode.Subbands,
            testImage: 3
        });
    });

    it('returns an empty state for an empty hash', () => {
        expect(parseUrlState('')).toEqual({});
        expect(parseUrlState('#')).toEqual({});
    });

    it('ignores invalid or out-of-range values', () => {
        expect(parseUrlState('#q=0&t=jpeg&cs=411&v=nope&img=-1')).toEqual({});
        expect(parseUrlState('#q=101')).toEqual({});
        expect(parseUrlState('#q=5.5')).toEqual({});
    });
});

describe('serializeUrlState', () => {
    it('round-trips through parseUrlState', () => {
        const state = {
            quality: 75,
            transformType: Transform.Haar,
            csMode: 422,
            viewMode: ViewMode.Artifacts,
            testImage: 12
        };
        expect(parseUrlState('#' + serializeUrlState(state))).toEqual(state);
    });

    it('omits fields that are unset or have no URL form', () => {
        expect(serializeUrlState({ quality: 50, viewMode: ViewMode.BlockingMap })).toBe('q=50');
    });
});

describe('restoreFromUrl', () => {
    beforeEach(() => {
        appState.quality = 50;
        appState.transformType = Transform.DCT;
        appState.currentCsMode = 444;
        appState.currentViewMode = ViewMode.RGB;
    });

    it('applies settings to appState', () => {
        restoreFromUrl('#q=20&t=haar&cs=420&v=y');
        expect(appState.quality).toBe(20);
        expect(appState.transformType).toBe(Transform.Haar);
        expect(appState.currentCsMode).toBe(420);
        expect(appState.currentViewMode).toBe(ViewMode.Y);
    });

    it('leaves appState alone for missing fields', () => {
        restoreFromUrl('#t=cdf97');
        expect(appState.quality).toBe(50);
        expect(appState.transformType).toBe(Transform.CDF97);
    });
});

describe('writeUrlState', () => {
    it('replaces the hash without adding history entries', () => {
        const before = history.length;
        writeUrlState({ quality: 42, transformType: Transform.CDF97 });
        expect(location.hash).toBe('#q=42&t=cdf97');
        expect(history.length).toBe(before);
    });
});
