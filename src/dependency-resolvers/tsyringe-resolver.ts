import { container } from 'tsyringe-neo';
import { DependencyResolver } from '../types';

export class TsyringeResolver implements DependencyResolver {
  resolve<T>(token: any): T {
    return container.resolve(token);
  }
  registeredTokens() {
    return container.registeredTokens();
  }
}
