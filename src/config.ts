import fs from "fs";
import type { config as AppConfig } from "./interfaces";

const fromFile: Partial<AppConfig> = fs.existsSync("./config.json")
    ? JSON.parse(fs.readFileSync("./config.json", "utf8")) as Partial<AppConfig>
    : {};

const maxPlayersRaw = process.env.MAX_PLAYERS ?? fromFile.maxPlayers;
const maxPlayersParsed =
    typeof maxPlayersRaw === "number" ? maxPlayersRaw : parseInt(String(maxPlayersRaw), 10);

export default {
    name: process.env.SERVER_NAME || fromFile.name || "ServerName",
    authServer: process.env.AUTH_SERVER || fromFile.authServer || "",
    publicAddr: process.env.PUBLIC_ADDRESS || fromFile.publicAddr || "",
    maxPlayers: Number.isFinite(maxPlayersParsed) ? maxPlayersParsed : 50,
    external: {
        port: Number(process.env.EXTERNAL_PORT || fromFile.external?.port || 23500),
    },
    internal: {
        host: process.env.INTERNAL_HOST || fromFile.internal?.host || "127.0.0.1",
        port: Number(process.env.INTERNAL_PORT || fromFile.internal?.port || 23600),
    },
    redis: {
        host: process.env.REDIS_HOST || fromFile.redis?.host || "127.0.0.1",
        port: Number(process.env.REDIS_PORT || fromFile.redis?.port || 6379),
        password: process.env.REDIS_PASSWORD || fromFile.redis?.password || undefined,
    },
    postgres: process.env.DATABASE_URL || fromFile.postgres || "",
    secret: process.env.SERVER_SECRET || fromFile.secret || "",
} satisfies AppConfig;
