const analyzer = require('./analyzer.js');

let inputData = '';

process.stdin.setEncoding('utf8');

process.stdin.on('data', (chunk) => {
    inputData += chunk;
});

process.stdin.on('end', () => {
    try {
        const msg = JSON.parse(inputData);
        const result = analyzer.analyze(msg.trackPaths, msg.params, (pct, statusMsg) => {
            console.log(JSON.stringify({ type: 'progress', percent: pct, message: statusMsg }));
        });
        console.log(JSON.stringify({ type: 'done', result: result }));
        process.exit(0);
    } catch (e) {
        console.log(JSON.stringify({ type: 'error', error: e.message }));
        process.exit(1);
    }
});
