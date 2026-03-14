'use strict';

function runJsonWorker(handler) {
    if (typeof handler !== 'function') {
        throw new Error('runJsonWorker requires a handler function.');
    }

    var inputData = '';
    process.stdin.setEncoding('utf8');

    process.stdin.on('data', function (chunk) {
        inputData += chunk;
    });

    process.stdin.on('end', function () {
        try {
            var msg = JSON.parse(inputData || '{}');
            var progress = function (pct, message) {
                console.log(JSON.stringify({
                    type: 'progress',
                    percent: pct,
                    message: message
                }));
            };

            Promise.resolve(handler(msg, progress))
                .then(function (result) {
                    console.log(JSON.stringify({ type: 'done', result: result }));
                    process.exit(0);
                })
                .catch(function (err) {
                    console.log(JSON.stringify({
                        type: 'error',
                        error: err && err.message ? err.message : String(err)
                    }));
                    process.exit(1);
                });
        } catch (e) {
            console.log(JSON.stringify({
                type: 'error',
                error: e && e.message ? e.message : String(e)
            }));
            process.exit(1);
        }
    });
}

module.exports = {
    runJsonWorker: runJsonWorker
};
