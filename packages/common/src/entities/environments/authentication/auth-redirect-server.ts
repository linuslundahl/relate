import http from 'http';
import {workerData, parentPort, isMainThread} from 'worker_threads';
import url from 'url';

import {NotSupportedError, AuthenticationError} from '../../../errors';

if (isMainThread) {
    throw new NotSupportedError('OAuth redirect server must run in a worker thread');
}

const requestListener = (req: http.IncomingMessage, res: http.ServerResponse): void => {
    const {authToken} = url.parse(req.url || '', true).query;

    if (!authToken) {
        throw new AuthenticationError('Failed to authenticate');
    }

    if (parentPort && parentPort.postMessage) {
        parentPort.postMessage(authToken);
    }

    res.writeHead(200);
    res.write(
        '<script type="text/javascript">window.close()</script>You are authenticated, you can close this tab now.',
        () => {
            res.end(() => process.exit());
        },
    );
};

const server = http.createServer(requestListener);
server.listen({
    host: workerData.host,
    port: workerData.port,
});
