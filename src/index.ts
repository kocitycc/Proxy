import axios from 'axios';
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import config from './config';
import { createClient } from 'redis';
import { PrismaClient } from '@prisma/client'

import Logger from './logger.js'

const AXIOS_TIMEOUT_MS = 30_000;

import { authError, authResponse, authErrorData } from './interfaces'

const log = new Logger();

if (config.name == "ServerName") log.warn("Please change the name in the config.json or via the environment (SERVER_NAME)");

const redis = createClient({
    socket: {
        host: config.redis.host,
        port: config.redis.port,
    },
    password: config.redis.password,
});
const prisma = new PrismaClient({
    datasources: {
        db: {
            url: config.postgres,
        }
    }
});

redis.connect().then(() => {
    log.info("Connected to Redis");
}).catch((err: any) => {
    log.fatal("Failed to connect to Redis");
    log.fatal(err.message);
    log.fatal(err.stack ? err.stack.toString() : '');
    process.exit(1);
});
prisma.$connect().then(() => {
    log.info("Connected to Postgres");
}).catch((err: any) => {
    log.fatal("Failed to connect to Postgres");
    log.fatal(err.message);
    log.fatal(err.stack ? err.stack.toString() : '');
    process.exit(1);
});

const app = express();

app.use(express.json());

const blockedUnauthenticatedPaths = new Set([
    '/api/auth',
]);

function isBlockedUnauthenticatedPath(path: string) {
    return blockedUnauthenticatedPaths.has(path) || path.startsWith('/api/auth/');
}

app.get('/stats/status', async (req, res) => {
    res.send({
        status: "OK",
        version: require('../package.json').version,
        uptime: process.uptime(),
        connections: (await redis.KEYS('user:session:*')).length,
        maxConnections: config.maxPlayers,
    });
});

app.get("/stats/preflight", (req, res) => {
    res.send({})
});

app.use(async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    log.info(`Request from ${req.ip} to ${req.url}`);
    res.set('X-Powered-By', 'KoCity Proxy');

    const credentials = req.body?.credentials;

    if (!credentials) {
        if (req.method === 'POST' && isBlockedUnauthenticatedPath(req.path)) {
            log.info("Blocked unauthenticated auth endpoint request");
            return res.status(401).send("Unauthorized");
        }

        return next();
    }

    const authkey = credentials.username

    if (typeof authkey !== 'string' || authkey.length === 0) {
        log.info("Invalid credentials");
        return res.status(401).send("Invalid credentials");
    }

    const response: null | authResponse = await axios.post(`${config.authServer}/auth/validate`, {
        authkey,
        server: config.publicAddr
    }, { timeout: AXIOS_TIMEOUT_MS }).catch((err: authError): null => {
        res.status(401).send("Unauthorized");
        if (err.response) log.err(`${(err.response.data as authErrorData).type} ${(err.response.data as authErrorData).message}`);
        else log.err(err.message);
        return null;
    });

    if (!response) return log.info("Request denied");

    if (!response.data?.username) {
        log.info("Request denied");
        return res.status(401).send("Unauthorized");
    }

    const masterId = response.data.velanID;

    let localUser: any = null;

    if (masterId) {
        localUser = await prisma.users.findUnique({
            where: { nucleus_id: BigInt(masterId) }
        });
    }

    if (!localUser) {
        localUser = await prisma.users.findFirst({
            where: {
                publisher_username: {
                    equals: response.data.username,
                    mode: 'insensitive'
                }
            }
        });
    }

    if (!localUser) {
        localUser = await prisma.users.findFirst({
            where: {
                OR: [
                    { username: { equals: response.data.username, mode: 'insensitive' } },
                    { username: { endsWith: `:${response.data.username}`, mode: 'insensitive' } },
                    { username: { equals: response.data.username, mode: 'insensitive' } }
                ]
            }
        });
    }

    let velanID: number | undefined;

    if (!localUser) {
        log.info(`Local user ${response.data.username} not found. Registering...`);
        const registrationPayload = {
            credentials: {
                ...req.body.credentials,
                username: response.data.username,
            },
            auth_provider: "dev"
        };

        const createdUser = await axios.post(`http://${config.internal.host}:${config.internal.port}/api/auth`, registrationPayload, { timeout: AXIOS_TIMEOUT_MS }).catch((err: any): null => {
            if (err.response) {
                log.err(`Failed to register user: ${err.response.status}`);
                log.err(`Error Details: ${JSON.stringify(err.response.data)}`);
                log.err(`Registering user: ${response.data.username}`);
            } else {
                log.err(`Failed to register user: ${err.message}`);
            }
            return null;
        });

        if (createdUser && createdUser.data && createdUser.data.user) {
            velanID = createdUser.data.user.id.velan;
            log.info(`Registered user ${response.data.username} with ID ${velanID}`);
            localUser = await prisma.users.findUnique({ where: { id: BigInt(velanID!) } });
        } else {
            log.info(`Aborting connection for ${response.data.username} - registration failed.`);
            return res.status(500).send("Registration Failed");
        }
    } else {
        velanID = Number(localUser.id);
    }

    if (masterId && String(localUser.nucleus_id) !== String(masterId)) {
        log.info(`Bonding VelanID ${velanID} to Master ID ${masterId}...`);
    }

    await axios.post(`${config.authServer}/auth/connect`, {
        authkey,
        server: config.publicAddr,
        velanID
    }, { timeout: AXIOS_TIMEOUT_MS }).catch((err: authError) => {
        log.err(`Failed to sync authkey to Auth Server: ${err.message}`);
    });

    response.data.velanID = velanID;

    const coloredName = `${response.data.color ? `:${response.data.color}FF:` : ''}${response.data.username}`;

    if (localUser && localUser.username !== coloredName) {
        log.info(`Updated embedded color schema for user ${response.data.username}`);
    }

    await prisma.users.update({
        where: { id: BigInt(velanID!) },
        data: {
            nucleus_id: masterId ? BigInt(masterId) : null,
            username: coloredName,
            last_authenticated_at: BigInt(Date.now()),
            last_authenticated_platform: "win64",
            last_authenticated_persona_namespace: "cc"
        }
    });

    log.info(`Request accepted for ${response.data.username}`);

    req.body.credentials.username = `${response.data.color ? `:${response.data.color}FF:` : ''}${response.data.username}`
    req.body.auth_provider = 'dev'
    req.headers['content-length'] = Buffer.byteLength(JSON.stringify(req.body)).toString();
    next();
})

const proxy = createProxyMiddleware({
    target: `http://${config.internal.host}:${config.internal.port}`,
    changeOrigin: true,
    ws: true,
    logLevel: 'silent',
    onProxyReq: (proxyReq, req, res, options) => {
        if (req.url.includes('status')) return;
        proxyReq.end(JSON.stringify(req.body));
    },
    onError: (err: any, req, res) => {
        if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
        log.err(`Proxy error: ${err.message}`);
    }
})

app.all('*', proxy)

const server = app.listen(config.external.port, () => {
    log.info(`Listening on port ${config.external.port}`);
});

server.on('upgrade', (req: any, socket: any) => {
    socket.on('error', (err: any) => {
        if (err.code === 'EPIPE' || err.code === 'ECONNRESET') return;
        log.err(`WebSocket error: ${err.message}`);
    });
});

async function sendHeartbeat(silent: boolean = true) {
    try {
        const keys = await redis.KEYS('user:session:*');
        const playerCount = keys.length;

        await axios.post(`${config.authServer}/stats/servers/heartbeat`, {
            ip: config.publicAddr,
            players: playerCount,
            secret: config.secret
        }, { timeout: AXIOS_TIMEOUT_MS });

        if (!silent) log.info(`Sent heartbeat: ${playerCount} players`);
    } catch (err: any) {
        log.err(`Failed to send heartbeat: ${err.message}`);
    }
}

setTimeout(() => {
    sendHeartbeat(false);
    setInterval(() => sendHeartbeat(true), 60 * 1000);
}, 5000);

process.on('uncaughtException', function (err: Error) {
    if ((err as any).code === 'EPIPE' || (err as any).code === 'ECONNRESET') return;
    log.fatal(err.message);
    log.fatal(err.stack ? err.stack.toString() : '');
});

process.on('unhandledRejection', function (err: Error) {
    log.fatal(err.message);
    log.fatal(err.stack ? err.stack.toString() : '');
});
