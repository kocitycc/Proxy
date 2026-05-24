import { AxiosResponse, AxiosError } from 'axios';

export interface config {
    name: string,
    authServer: string,
    publicAddr: string,
    maxPlayers: number,
    external: {
        port: number,
    },
    internal: {
        host: string,
        port: number,
    },
    redis: {
        host: string,
        port: number,
        password?: string,
    },
    postgres: string,
    secret: string,
}

export interface authErrorData {
    type: string,
    message: string,
}

export interface authResponse extends AxiosResponse {
    data: {
        username: string,
        color?: string,
        velanID?: number,
    }
}

export interface authError extends AxiosError {
    response?: AxiosResponse<unknown, any> & {
        data?: authErrorData
    }
}
