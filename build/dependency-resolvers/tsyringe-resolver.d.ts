import { DependencyResolver } from '../types';
export declare class TsyringeResolver implements DependencyResolver {
    resolve<T>(token: any): T;
    registeredTokens(): import("tsyringe-neo").InjectionToken<any>[];
}
