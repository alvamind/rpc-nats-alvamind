import { container } from 'tsyringe-neo';
export class TsyringeResolver {
    resolve(token) {
        return container.resolve(token);
    }
    registeredTokens() {
        return container.registeredTokens();
    }
}
//# sourceMappingURL=tsyringe-resolver.js.map