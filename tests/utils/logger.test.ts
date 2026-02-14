import { test, expect, spyOn } from 'bun:test';
import { logger } from '../../src/utils/logger';

test('Logger should log messages correctly based on verbose mode and method', () => {
    
    // @ts-ignore - accessing private property for testing
    const debugSpy = spyOn(logger['pinoLogger'], 'debug');
    // @ts-ignore
    const infoSpy = spyOn(logger['pinoLogger'], 'info');
    // @ts-ignore
    const errorSpy = spyOn(logger['pinoLogger'], 'error');

    // Test debug doesn't log when verbose is false
    logger.debug('debug message');
    expect(debugSpy).not.toHaveBeenCalled();

    // Test debug logs when verbose is true
    logger.setVerbose(true);
    logger.debug('debug message 2');
    expect(debugSpy).toHaveBeenCalledWith('debug message 2');

    // Test info always logs
    logger.info('info message');
    expect(infoSpy).toHaveBeenCalledWith('info message');

    // Test error without error object
    logger.error('error message');
    expect(errorSpy).toHaveBeenCalledWith('error message');

    // Test error with error object
    const testError = new Error('test error');
    logger.error('error with error', testError);
    expect(errorSpy).toHaveBeenCalledWith({ err: testError }, 'error with error');
});
