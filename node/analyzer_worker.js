const analyzer = require('./analyzer.js');

process.on('message', (msg) => {
    if (msg.type === 'start') {
        try {
            const result = analyzer.analyze(msg.trackPaths, msg.params, (pct, statusMsg) => {
                process.send({ type: 'progress', percent: pct, message: statusMsg });
            });
            process.send({ type: 'done', result: result });
        } catch (e) {
            process.send({ type: 'error', error: e.message });
        }
    }
});
