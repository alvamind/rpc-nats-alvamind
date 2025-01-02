import { connect } from 'nats';
import { getAllControllerMethods } from './nats-scanner';
export class NatsRpc {
    nc;
    handlers = new Map();
    isConnected = false;
    options;
    constructor(options) {
        this.options = options;
    }
    async ensureConnection() {
        if (!this.isConnected) {
            await this.connect();
        }
    }
    async connect() {
        if (!this.isConnected) {
            this.nc = await connect({ servers: this.options.natsUrl });
            this.isConnected = true;
            console.log(`[NATS] Connected to ${this.options.natsUrl}`);
            this.nc.closed().then(() => {
                console.log('[NATS] Connection closed');
                this.isConnected = false;
            });
        }
    }
    async call(subject, data) {
        await this.ensureConnection();
        try {
            const encodedData = new TextEncoder().encode(JSON.stringify(data));
            const response = await this.nc.request(subject, encodedData, {
                timeout: this.options.requestTimeout ?? 10000, // Increase timeout to 10 seconds or using default
            });
            const decodedData = new TextDecoder().decode(response.data);
            return JSON.parse(decodedData);
        }
        catch (error) {
            console.error(`[NATS] Error calling ${subject}:`, error);
            throw error;
        }
    }
    async register(subject, handler) {
        await this.ensureConnection();
        if (this.handlers.has(subject)) {
            console.warn(`[NATS] Handler already registered for subject: ${subject}`);
            return;
        }
        this.handlers.set(subject, handler);
        const subscription = this.nc.subscribe(subject);
        (async () => {
            for await (const msg of subscription) {
                try {
                    const decodedData = new TextDecoder().decode(msg.data);
                    const data = JSON.parse(decodedData);
                    const result = await handler(data);
                    const response = new TextEncoder().encode(JSON.stringify(result));
                    msg.respond(response);
                }
                catch (error) {
                    console.error(`[NATS] Error processing message for ${subject}:`, error);
                    if (this.options.errorHandler) {
                        this.options.errorHandler(error, subject);
                        const errorResponse = new TextEncoder().encode(JSON.stringify({ error: error.message }));
                        msg.respond(errorResponse);
                    }
                    else {
                        const errorResponse = new TextEncoder().encode(JSON.stringify({ error: error.message }));
                        msg.respond(errorResponse);
                    }
                }
            }
        })().catch((err) => console.error(`[NATS] Subscription error:`, err));
    }
    async registerController(token) {
        const instance = this.options.dependencyResolver.resolve(token);
        if (!instance)
            throw new Error(`Instance not found for token ${String(token)}`);
        const methods = getAllControllerMethods(instance, this.options.subjectPattern ?? ((className, methodName) => `${className}.${methodName}`));
        for (const { key, subject } of methods) {
            try {
                await this.register(subject, async (data) => {
                    return instance[key](data);
                });
            }
            catch (e) {
                console.error(`[NATS] Failed to register handler for ${subject} `, e);
            }
        }
    }
    close() {
        if (this.nc) {
            this.nc.close();
        }
    }
}
//# sourceMappingURL=nats-rpc.js.map