import { test, expect, describe } from 'bun:test';

import { parseArgs } from '../../src/cli/args';

describe('CLI argument parsing', () => {
    test('should parse HTTP request with default timeout', () => {
        const args = parseArgs(['--http', 'GET https://api.example.com/users']);

        expect(args).toMatchObject({
            http: "GET https://api.example.com/users",
            httpFile: undefined,
            httpFolder: undefined,
            timeout: 5000,
            verbose: false,
            bail: null,
            runInBand: false,
            concurrent: false,
            showAfterDone: false,
        })
    });

    test('should parse custom timeout', () => {
        const args = parseArgs(['--http', 'GET https://api.example.com', '-t', '5000']);

        expect(args).toMatchObject({
            http: "GET https://api.example.com",
            httpFile: undefined,
            httpFolder: undefined,
            timeout: 5000,
            verbose: false,
            bail: null,
            runInBand: false,
            concurrent: false,
            showAfterDone: false,
        })
    });

    test('should parse verbose flag', () => {
        const args = parseArgs(['--http', 'GET https://api.example.com', '-v']);

        expect(args).toMatchObject({
            http: "GET https://api.example.com",
            httpFile: undefined,
            httpFolder: undefined,
            timeout: 5000,
            verbose: true,
            bail: null,
            runInBand: false,
            concurrent: false,
            showAfterDone: false,
        })
    });

    test('should parse httpFile option', () => {
        const args = parseArgs(['--httpFile', './requests.http']);

        expect(args).toMatchObject({
            http: undefined,
            httpFile: "./requests.http",
            httpFolder: undefined,
            timeout: 5000,
            verbose: false,
            bail: null,
            runInBand: false,
            concurrent: false,
            showAfterDone: false,
        })
    });

    test('should parse httpFolder option', () => {
        const args = parseArgs(['--httpFolder', './requests']);

        expect(args).toMatchObject({
            http: undefined,
            httpFile: undefined,
            httpFolder: "./requests",
            timeout: 5000,
            verbose: false,
            bail: null,
            runInBand: false,
            concurrent: false,
            showAfterDone: false,
        })
    });

    test('should parse --bail option with default count 1', () => {
        const args = parseArgs(['--http', 'GET https://api.example.com', '--bail']);

        expect(args).toMatchObject({
            http: "GET https://api.example.com",
            httpFile: undefined,
            httpFolder: undefined,
            timeout: 5000,
            verbose: false,
            bail: 1,
            runInBand: false,
            concurrent: false,
            showAfterDone: false,
        })
    });

    test('should parse --bail=<n> option', () => {
        const args = parseArgs(['--http', 'GET https://api.example.com', '--bail=3']);

        expect(args).toMatchObject({
            bail: 3,
            runInBand: false,
            concurrent: false,
            showAfterDone: false,
        })
    });

    test('should parse execution and reporting flags', () => {
        const args = parseArgs(['--http', 'GET https://api.example.com', '--runInBand', '--showAfterDone']);

        expect(args).toMatchObject({
            runInBand: true,
            concurrent: false,
            showAfterDone: true,
        })
    });
});
